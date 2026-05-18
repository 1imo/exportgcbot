declare module "telegraf" {
  class Telegraf {
    constructor(token: string);
    telegram: {
      sendMessage(
        chatId: number,
        text: string,
        extra?: Record<string, unknown>
      ): Promise<unknown>;
      getMe(): Promise<{ id: number; username?: string }>;
    };
    on(event: string, handler: (ctx: unknown) => Promise<void> | void): this;
    launch(): Promise<void>;
    stop(reason?: string): void;
  }

  const telegraf: { Telegraf: typeof Telegraf };
  export default telegraf;
}
