import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { BotContext } from "../bot/context.js";
import type { BotDeps } from "../bot/deps.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import categoriesRoutes from "./routes/categories.js";
import exportRoutes from "./routes/export.js";
import fixedCostsRoutes from "./routes/fixedCosts.js";
import keywordOverridesRoutes from "./routes/keywordOverrides.js";
import parseRoutes from "./routes/parse.js";
import publicConfigRoutes from "./routes/publicConfig.js";
import statsRoutes from "./routes/stats.js";
import transactionsRoutes from "./routes/transactions.js";

// apps/server/src/http/app.ts -> apps/web/dist — correct when running out of
// the monorepo (dev, PM2). A deployed package no longer sits next to
// apps/web, so Docker overrides this via WEB_DIST_PATH.
const DEFAULT_WEB_DIST = path.resolve(fileURLToPath(new URL("../../../web/dist", import.meta.url)));

const DEV_ORIGIN = "http://localhost:5173";
const IOS_ORIGIN = "capacitor://localhost";

export async function buildApp(deps: BotDeps, bot?: Bot<BotContext>): Promise<FastifyInstance> {
  // pino's own Logger type and Fastify's FastifyBaseLogger interface aren't
  // structurally identical (extra fields like msgPrefix), even though a
  // plain pino instance works fine as loggerInstance at runtime.
  const app = Fastify({ loggerInstance: deps.logger as unknown as FastifyBaseLogger, disableRequestLogging: true });

  app.decorate("deps", deps);
  app.decorate("botUsername", bot?.isInited() ? (bot.botInfo.username ?? null) : null);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://telegram.org"],
        frameSrc: ["https://oauth.telegram.org"],
        imgSrc: ["'self'", "data:", "https://*.telegram.org", "https://t.me"],
        connectSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(cookie);
  // The web app is served from the same origin, so it needs no CORS entry.
  // Only the iOS app (custom scheme) and the Vite dev server need one.
  await app.register(cors, {
    origin: [IOS_ORIGIN, DEV_ORIGIN],
    credentials: true,
  });
  await app.register(authPlugin);

  app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));
  await app.register(publicConfigRoutes);
  await app.register(authRoutes);
  await app.register(parseRoutes);
  await app.register(transactionsRoutes);
  await app.register(statsRoutes);
  await app.register(categoriesRoutes);
  await app.register(fixedCostsRoutes);
  await app.register(keywordOverridesRoutes);
  await app.register(exportRoutes);

  if (bot && deps.config.botMode === "webhook") {
    const handleUpdate = webhookCallback(bot, "fastify", { secretToken: deps.config.telegramWebhookSecret });
    app.post("/telegram/webhook", handleUpdate);
  }

  const webDist = deps.config.webDistPath ? path.resolve(deps.config.webDistPath) : DEFAULT_WEB_DIST;
  if (existsSync(webDist)) {
    await app.register(staticPlugin, {
      root: webDist,
      wildcard: false,
      setHeaders: (reply, filePath) => {
        const isEntryPoint = filePath.endsWith("index.html") || filePath.endsWith("sw.js");
        reply.header("Cache-Control", isEntryPoint ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/telegram/")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  return app;
}
