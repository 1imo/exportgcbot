import type { OnboardingUseCase } from "../use-cases/onboarding.js";
import type { GroupPickerUseCase } from "../use-cases/group-picker.js";
import type { ClientNotificationService } from "../services/client-notification-service.js";
import type { ServiceUser } from "../types.js";
import type { Logger } from "../utils/logger.js";

export class BotController {
  constructor(
    private readonly onboarding: OnboardingUseCase,
    private readonly groupPicker: GroupPickerUseCase,
    private readonly notifications: ClientNotificationService,
    private readonly logger: Logger
  ) { }

  async handleStart(userId: number): Promise<void> {
    await this.guard(userId, async () => {
      await this.onboarding.onStart(userId);
    });
  }

  async handleText(user: ServiceUser, text: string): Promise<void> {
    await this.guard(user.userId, async () => {
      if (this.onboarding.isOnboarding(user.userId)) {
        await this.onboarding.onText(user.userId, text);
        return;
      }
      await this.groupPicker.onText(user, text);
    });
  }

  private async guard(userId: number, next: () => Promise<void>): Promise<void> {
    try {
      await next();
    } catch (error) {
      this.logger.error("bot_command_failed", { userId, error: String(error) });
      await this.notifications.sendToClient(String(userId), "Something went wrong. Try again.");
    }
  }
}
