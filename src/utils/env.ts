import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});

const boolish = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v.trim() === "") return true;
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  });

const boolishFalse = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v.trim() === "") return false;
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  });

const schema = z.object({
  NODE_ENV: z
    .preprocess(
      (v) => (v === undefined || v === "" ? "development" : v),
      z.enum(["development", "test", "production"])
    ),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: boolish,
  DATABASE_USE_IAM: boolishFalse,
  DATABASE_IAM_REGION: z.string().optional(),
  DATABASE_IAM_HOST: z.string().optional(),
  DATABASE_IAM_PORT: z.coerce.number().default(5432),
  DATABASE_IAM_USER: z.string().optional(),
  DATABASE_IAM_DBNAME: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().default(3000),
  TELEGRAM_API_ID: z.coerce.number().finite().positive(),
  TELEGRAM_API_HASH: z.string().min(1),
  TELEGRAM_USE_WSS: boolish,
  TELEGRAM_CONNECT_TIMEOUT_MS: z.coerce.number().default(20000),
  AUTH_HOST_BASE: z.string().optional(),
  AUTH_HTTP_PORT: z.coerce.number().default(8787),
  MGMT_BOT_TOKEN: z.string().optional()
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
