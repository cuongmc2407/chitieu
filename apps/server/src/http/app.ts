import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";
import type { BotContext } from "../bot/context.js";
import type { BotDeps } from "../bot/deps.js";

export async function buildApp(deps: BotDeps, bot?: Bot<BotContext>): Promise<FastifyInstance> {
  // pino's own Logger type and Fastify's FastifyBaseLogger interface aren't
  // structurally identical (extra fields like msgPrefix), even though a
  // plain pino instance works fine as loggerInstance at runtime.
  const app = Fastify({ loggerInstance: deps.logger as unknown as FastifyBaseLogger, disableRequestLogging: true });

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } } });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

  if (bot && deps.config.botMode === "webhook") {
    const handleUpdate = webhookCallback(bot, "fastify", { secretToken: deps.config.telegramWebhookSecret });
    app.post("/telegram/webhook", handleUpdate);
  }

  return app;
}
