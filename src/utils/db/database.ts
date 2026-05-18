import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import { Signer } from "@aws-sdk/rds-signer";
import { env } from "../env.js";

export class Database {
  readonly pool: Pool;

  constructor() {
    if (!env.DATABASE_URL.trim()) {
      throw new Error("DATABASE_URL is empty");
    }
    if (env.DATABASE_USE_IAM) {
      const parsed = new URL(env.DATABASE_URL);
      const host = env.DATABASE_IAM_HOST?.trim() || parsed.hostname;
      const port = env.DATABASE_IAM_PORT || Number(parsed.port || 5432);
      const user = env.DATABASE_IAM_USER?.trim() || decodeURIComponent(parsed.username || "postgres");
      const database = env.DATABASE_IAM_DBNAME?.trim() || parsed.pathname.replace(/^\//, "") || "postgres";
      const region =
        env.DATABASE_IAM_REGION?.trim() ||
        this.inferRegionFromHost(host) ||
        (() => {
          throw new Error("DATABASE_IAM_REGION is required when DATABASE_USE_IAM=true");
        })();

      const signer = new Signer({
        region,
        hostname: host,
        port,
        username: user
      });

      this.pool = new Pool({
        host,
        port,
        database,
        user,
        password: async () => signer.getAuthToken(),
        ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
      });
      return;
    }

    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
    });
  }

  private inferRegionFromHost(host: string): string | null {
    const match = host.match(/\.([a-z]{2}-[a-z]+-\d)\.rds\.amazonaws\.com$/);
    return match?.[1] ?? null;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
