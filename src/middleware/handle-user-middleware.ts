import type { Store } from "../utils/db/root.js";
import type { Analytics } from "../utils/analytics.js";

export type TelegramUser = {
  telegramId: number;
  username: string;
  firstName: string;
  lastName: string;
};

export class HandleUserMiddleware {
  constructor(
    private readonly store: Store,
    private readonly analytics?: Analytics
  ) {}

  async ensureUser(user: TelegramUser, chatId: number): Promise<void> {
    if (user.telegramId === 0) {
      this.analytics?.trackEvent("user_ensure_rejected", {
        status: "invalid",
        reason: "zero_telegram_id",
        chatId
      });
      throw new Error("invalid_telegram_user");
    }

    const now = new Date().toISOString();
    await this.store.write(
      "users.upsert",
      user.telegramId,
      user.username,
      user.firstName,
      user.lastName,
      now
    );
    await this.store.write("group_chats.upsert_if_needed", chatId, now);
  }
}
