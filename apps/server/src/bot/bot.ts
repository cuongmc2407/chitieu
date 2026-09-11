import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { BOT_COMMANDS, installCommands } from "./commands.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import { installEditedMessageHandler } from "./editedMessageHandler.js";
import { installCallbackHandler } from "./callbackHandler.js";
import { installMessageHandler } from "./messageHandler.js";
import { installAccessControl } from "./middlewares.js";

/** Builds a fully-wired Bot instance. Pass `botInfo` in tests to skip the network `getMe` call. */
export function createBot(deps: BotDeps, botInfo?: UserFromGetMe): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.config.telegramBotToken, botInfo ? { botInfo } : undefined);

  installAccessControl(bot, deps.db, deps.config, deps.logger);
  installCommands(bot, deps);
  installMessageHandler(bot, deps);
  installEditedMessageHandler(bot, deps);
  installCallbackHandler(bot, deps);

  bot.catch((err) => {
    deps.logger.error({ err: err.error, updateId: err.ctx.update.update_id }, "Lỗi xử lý update Telegram");
  });

  return bot;
}

export async function registerBotCommands(bot: Bot<BotContext>): Promise<void> {
  await bot.api.setMyCommands([...BOT_COMMANDS]);
}
