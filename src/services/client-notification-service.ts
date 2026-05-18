import type { TelegrafBot } from "../utils/telegraf.js";
import { Logger } from "../utils/logger.js";

export class ClientNotificationService {
  private bot?: TelegrafBot;

  constructor(private readonly logger: Logger) {}

  attachBot(bot: TelegrafBot): void {
    this.bot = bot;
  }

  async sendToClient(
    clientUserId: string,
    text: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.bot) {
      this.logger.warn("client_notification_skipped_bot_unavailable", { clientUserId });
      return false;
    }

    const userId = Number(clientUserId);
    if (!Number.isFinite(userId)) {
      this.logger.warn("client_notification_skipped_invalid_user_id", { clientUserId });
      return false;
    }

    try {
      await this.bot.telegram.sendMessage(userId, text, extra);
      this.logger.info("client_notification_sent", { clientUserId });
      return true;
    } catch (error) {
      this.logger.error("client_notification_failed", { clientUserId, error: String(error) });
      return false;
    }
  }
}
