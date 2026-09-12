import { createBot, registerBotCommands } from "./bot/bot.js";
import type { BotDeps } from "./bot/deps.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/index.js";
import { pingLlm } from "./domain/llm.js";
import { buildApp } from "./http/app.js";
import { startScheduler } from "./jobs/scheduler.js";
import { createLogger } from "./logger.js";

// Load .env (if present) before anything reads process.env. Node's native
// loader — no dotenv dependency needed. Silently ignored when the file is
// missing (e.g. secrets injected some other way in production).
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine, env vars may come from the shell/deploy environment instead.
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = openDb({ path: config.dbPath });
  const deps: BotDeps = { db, config, logger };

  const bot = createBot(deps);
  await bot.init();
  await registerBotCommands(bot);
  void pingLlm(config.llm, logger);

  const scheduler = startScheduler(bot, deps);

  const app = await buildApp(deps, bot);
  await app.listen({ port: config.port, host: config.serverHost });
  logger.info({ port: config.port }, "Server đã khởi động");

  if (config.botMode === "polling") {
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => undefined);
    void bot.start({
      allowed_updates: ["message", "edited_message", "callback_query"],
      onStart: (info) => logger.info({ username: info.username }, "Bot Telegram đã bắt đầu polling"),
    });
  } else {
    if (!config.publicUrl) throw new Error("BOT_MODE=webhook cần PUBLIC_URL");
    await bot.api.setWebhook(`${config.publicUrl}/telegram/webhook`, {
      secret_token: config.telegramWebhookSecret,
      allowed_updates: ["message", "edited_message", "callback_query"],
    });
    logger.info("Đã đăng ký webhook Telegram");
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Đang tắt server...");
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    scheduler.stop();
    if (config.botMode === "polling") await bot.stop();
    await app.close();
    db.close();

    clearTimeout(forceExit);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
