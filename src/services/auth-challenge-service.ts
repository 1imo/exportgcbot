import { randomUUID } from "node:crypto";

type Challenge = {
  userId: number;
  prompt: string;
  resolve: (value: string) => void;
  expiresAt: number;
};

export class AuthChallengeService {
  private readonly pending = new Map<string, Challenge>();

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  create(userId: number, prompt: string): { token: string; wait: Promise<string> } {
    const token = randomUUID();
    const wait = new Promise<string>((resolve) => {
      this.pending.set(token, {
        userId,
        prompt,
        resolve,
        expiresAt: Date.now() + this.ttlMs
      });
    });
    return { token, wait };
  }

  getPrompt(token: string): string | null {
    const challenge = this.pending.get(token);
    if (!challenge) return null;
    if (Date.now() > challenge.expiresAt) {
      this.pending.delete(token);
      return null;
    }
    return challenge.prompt;
  }

  submit(token: string, value: string): { ok: boolean; reason?: string } {
    const challenge = this.pending.get(token);
    if (!challenge) return { ok: false, reason: "not_found_or_expired" };
    if (Date.now() > challenge.expiresAt) {
      this.pending.delete(token);
      return { ok: false, reason: "expired" };
    }
    this.pending.delete(token);
    challenge.resolve(value.trim());
    return { ok: true };
  }
}
