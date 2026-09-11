import type { AppConfig } from "../src/config.js";
import { openDb, type Db } from "../src/db/index.js";
import type { BotDeps } from "../src/bot/deps.js";
import { createLogger } from "../src/logger.js";
import { getOrCreateUser } from "../src/domain/users.js";
import type { UserRow } from "../src/db/repos/users.js";

export function createTestDb(): Db {
  return openDb({ path: ":memory:" });
}

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    telegramBotToken: "TEST:TOKEN",
    allowedTelegramIds: new Set([111, 222]),
    publicUrl: undefined,
    port: 3000,
    timeZone: "Asia/Ho_Chi_Minh",
    dbPath: ":memory:",
    botMode: "polling",
    telegramWebhookSecret: undefined,
    weeklyReportCron: "0 20 * * 0",
    monthlyReportCron: "0 8 1 * *",
    dailyReminderCron: "30 21 * * *",
    bareNumberThreshold: 1000,
    llm: { enabled: false, baseUrl: "https://api.ai-box.vn/v1", apiKey: undefined, model: undefined },
    actual: {
      enabled: false,
      serverUrl: undefined,
      password: undefined,
      syncId: undefined,
      encryptionPassword: undefined,
      accountName: "Chi Tiêu",
      syncIntervalMin: 5,
      dataDir: ":memory:actual:",
      userTelegramId: undefined,
    },
    backup: { dir: ":memory:backups:", cron: "0 3 * * *", telegramChatId: undefined, keep: 30 },
    logLevel: "silent",
    ...overrides,
  };
}

export function createTestDeps(overrides: Partial<AppConfig> = {}, db: Db = createTestDb()): BotDeps {
  const config = createTestConfig(overrides);
  return { db, config, logger: createLogger({ logLevel: config.logLevel }) };
}

export function seedUser(db: Db, telegramId: number, profile: { username?: string; name?: string } = {}): UserRow {
  return getOrCreateUser(db, telegramId, profile);
}
