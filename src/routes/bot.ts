import type { TelegrafBot, TextMessageContext } from "../utils/telegraf.js";
import type { BotController } from "../controllers/bot-controller.js";
import type { HandleUserMiddleware } from "../middleware/handle-user-middleware.js";

export type BotRouteDeps = {
  controller: BotController;
  handleUserMiddleware: HandleUserMiddleware;
};

export class BotRoutes {
  constructor(
    private readonly bot: TelegrafBot,
    private readonly deps: BotRouteDeps
  ) {}

  bind(): void {
    const { controller, handleUserMiddleware } = this.deps;

    this.bot.on("text", async (ctx) => {
      const message = ctx as TextMessageContext;
      const userId = message.from?.id;
      const chatId = message.chat?.id;
      const text = message.message.text;
      if (!userId || !text) return;

      await handleUserMiddleware.ensureUser(
        {
          telegramId: userId,
          username: message.from?.username ?? "",
          firstName: message.from?.first_name ?? "",
          lastName: message.from?.last_name ?? ""
        },
        chatId ?? userId
      );

      if (text.startsWith("/")) {
        const command = text.split(/\s+/)[0].toLowerCase();
        if (command === "/start") {
          await controller.handleStart(userId);
        }
        return;
      }

      await controller.handleText(
        {
          userId,
          username: message.from?.username ?? ""
        },
        text
      );
    });
  }
}
