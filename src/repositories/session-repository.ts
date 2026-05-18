import type { SessionRecord } from "../types.js";
import type { Store } from "../utils/db/root.js";

export class SessionRepository {
  constructor(private readonly store: Store) {}

  async listActive(): Promise<SessionRecord[]> {
    return this.store.read<SessionRecord[]>("sessions.list_active", 3000);
  }

  async findByUserId(userId: string): Promise<SessionRecord | null> {
    return this.store.read<SessionRecord | null>("sessions.find_by_user_id", 0, userId);
  }

  async upsertActive(userId: string, sessionString: string): Promise<void> {
    await this.store.write("sessions.upsert_active", userId, sessionString, new Date().toISOString());
  }

  async setActive(userId: string, active: boolean): Promise<void> {
    await this.store.write("sessions.set_active", userId, active, new Date().toISOString());
  }
}
