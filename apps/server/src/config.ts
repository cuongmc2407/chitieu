import { z } from "zod";

const BooleanFromEnv = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN là bắt buộc"),
  ALLOWED_TELEGRAM_IDS: z.string().min(1, "ALLOWED_TELEGRAM_IDS là bắt buộc (danh sách Telegram ID, cách nhau bởi dấu phẩy)"),
  PUBLIC_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3333),
  // Docker needs 0.0.0.0 so its published localhost port can reach the
  // container. Direct/PM2 runs remain loopback-only by default.
  SERVER_HOST: z.string().default("127.0.0.1"),
  TZ: z.string().default("Asia/Ho_Chi_Minh"),
  DB_PATH: z.string().default("./data/chitieu.db"),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  // Where the built web app (apps/web/dist) lives. Left unset, the server
  // looks for it as a sibling folder (correct for running straight out of
  // the monorepo — dev, PM2). Docker sets this explicitly because the
  // deployed server package no longer sits next to apps/web on disk.
  WEB_DIST_PATH: z.string().optional(),

  WEEKLY_REPORT_CRON: z.string().default("0 20 * * 0"),
  MONTHLY_REPORT_CRON: z.string().default("0 8 1 * *"),
  DAILY_REMINDER_CRON: z.string().default("30 21 * * *"),
  // Right after midnight: a cost due on the 5th lands early on the 5th.
  FIXED_COST_CRON: z.string().default("5 0 * * *"),

  BARE_NUMBER_THRESHOLD: z.coerce.number().int().positive().default(1000),

  LLM_ENABLED: BooleanFromEnv,
  LLM_BASE_URL: z.string().default("https://api.ai-box.vn/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),

  ACTUAL_SERVER_URL: z.string().optional(),
  ACTUAL_PASSWORD: z.string().optional(),
  ACTUAL_SYNC_ID: z.string().optional(),
  ACTUAL_ENCRYPTION_PASSWORD: z.string().optional(),
  ACTUAL_ACCOUNT_NAME: z.string().default("Chi Tiêu"),
  ACTUAL_SYNC_INTERVAL_MIN: z.coerce.number().int().positive().default(5),
  ACTUAL_DATA_DIR: z.string().default("./data/actual"),
  ACTUAL_USER_TELEGRAM_ID: z.coerce.number().int().optional(),

  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_CRON: z.string().default("0 3 * * *"),
  BACKUP_TELEGRAM_CHAT_ID: z.coerce.number().int().optional(),
  BACKUP_KEEP: z.coerce.number().int().positive().default(30),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export interface AppConfig {
  telegramBotToken: string;
  allowedTelegramIds: Set<number>;
  publicUrl?: string;
  port: number;
  serverHost: string;
  timeZone: string;
  dbPath: string;
  botMode: "polling" | "webhook";
  telegramWebhookSecret?: string;
  webDistPath?: string;
  weeklyReportCron: string;
  monthlyReportCron: string;
  dailyReminderCron: string;
  fixedCostCron: string;
  bareNumberThreshold: number;
  llm: { enabled: boolean; baseUrl: string; apiKey?: string; model?: string };
  actual: {
    enabled: boolean;
    serverUrl?: string;
    password?: string;
    syncId?: string;
    encryptionPassword?: string;
    accountName: string;
    syncIntervalMin: number;
    dataDir: string;
    userTelegramId?: number;
  };
  backup: { dir: string; cron: string; telegramChatId?: number; keep: number };
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);

  const allowedTelegramIds = new Set(
    parsed.ALLOWED_TELEGRAM_IDS.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number),
  );
  for (const id of allowedTelegramIds) {
    if (!Number.isSafeInteger(id)) {
      throw new Error(`ALLOWED_TELEGRAM_IDS chứa giá trị không hợp lệ: "${id}"`);
    }
  }
  if (allowedTelegramIds.size === 0) {
    throw new Error("ALLOWED_TELEGRAM_IDS phải có ít nhất một Telegram ID");
  }

  if (parsed.BOT_MODE === "webhook" && !parsed.PUBLIC_URL) {
    throw new Error("BOT_MODE=webhook cần có PUBLIC_URL");
  }

  if (parsed.LLM_ENABLED && (!parsed.LLM_API_KEY || !parsed.LLM_MODEL)) {
    throw new Error("LLM_ENABLED=true nhưng thiếu LLM_API_KEY hoặc LLM_MODEL");
  }

  return {
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    allowedTelegramIds,
    publicUrl: parsed.PUBLIC_URL,
    port: parsed.PORT,
    serverHost: parsed.SERVER_HOST,
    timeZone: parsed.TZ,
    dbPath: parsed.DB_PATH,
    botMode: parsed.BOT_MODE,
    telegramWebhookSecret: parsed.TELEGRAM_WEBHOOK_SECRET,
    webDistPath: parsed.WEB_DIST_PATH,
    weeklyReportCron: parsed.WEEKLY_REPORT_CRON,
    monthlyReportCron: parsed.MONTHLY_REPORT_CRON,
    dailyReminderCron: parsed.DAILY_REMINDER_CRON,
    fixedCostCron: parsed.FIXED_COST_CRON,
    bareNumberThreshold: parsed.BARE_NUMBER_THRESHOLD,
    llm: { enabled: parsed.LLM_ENABLED, baseUrl: parsed.LLM_BASE_URL, apiKey: parsed.LLM_API_KEY, model: parsed.LLM_MODEL },
    actual: {
      enabled: Boolean(parsed.ACTUAL_SERVER_URL && parsed.ACTUAL_PASSWORD && parsed.ACTUAL_SYNC_ID),
      serverUrl: parsed.ACTUAL_SERVER_URL,
      password: parsed.ACTUAL_PASSWORD,
      syncId: parsed.ACTUAL_SYNC_ID,
      encryptionPassword: parsed.ACTUAL_ENCRYPTION_PASSWORD,
      accountName: parsed.ACTUAL_ACCOUNT_NAME,
      syncIntervalMin: parsed.ACTUAL_SYNC_INTERVAL_MIN,
      dataDir: parsed.ACTUAL_DATA_DIR,
      userTelegramId: parsed.ACTUAL_USER_TELEGRAM_ID,
    },
    backup: {
      dir: parsed.BACKUP_DIR,
      cron: parsed.BACKUP_CRON,
      telegramChatId: parsed.BACKUP_TELEGRAM_CHAT_ID,
      keep: parsed.BACKUP_KEEP,
    },
    logLevel: parsed.LOG_LEVEL,
  };
}
