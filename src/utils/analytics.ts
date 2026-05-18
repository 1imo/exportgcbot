/**
 * Analytics: deferred persistence only — callers are never blocked on store writes.
 * No in-memory event queue; each trackEvent() schedules a single setImmediate persist.
 */
import { setImmediate } from "node:timers";
import type { Logger } from "./logger.js";
import type { Store } from "./db/root.js";

export class Analytics {
  constructor(
    private readonly store: Store,
    private readonly logger: Logger
  ) {}

  /** Schedules persist on the next event-loop turn; returns immediately (does not await store). */
  trackEvent(name: string, props: Record<string, unknown>): void {
    setImmediate(async () => {
      try {
        await this.store.write("analytics.insert", name, props, new Date().toISOString());
      } catch (error) {
        this.logger.error("analytics_persist_failed", { event: name, error: String(error) });
      }
    });
  }
}
