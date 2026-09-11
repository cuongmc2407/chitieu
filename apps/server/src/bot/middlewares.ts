import type { Bot } from "grammy";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import { getOrCreateUser } from "../domain/users.js";
import type { Logger } from "../logger.js";
import type { BotContext } from "./context.js";
import { buildRejectedText } from "./format.js";

/**
 * Ignores anything outside a private 1:1 chat, rejects Telegram ids not in
 * ALLOWED_TELEGRAM_IDS (with a log + a polite reply), and otherwise attaches
 * `ctx.user` (creating the user + default categories on first contact).
 */
export function installAccessControl(bot: Bot<BotContext>, db: Db, config: AppConfig, logger: Logger): void {
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== "private") return;

    const from = ctx.from;
    if (!from) return;

    if (!config.allowedTelegramIds.has(from.id)) {
      logger.warn({ telegramId: from.id, username: from.username }, "Từ chối người dùng không có trong ALLOWED_TELEGRAM_IDS");
      await ctx.reply(buildRejectedText());
      return;
    }

    ctx.user = getOrCreateUser(db, from.id, { username: from.username ?? null, name: from.first_name ?? null });
    await next();
  });
}
