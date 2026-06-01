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
               still_in_gc,
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
               m.still_in_gc,
               $6::timestamptz
             FROM new_export ne
             CROSS JOIN jsonb_to_recordset($7::jsonb) AS m(
               member_user_id bigint,
               username text,
               first_name text,
               last_name text,
               is_bot boolean,
               is_premium boolean,
               phone text,
               still_in_gc boolean
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
      case "group_chats.register_monitor": {
        const [groupTelegramId, groupTitle, monitorUserId, now] = args as [
          string,
          string,
          number,
          string
        ];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO group_chats(
               telegram_id,
               group_title,
               monitor_user_id,
               sync_enabled,
               first_seen_at,
               last_seen_at,
               created_at,
               updated_at
             )
             VALUES ($1::bigint, $2, $3::bigint, TRUE, $4::timestamptz, $4::timestamptz, $4::timestamptz, $4::timestamptz)
             ON CONFLICT(telegram_id)
             DO UPDATE SET
               group_title = EXCLUDED.group_title,
               monitor_user_id = EXCLUDED.monitor_user_id,
               sync_enabled = TRUE,
               last_seen_at = EXCLUDED.last_seen_at,
               updated_at = NOW()`,
            [groupTelegramId, groupTitle, monitorUserId, now]
          );
        });
        this.invalidateCache();
        return;
      }
      case "group_chats.update_after_count_check": {
        const [groupTelegramId, participantCount, checkedAt] = args as [string, number, string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `UPDATE group_chats
             SET last_participant_count = $2,
                 last_count_check_at = $3::timestamptz,
                 updated_at = NOW()
             WHERE telegram_id = $1::bigint`,
            [groupTelegramId, participantCount, checkedAt]
          );
        });
        this.invalidateCache();
        return;
      }
      case "group_chats.update_after_full_sync": {
        const [groupTelegramId, participantCount, syncedAt] = args as [string, number, string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `UPDATE group_chats
             SET last_participant_count = $2,
                 last_count_check_at = $3::timestamptz,
                 last_full_sync_at = $3::timestamptz,
                 updated_at = NOW()
             WHERE telegram_id = $1::bigint`,
            [groupTelegramId, participantCount, syncedAt]
          );
        });
        this.invalidateCache();
        return;
      }
      case "group_chat_members.reconcile": {
        const [groupTelegramId, members, syncedAt] = args as [string, unknown[], string];
        await this.writeQueue.enqueue(query, async () => {
          await this.backing.query(
            `INSERT INTO group_chat_members(
               group_telegram_id,
               member_user_id,
               username,
               first_name,
               last_name,
               is_bot,
               is_premium,
               phone,
               still_in_gc,
               first_seen_at,
               last_seen_in_gc_at,
               left_at,
               created_at,
               updated_at
             )
             SELECT
               $1::bigint,
               m.member_user_id,
               NULLIF(m.username, ''),
               m.first_name,
               m.last_name,
               m.is_bot,
               m.is_premium,
               NULLIF(m.phone, ''),
               TRUE,
               $3::timestamptz,
               $3::timestamptz,
               NULL,
               $3::timestamptz,
               $3::timestamptz
             FROM jsonb_to_recordset($2::jsonb) AS m(
               member_user_id bigint,
               username text,
               first_name text,
               last_name text,
               is_bot boolean,
               is_premium boolean,
               phone text
             )
             ON CONFLICT(group_telegram_id, member_user_id)
             DO UPDATE SET
               username = EXCLUDED.username,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               is_bot = EXCLUDED.is_bot,
               is_premium = EXCLUDED.is_premium,
               phone = EXCLUDED.phone,
               still_in_gc = TRUE,
               last_seen_in_gc_at = EXCLUDED.last_seen_in_gc_at,
               left_at = NULL,
               updated_at = NOW();

             UPDATE group_chat_members
             SET still_in_gc = FALSE,
                 left_at = COALESCE(left_at, $3::timestamptz),
                 updated_at = NOW()
             WHERE group_telegram_id = $1::bigint
               AND still_in_gc = TRUE
               AND member_user_id NOT IN (
                 SELECT m.member_user_id
                 FROM jsonb_to_recordset($2::jsonb) AS m(member_user_id bigint)
               )`,
            [groupTelegramId, JSON.stringify(members), syncedAt]
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
      case "group_chats.list_monitors_for_sync": {
        const rows = await this.backing.query<{
          telegram_id: string;
          group_title: string;
          monitor_user_id: string;
          last_participant_count: number | null;
          last_count_check_at: string | null;
          last_full_sync_at: string | null;
          sync_enabled: boolean;
        }>(
          `SELECT
             telegram_id::text,
             group_title,
             monitor_user_id::text,
             last_participant_count,
             last_count_check_at,
             last_full_sync_at,
             sync_enabled
           FROM group_chats
           WHERE sync_enabled = TRUE AND monitor_user_id IS NOT NULL`
        );
        return rows.map((row) => ({
          telegramId: row.telegram_id,
          groupTitle: row.group_title,
          monitorUserId: row.monitor_user_id,
          lastParticipantCount: row.last_participant_count,
          lastCountCheckAt: row.last_count_check_at,
          lastFullSyncAt: row.last_full_sync_at,
          syncEnabled: row.sync_enabled
        })) as T;
      }
      case "group_chat_members.still_in_gc_by_group": {
        const [groupTelegramId] = args as [string];
        const rows = await this.backing.query<{
          member_user_id: string;
          still_in_gc: boolean;
        }>(
          `SELECT member_user_id::text, still_in_gc
           FROM group_chat_members
           WHERE group_telegram_id = $1::bigint`,
          [groupTelegramId]
        );
        return rows.map((row) => ({
          memberUserId: row.member_user_id,
          stillInGc: row.still_in_gc
        })) as T;
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
