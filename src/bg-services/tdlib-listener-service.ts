import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { Logger } from "../utils/logger.js";

export class TdlibListenerService {
  private readonly clients = new Map<string, TelegramClient>();

  constructor(
    private readonly apiId: number,
    private readonly apiHash: string,
    private readonly useWss: boolean,
    private readonly connectTimeoutMs: number,
    private readonly logger: Logger
  ) {}

  private async connectWithTimeout(client: TelegramClient, sessionId: string): Promise<void> {
    const timeoutMs = this.connectTimeoutMs;
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`tdlib_connect_timeout sessionId=${sessionId} timeoutMs=${timeoutMs}`));
        }, timeoutMs);
      })
    ]);
  }

  async startForSession(sessionId: string, sessionString: string): Promise<void> {
    if (this.clients.has(sessionId)) return;
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      useWSS: this.useWss
    });
    await this.connectWithTimeout(client, sessionId);
    this.clients.set(sessionId, client);
    this.logger.info("tdlib_session_started", { sessionId });
  }

  async startActiveSessions(
    sessions: Array<{ userId: string; sessionString: string; active: boolean }>
  ): Promise<void> {
    for (const session of sessions) {
      if (!session.active) continue;
      await this.startForSession(session.userId, session.sessionString);
    }
  }

  getClient(sessionId: string): TelegramClient | undefined {
    return this.clients.get(sessionId);
  }

  async stop(): Promise<void> {
    for (const [sessionId, client] of this.clients.entries()) {
      await client.disconnect();
      this.logger.info("tdlib_session_stopped", { sessionId });
      this.clients.delete(sessionId);
    }
  }
}
