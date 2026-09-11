import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/http/app.js";
import { createSession } from "../src/domain/auth.js";
import { createTestDb, createTestConfig, seedUser } from "./setup.js";
import { createLogger } from "../src/logger.js";
import type { Db } from "../src/db/index.js";
import type { AppConfig } from "../src/config.js";

export interface TestApiContext {
  app: FastifyInstance;
  db: Db;
  config: AppConfig;
}

export async function createTestApi(configOverrides: Partial<AppConfig> = {}): Promise<TestApiContext> {
  const db = createTestDb();
  const config = createTestConfig(configOverrides);
  const logger = createLogger({ logLevel: config.logLevel });
  const app = await buildApp({ db, config, logger });
  await app.ready();
  return { app, db, config };
}

/** Creates (or reuses) a user and a fresh bearer session token for it — bypasses the real login flow for test speed. */
export function loginAs(ctx: TestApiContext, telegramId: number, client: "web" | "ios" = "ios"): { userId: number; token: string } {
  ctx.config.allowedTelegramIds.add(telegramId); // resolveSession() requires membership even for a test-minted session
  const user = seedUser(ctx.db, telegramId);
  const { token } = createSession(ctx.db, user.id, client);
  return { userId: user.id, token };
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
