import { Database } from "./database.js";
import { DeferredWriteQueue } from "./queue.js";

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export class Store {
  private readonly backing: Database;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly writeQueue = new DeferredWriteQueue();

  constructor() {
    this.backing = new Database();
  }

  async close(): Promise<void> {
    await this.backing.close();
  }

  async write(query: string, ...args: unknown[]): Promise<void> {
    switch (query) {
      case "sessions.upsert_active": {
        const [userId, sessionString, now] = args as [string, string, string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO sessions(user_id, session_string, active, created_at, updated_at)
             VALUES ($1, $2, TRUE, $3::timestamptz, $3::timestamptz)
             ON CONFLICT(user_id)
             DO UPDATE SET session_string = EXCLUDED.session_string, active = TRUE, updated_at = EXCLUDED.updated_at`,
            [userId, sessionString, now]
          );
        });
        this.invalidateCache();
        return;
      }
      case "sessions.set_active": {
        const [userId, active, now] = args as [string, boolean, string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `UPDATE sessions SET active = $2, updated_at = $3::timestamptz WHERE user_id = $1`,
            [userId, active, now]
          );
        });
        this.invalidateCache();
        return;
      }
      case "analytics.insert": {
        const [event, props, createdAt] = args as [string, Record<string, unknown>, string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO analytics_events(event, props_json, created_at)
             VALUES ($1, $2::jsonb, $3::timestamptz)`,
            [event, JSON.stringify(props), createdAt]
          );
        });
        this.invalidateCache();
        return;
      }
      case "users.upsert": {
        const [telegramId, username, firstName, lastName, now] = args as [
          number,
          string,
          string,
          string,
          string
        ];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO users(telegram_id, username, first_name, last_name, last_seen_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz, $5::timestamptz)
             ON CONFLICT(telegram_id)
             DO UPDATE SET
               username = CASE WHEN btrim(EXCLUDED.username) = '' THEN users.username ELSE EXCLUDED.username END,
               first_name = CASE WHEN btrim(EXCLUDED.first_name) = '' THEN users.first_name ELSE EXCLUDED.first_name END,
               last_name = CASE WHEN btrim(EXCLUDED.last_name) = '' THEN users.last_name ELSE EXCLUDED.last_name END,
               last_seen_at = EXCLUDED.last_seen_at,
               updated_at = NOW()`,
            [telegramId, username, firstName, lastName, now]
          );
        });
        this.invalidateCache();
        return;
      }
      case "group_chats.upsert_if_needed": {
        const [chatId, now] = args as [number, string];
        if (chatId >= 0) return;
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO group_chats(telegram_id, first_seen_at, last_seen_at, created_at, updated_at)
             VALUES ($1, $2::timestamptz, $2::timestamptz, $2::timestamptz, $2::timestamptz)
             ON CONFLICT(telegram_id)
             DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, updated_at = NOW()`,
            [chatId, now]
          );
        });
        this.invalidateCache();
        return;
      }
      case "group_exports.create_with_members": {
        const [requestedByUserId, requestedByUsername, groupTelegramId, groupTitle, members, createdAt] =
          args as [number, string, string, string, unknown[], string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `WITH new_export AS (
               INSERT INTO group_member_exports(
                 requested_by_user_id,
                 requested_by_username,
                 group_telegram_id,
                 group_title,
                 member_count,
                 created_at
               )
               VALUES ($1, $2, $3::bigint, $4, $5, $6::timestamptz)
               RETURNING id
             )
             INSERT INTO group_member_export_members(
               export_id,
               member_user_id,
               username,
               first_name,
               last_name,
               is_bot,
               is_premium,
               phone,
               created_at
             )
             SELECT
               ne.id,
               m.member_user_id,
               NULLIF(m.username, ''),
               m.first_name,
               m.last_name,
               m.is_bot,
               m.is_premium,
               NULLIF(m.phone, ''),
               $6::timestamptz
             FROM new_export ne
             CROSS JOIN jsonb_to_recordset($7::jsonb) AS m(
               member_user_id bigint,
               username text,
               first_name text,
               last_name text,
               is_bot boolean,
               is_premium boolean,
               phone text
             )`,
            [
              requestedByUserId,
              requestedByUsername,
              groupTelegramId,
              groupTitle,
              members.length,
              createdAt,
              JSON.stringify(members)
            ]
          );
        });
        this.invalidateCache();
        return;
      }
      default:
        throw new Error(`unknown write query: ${query}`);
    }
  }

  async read<T>(query: string, cacheLifetimeMs = 0, ...args: unknown[]): Promise<T> {
    const now = Date.now();
    const cacheKey = this.buildCacheKey(query, args);
    if (cacheLifetimeMs > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        return cached.value as T;
      }
    }

    const result = await this.executeRead<T>(query, args);
    if (cacheLifetimeMs > 0) {
      this.cache.set(cacheKey, {
        expiresAt: now + cacheLifetimeMs,
        value: result
      });
    }
    return result;
  }

  private async executeRead<T>(query: string, args: unknown[]): Promise<T> {
    switch (query) {
      case "sessions.list_active": {
        const rows = await this.backing.query<{
          user_id: string;
          session_string: string;
          active: boolean;
        }>(`SELECT user_id, session_string, active FROM sessions WHERE active = TRUE`);
        return rows.map((row) => ({
          userId: row.user_id,
          sessionString: row.session_string,
          active: row.active
        })) as T;
      }
      case "sessions.find_by_user_id": {
        const [userId] = args as [string];
        const rows = await this.backing.query<{
          user_id: string;
          session_string: string;
          active: boolean;
        }>(`SELECT user_id, session_string, active FROM sessions WHERE user_id = $1 LIMIT 1`, [userId]);
        const row = rows[0];
        if (!row) return null as T;
        return {
          userId: row.user_id,
          sessionString: row.session_string,
          active: row.active
        } as T;
      }
      default:
        throw new Error(`unknown read query: ${query}`);
    }
  }

  private buildCacheKey(query: string, args: unknown[]): string {
    return `${query}:${JSON.stringify(args)}`;
  }

  private invalidateCache(): void {
    this.cache.clear();
  }
}
