import type { Bot } from "grammy";
import * as transactionsRepo from "../db/repos/transactions.js";
import { checkBudgetAlerts } from "../domain/budgetAlerts.js";
import { createFromText } from "../domain/ledger.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import { buildBudgetAlertText, buildConfirmationKeyboard, buildConfirmationText, buildUnknownCommandText } from "./format.js";
import { upgradeFallbackCategoriesWithLlm } from "./llmUpgrade.js";
import { computeConfirmationSummary } from "./summary.js";

export function installMessageHandler(bot: Bot<BotContext>, deps: BotDeps): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const chat = ctx.chat;

    if (text.startsWith("/")) {
      await ctx.reply(buildUnknownCommandText());
      return;
    }

    const start = Date.now();
    const now = new Date(ctx.message.date * 1000);
    const result = createFromText(
      deps.db,
      ctx.user.id,
      text,
      { timeZone: deps.config.timeZone, bareNumberThreshold: deps.config.bareNumberThreshold },
      {
        source: "telegram",
        now,
        clientIdPrefix: `tg:${chat.id}:${ctx.message.message_id}`,
        telegramMessageId: ctx.message.message_id,
      },
    );

    if (!result.ok) {
      await ctx.reply(`❌ ${result.errors.map((e) => e.message).join("\n")}`);
      return;
    }

    const summary = computeConfirmationSummary(deps.db, ctx.user.id, now, deps.config.timeZone);
    const confirmationText = buildConfirmationText(result.items, summary, deps.config.timeZone, now);
    const keyboard = buildConfirmationKeyboard(result.items, ctx.message.message_id);

    const sent = await ctx.reply(confirmationText, { parse_mode: "HTML", reply_markup: keyboard });
    for (const item of result.items) {
      transactionsRepo.update(deps.db, ctx.user.id, item.transaction.id, { telegramReplyMessageId: sent.message_id });
    }

    deps.logger.info({ ms: Date.now() - start, items: result.items.length }, "Đã xử lý tin nhắn chi tiêu");

    if (result.items.some((i) => i.transaction.type === "expense")) {
      const alerts = checkBudgetAlerts(deps.db, ctx.user.id, now, deps.config.timeZone);
      for (const alert of alerts) {
        await ctx.reply(buildBudgetAlertText(alert.label, alert.spent, alert.budget, alert.pct));
      }
    }

    void upgradeFallbackCategoriesWithLlm(deps, ctx, ctx.user.id, result.items, chat.id, sent.message_id).catch((err: unknown) =>
      deps.logger.warn({ err }, "Lỗi khi đoán lại danh mục bằng LLM"),
    );
  });
}
