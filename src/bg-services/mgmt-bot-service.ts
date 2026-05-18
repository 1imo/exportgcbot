import { Telegraf, type TelegrafBot } from "../utils/telegraf.js";
import { ClientNotificationService } from "../services/client-notification-service.js";
import type { Logger } from "../utils/logger.js";

export class MgmtBotService {
  private bot?: TelegrafBot;

  constructor(
    private readonly token: string | undefined,
    private readonly bindRoutes: (bot: TelegrafBot) => void,
    private readonly notifications: ClientNotificationService,
    private readonly logger: Logger
  ) {}

  async start(): Promise<void> {
    if (!this.token) {
      this.logger.warn("mgmt_bot_not_started_missing_token");
      return;
    }
    const bot = new Telegraf(this.token);
    this.bindRoutes(bot);
    // Attach early so notification sends work during startup too.
    this.notifications.attachBot(bot);
    this.bot = bot;
    this.logger.info("mgmt_bot_launching");
    try {
      // Explicit probe so failures (invalid token / network / DNS) are visible before long-polling.
      const me = await bot.telegram.getMe();
      this.logger.info("mgmt_bot_identity_ok", { username: me.username, id: me.id });
      await bot.launch();
      this.logger.info("mgmt_bot_started");
    } catch (error) {
      this.bot = undefined;
      this.logger.error("mgmt_bot_launch_failed", { error: String(error) });
    }
  }

  async stop(): Promise<void> {
    this.bot?.stop();
  }
}
