import type { GroupChatMembershipRepository } from "../repositories/group-chat-membership-repository.js";
import type { GroupMemberExportRepository } from "../repositories/group-member-export-repository.js";
import type { SessionRepository } from "../repositories/session-repository.js";
import type { TdlibListenerService } from "../bg-services/tdlib-listener-service.js";
import type { GroupMemberExportService } from "../services/group-member-export-service.js";
import type { ClientNotificationService } from "../services/client-notification-service.js";
import type { GroupSummary, ServiceUser } from "../types.js";
import type { Analytics } from "../utils/analytics.js";
import {
  CANCEL_BUTTON,
  GROUPS_BUTTON,
  cancelKeyboard,
  groupPickerKeyboard,
  mainMenuKeyboard,
  truncateKeyboardLabel
} from "../utils/bot-keyboards.js";
import { chunkLines, formatMemberExportLine } from "../utils/telegram-links.js";
import type { Logger } from "../utils/logger.js";

type GroupOption = {
  label: string;
  chatId: string;
  title: string;
};

type PickerState =
  | { mode: "idle" }
  | { mode: "picking_group"; options: GroupOption[] };

export class GroupPickerUseCase {
  private readonly state = new Map<number, PickerState>();

  constructor(
    private readonly sessions: SessionRepository,
    private readonly tdlib: TdlibListenerService,
    private readonly groupExport: GroupMemberExportService,
    private readonly membership: GroupChatMembershipRepository,
    private readonly exports: GroupMemberExportRepository,
    private readonly notifications: ClientNotificationService,
    private readonly analytics: Analytics,
    private readonly logger: Logger
  ) {}

  async showMainMenu(userId: number): Promise<void> {
    await this.notifications.sendToClient(
      String(userId),
      "Tap Groups to pick a group and export member links.",
      mainMenuKeyboard()
    );
    this.state.set(userId, { mode: "idle" });
  }

  async onText(user: ServiceUser, text: string): Promise<void> {
    const session = await this.sessions.findByUserId(String(user.userId));
    if (!session?.active) {
      await this.notifications.sendToClient(
        String(user.userId),
        "Complete onboarding first with /start."
      );
      return;
    }

    const trimmed = text.trim();
    const current = this.state.get(user.userId) ?? { mode: "idle" };

    if (trimmed === CANCEL_BUTTON) {
      await this.showMainMenu(user.userId);
      return;
    }

    if (trimmed === GROUPS_BUTTON) {
      await this.beginGroupSelection(user);
      return;
    }

    if (current.mode === "picking_group") {
      const match = current.options.find((option) => option.label === trimmed);
      if (!match) {
        await this.notifications.sendToClient(
          String(user.userId),
          "Choose a group from the keyboard, tap Groups to refresh, or tap Cancel.",
          groupPickerKeyboard(current.options.map((option) => option.label))
        );
        return;
      }
      await this.exportGroup(user, match);
      return;
    }

    await this.notifications.sendToClient(
      String(user.userId),
      `Tap ${GROUPS_BUTTON} to export members from one of your groups.`,
      mainMenuKeyboard()
    );
  }

  private async beginGroupSelection(user: ServiceUser): Promise<void> {
    const client = this.tdlib.getClient(String(user.userId));
    if (!client) {
      await this.notifications.sendToClient(
        String(user.userId),
        "Your Telegram session is not connected. Send /start to reconnect."
      );
      return;
    }

    await this.notifications.sendToClient(String(user.userId), "Loading your groups…");

    try {
      const groups = await this.groupExport.listGroups(client);
      if (groups.length === 0) {
        await this.showMainMenu(user.userId);
        await this.notifications.sendToClient(String(user.userId), "No groups found on this account.");
        return;
      }

      const options = this.buildGroupOptions(groups);
      this.state.set(user.userId, { mode: "picking_group", options });
      this.analytics.trackEvent("group_picker_opened", {
        userId: user.userId,
        groupCount: options.length
      });
      await this.notifications.sendToClient(
        String(user.userId),
        "Select a group:",
        groupPickerKeyboard(options.map((option) => option.label))
      );
    } catch (error) {
      this.logger.error("group_picker_list_failed", { userId: user.userId, error: String(error) });
      await this.showMainMenu(user.userId);
      await this.notifications.sendToClient(
        String(user.userId),
        "Could not load groups. Try again in a moment."
      );
    }
  }

  private buildGroupOptions(groups: GroupSummary[]): GroupOption[] {
    const usedLabels = new Map<string, number>();
    return groups.map((group) => {
      const base = truncateKeyboardLabel(group.title);
      const seen = usedLabels.get(base) ?? 0;
      usedLabels.set(base, seen + 1);
      const label = seen === 0 ? base : `${base} (${seen + 1})`;
      return { label, chatId: group.chatId, title: group.title };
    });
  }

  private async exportGroup(user: ServiceUser, group: GroupOption): Promise<void> {
    const client = this.tdlib.getClient(String(user.userId));
    if (!client) {
      await this.showMainMenu(user.userId);
      await this.notifications.sendToClient(
        String(user.userId),
        "Your Telegram session is not connected. Send /start to reconnect."
      );
      return;
    }

    await this.notifications.sendToClient(
      String(user.userId),
      `Fetching members for “${group.title}”…`,
      cancelKeyboard()
    );

    try {
      const members = await this.groupExport.fetchMembers(client, group.chatId);
      const humans = members.filter((member) => !member.isBot);
      const syncedAt = new Date().toISOString();

      await this.membership.registerMonitor(group.chatId, group.title, user.userId);
      await this.membership.reconcile(group.chatId, members, syncedAt);

      const participantCount =
        (await this.groupExport.getMemberCount(client, group.chatId)) ?? humans.length;
      await this.membership.updateAfterFullSync(group.chatId, participantCount, syncedAt);

      const stillInGcByUserId = await this.membership.getStillInGcByUserId(group.chatId);
      const humansWithPresence = humans.map((member) => ({
        ...member,
        stillInGc: stillInGcByUserId.get(member.userId) ?? true
      }));

      await this.exports.saveExport(user, group.chatId, group.title, humansWithPresence);

      const links = humansWithPresence.map((member) => formatMemberExportLine(member));
      if (links.length === 0) {
        await this.showMainMenu(user.userId);
        await this.notifications.sendToClient(
          String(user.userId),
          `No members found in “${group.title}”.`
        );
        return;
      }

      this.analytics.trackEvent("group_export_completed", {
        userId: user.userId,
        groupId: group.chatId,
        memberCount: links.length
      });

      const header = `Members of “${group.title}” (${links.length}):\n`;
      const chunks = chunkLines(links);
      for (let i = 0; i < chunks.length; i++) {
        const prefix = i === 0 ? header : `Members (continued ${i + 1}/${chunks.length}):\n`;
        await this.notifications.sendToClient(String(user.userId), `${prefix}${chunks[i]}`);
      }
      await this.showMainMenu(user.userId);
    } catch (error) {
      this.logger.error("group_export_failed", {
        userId: user.userId,
        groupId: group.chatId,
        error: String(error)
      });
      await this.showMainMenu(user.userId);
      await this.notifications.sendToClient(
        String(user.userId),
        "Export failed. Check that your account can see members in that group, then try again."
      );
    }
  }
}
