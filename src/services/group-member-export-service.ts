import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { GroupMember, GroupSummary } from "../types.js";
import type { Logger } from "../utils/logger.js";

const MAX_GROUPS_IN_KEYBOARD = 40;

export class GroupMemberExportService {
  constructor(private readonly logger: Logger) {}

  async listGroups(client: TelegramClient): Promise<GroupSummary[]> {
    const dialogs = await client.getDialogs({ limit: undefined });
    const groups: GroupSummary[] = [];

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity) continue;

      if (entity instanceof Api.Chat) {
        groups.push({
          chatId: String(entity.id),
          title: dialog.title || entity.title || "Unnamed group"
        });
        continue;
      }

      if (entity instanceof Api.Channel && entity.megagroup) {
        groups.push({
          chatId: String(dialog.id ?? entity.id),
          title: dialog.title || entity.title || "Unnamed group"
        });
      }
    }

    groups.sort((a, b) => a.title.localeCompare(b.title));
    return groups.slice(0, MAX_GROUPS_IN_KEYBOARD);
  }

  async fetchMembers(client: TelegramClient, chatId: string): Promise<GroupMember[]> {
    const members: GroupMember[] = [];

    for await (const participant of client.iterParticipants(chatId)) {
      if (!(participant instanceof Api.User)) continue;
      members.push({
        userId: String(participant.id),
        username: participant.username ?? undefined,
        firstName: participant.firstName ?? "",
        lastName: participant.lastName ?? "",
        isBot: participant.bot === true,
        isPremium:
          participant.premium === true ? true : participant.premium === false ? false : undefined,
        phone: participant.phone ?? undefined
      });
    }

    this.logger.info("group_members_fetched", { chatId, count: members.length });
    return members;
  }

  async getMemberCount(client: TelegramClient, chatId: string): Promise<number | null> {
    try {
      const entity = await client.getEntity(chatId);

      if (entity instanceof Api.Channel) {
        const result = await client.invoke(
          new Api.channels.GetFullChannel({
            channel: entity
          })
        );
        if (result.fullChat instanceof Api.ChannelFull) {
          return result.fullChat.participantsCount ?? null;
        }
        return null;
      }

      if (entity instanceof Api.Chat) {
        const result = await client.invoke(
          new Api.messages.GetFullChat({
            chatId: entity.id
          })
        );
        if (result.fullChat instanceof Api.ChatFull) {
          const participants = result.fullChat.participants;
          if (participants instanceof Api.ChatParticipants) {
            return participants.participants.length;
          }
        }
        return null;
      }

      return null;
    } catch (error) {
      this.logger.warn("group_member_count_failed", { chatId, error: String(error) });
      return null;
    }
  }
}
