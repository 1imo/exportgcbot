import { env } from "./utils/env.js";
import { Store } from "./utils/db/root.js";
import process from "node:process";
import { AuthHttpService } from "./bg-services/auth-http-service.js";
import { MgmtBotService } from "./bg-services/mgmt-bot-service.js";
import { TdlibListenerService } from "./bg-services/tdlib-listener-service.js";
import { BotController } from "./controllers/bot-controller.js";
import { HandleUserMiddleware } from "./middleware/handle-user-middleware.js";
import { SessionRepository } from "./repositories/session-repository.js";
import { GroupMemberExportRepository } from "./repositories/group-member-export-repository.js";
import { AuthChallengeService } from "./services/auth-challenge-service.js";
import { ClientNotificationService } from "./services/client-notification-service.js";
import { GroupMemberExportService } from "./services/group-member-export-service.js";
import { OnboardingUseCase } from "./use-cases/onboarding.js";
import { GroupPickerUseCase } from "./use-cases/group-picker.js";
import { BotRoutes } from "./routes/bot.js";
import { Analytics } from "./utils/analytics.js";
import { Logger } from "./utils/logger.js";

export const store = new Store();

void startApp();

export async function startApp(): Promise<void> {
  const logger = new Logger();
  const analytics = new Analytics(store, logger);
  const handleUserMiddleware = new HandleUserMiddleware(store, analytics);
  const sessions = new SessionRepository(store);
  const groupExports = new GroupMemberExportRepository(store);
  const authChallenges = new AuthChallengeService();
  const notifications = new ClientNotificationService(logger);
  const groupMemberExport = new GroupMemberExportService(logger);

  const tdlibService = new TdlibListenerService(
    env.TELEGRAM_API_ID,
    env.TELEGRAM_API_HASH,
    env.TELEGRAM_USE_WSS,
    env.TELEGRAM_CONNECT_TIMEOUT_MS,
    logger
  );

  const groupPicker = new GroupPickerUseCase(
    sessions,
    tdlibService,
    groupMemberExport,
    groupExports,
    notifications,
    analytics,
    logger
  );

  const onboarding = new OnboardingUseCase(
    authChallenges,
    sessions,
    tdlibService,
    notifications,
    analytics,
    logger
  );
  onboarding.attachGroupPicker(groupPicker);

  const authHttpService = new AuthHttpService(env.AUTH_HTTP_PORT, authChallenges, logger);
  const botController = new BotController(onboarding, groupPicker, notifications, logger);
  const botService = new MgmtBotService(
    env.MGMT_BOT_TOKEN,
    (bot) =>
      new BotRoutes(bot, {
        controller: botController,
        handleUserMiddleware
      }).bind(),
    notifications,
    logger
  );

  await tdlibService.startActiveSessions(await sessions.listActive());
  await authHttpService.start();
  await botService.start();

  const shutdown = async () => {
    logger.info("shutdown_requested");
    await botService.stop();
    await authHttpService.stop();
    await tdlibService.stop();
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
