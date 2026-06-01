import type { TdlibListenerService } from "./tdlib-listener-service.js";
import type { GroupChatMembershipRepository } from "../repositories/group-chat-membership-repository.js";
import type { GroupMemberExportService } from "../services/group-member-export-service.js";
import type { GroupChatMonitor } from "../types.js";
import type { Analytics } from "../utils/analytics.js";
import type { Logger } from "../utils/logger.js";

export class GcMembershipSyncService {
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    private readonly countIntervalMs: number,
    private readonly fullSyncIntervalMs: number,
    private readonly tdlib: TdlibListenerService,
    private readonly groupExport: GroupMemberExportService,
    private readonly membership: GroupChatMembershipRepository,
    private readonly analytics: Analytics,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.countIntervalMs);
    this.logger.info("gc_membership_sync_started", {
      countIntervalMs: this.countIntervalMs,
      fullSyncIntervalMs: this.fullSyncIntervalMs
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const monitors = await this.membership.listMonitorsForSync();
      for (const monitor of monitors) {
        await this.syncMonitor(monitor);
      }
    } catch (error) {
      this.logger.error("gc_membership_sync_tick_failed", { error: String(error) });
    } finally {
      this.ticking = false;
    }
  }

  private async syncMonitor(monitor: GroupChatMonitor): Promise<void> {
    const client = this.tdlib.getClient(monitor.monitorUserId);
    if (!client) {
      this.logger.warn("gc_sync_skipped_no_session", {
        groupId: monitor.telegramId,
        monitorUserId: monitor.monitorUserId
      });
      return;
    }

    const count = await this.groupExport.getMemberCount(client, monitor.telegramId);
    if (count === null) {
      this.logger.warn("gc_sync_skipped_no_count", {
        groupId: monitor.telegramId,
        monitorUserId: monitor.monitorUserId
      });
      return;
    }

    const now = new Date().toISOString();
    const countChanged =
      monitor.lastParticipantCount !== null && count !== monitor.lastParticipantCount;
    const fullSyncDue =
      monitor.lastFullSyncAt === null ||
      Date.now() - Date.parse(monitor.lastFullSyncAt) >= this.fullSyncIntervalMs;

    if (!countChanged && !fullSyncDue) {
      await this.membership.updateAfterCountCheck(monitor.telegramId, count, now);
      return;
    }

    try {
      const members = await this.groupExport.fetchMembers(client, monitor.telegramId);
      await this.membership.reconcile(monitor.telegramId, members, now);
      await this.membership.updateAfterFullSync(monitor.telegramId, count, now);
      this.analytics.trackEvent("gc_membership_full_sync", {
        groupId: monitor.telegramId,
        monitorUserId: monitor.monitorUserId,
        participantCount: count,
        reason: countChanged ? "count_changed" : "periodic"
      });
      this.logger.info("gc_membership_full_sync_ok", {
        groupId: monitor.telegramId,
        participantCount: count,
        reason: countChanged ? "count_changed" : "periodic"
      });
    } catch (error) {
      this.logger.error("gc_membership_full_sync_failed", {
        groupId: monitor.telegramId,
        monitorUserId: monitor.monitorUserId,
        error: String(error)
      });
    }
  }
}
