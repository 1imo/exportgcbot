import telegrafPkg from "telegraf";

export const Telegraf = telegrafPkg.Telegraf;

export type TelegrafBot = InstanceType<typeof Telegraf>;

export type TextMessageContext = {
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  chat?: { id?: number };
  message: { text: string };
};
