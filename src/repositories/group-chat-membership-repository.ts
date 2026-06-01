import type { GroupMember, GroupChatMonitor } from "../types.js";
import type { Store } from "../utils/db/root.js";

export class GroupChatMembershipRepository {
  constructor(private readonly store: Store) {}

  async registerMonitor(
    groupTelegramId: string,
    groupTitle: string,
    monitorUserId: number
  ): Promise<void> {
    await this.store.write(
      "group_chats.register_monitor",
      groupTelegramId,
      groupTitle,
      monitorUserId,
      new Date().toISOString()
    );
  }

  async reconcile(groupTelegramId: string, members: GroupMember[], syncedAt: string): Promise<void> {
    const humans = members.filter((member) => !member.isBot);
    const payload = humans.map((member) => ({
      member_user_id: member.userId,
      username: member.username ?? "",
      first_name: member.firstName,
      last_name: member.lastName,
      is_bot: member.isBot,
      is_premium: member.isPremium ?? null,
      phone: member.phone ?? ""
    }));

    await this.store.write("group_chat_members.reconcile", groupTelegramId, payload, syncedAt);
  }

  async updateAfterCountCheck(
    groupTelegramId: string,
    participantCount: number,
    checkedAt: string
  ): Promise<void> {
    await this.store.write(
      "group_chats.update_after_count_check",
      groupTelegramId,
      participantCount,
      checkedAt
    );
  }

  async updateAfterFullSync(
    groupTelegramId: string,
    participantCount: number,
    syncedAt: string
  ): Promise<void> {
    await this.store.write(
      "group_chats.update_after_full_sync",
      groupTelegramId,
      participantCount,
      syncedAt
    );
  }

  async listMonitorsForSync(): Promise<GroupChatMonitor[]> {
    return this.store.read<GroupChatMonitor[]>("group_chats.list_monitors_for_sync");
  }

  async getStillInGcByUserId(groupTelegramId: string): Promise<Map<string, boolean>> {
    const rows = await this.store.read<Array<{ memberUserId: string; stillInGc: boolean }>>(
      "group_chat_members.still_in_gc_by_group",
      0,
      groupTelegramId
    );
    return new Map(rows.map((row) => [row.memberUserId, row.stillInGc]));
  }
}
