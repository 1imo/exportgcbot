type QueueTask = () => Promise<void>;

type DeferredTask = {
  name: string;
  run: QueueTask;
  attempts: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

type DlqEntry = {
  name: string;
  attempts: number;
  lastError: string;
  at: string;
};

export class DeferredWriteQueue {
  private readonly pending: DeferredTask[] = [];
  private readonly dlq: DlqEntry[] = [];
  private processing = false;
  private pausedUntilMs = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly maxRetries = 5,
    private readonly baseBackoffMs = 250,
    private readonly maxBackoffMs = 10000,
    private readonly breakerThreshold = 5,
    private readonly breakerCooldownMs = 15000
  ) {}

  enqueue(name: string, run: QueueTask): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pending.push({ name, run, attempts: 0, resolve, reject });
      this.kick();
    });
  }

  getDlq(): DlqEntry[] {
    return [...this.dlq];
  }

  private kick(): void {
    if (this.processing) return;
    this.processing = true;
    void this.processLoop();
  }

  private async processLoop(): Promise<void> {
    while (this.pending.length > 0) {
      const waitMs = this.pausedUntilMs - Date.now();
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      const task = this.pending.shift();
      if (!task) break;
      await this.executeTask(task);
    }
    this.processing = false;
  }

  private async executeTask(task: DeferredTask): Promise<void> {
    try {
      await task.run();
      this.consecutiveFailures = 0;
      task.resolve();
      return;
    } catch (error) {
      task.attempts += 1;
      this.consecutiveFailures += 1;

      if (this.consecutiveFailures >= this.breakerThreshold) {
        this.pausedUntilMs = Date.now() + this.breakerCooldownMs;
      }

      if (task.attempts > this.maxRetries) {
        const err = this.asError(error);
        this.dlq.push({
          name: task.name,
          attempts: task.attempts,
          lastError: err.message,
          at: new Date().toISOString()
        });
        task.reject(err);
        return;
      }

      const delay = Math.min(this.baseBackoffMs * 2 ** (task.attempts - 1), this.maxBackoffMs);
      await this.sleep(delay);
      this.pending.unshift(task);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) return error;
    return new Error(String(error));
  }
}
