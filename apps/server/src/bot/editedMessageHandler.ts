import type { Bot } from "grammy";
import * as transactionsRepo from "../db/repos/transactions.js";
import { checkBudgetAlerts } from "../domain/budgetAlerts.js";
import { updateFromEditedText } from "../domain/ledger.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import { buildAskAgainText, buildBudgetAlertText, buildConfirmationKeyboard, buildConfirmationText } from "./format.js";
import { upgradeFallbackCategoriesWithLlm } from "./llmUpgrade.js";
import { computeConfirmationSummary } from "./summary.js";

export function installEditedMessageHandler(bot: Bot<BotContext>, deps: BotDeps): void {
  bot.on("edited_message:text", async (ctx) => {
    const text = ctx.editedMessage.text;
    const chat = ctx.chat;
    const messageId = ctx.editedMessage.message_id;
    const now = new Date(ctx.editedMessage.date * 1000);

    const priorItems = transactionsRepo.listByTelegramMessageId(deps.db, ctx.user.id, messageId);
    const priorReplyMessageId = priorItems[0]?.telegramReplyMessageId ?? null;

    const result = updateFromEditedText(
      deps.db,
      ctx.user.id,
      text,
      { timeZone: deps.config.timeZone, bareNumberThreshold: deps.config.bareNumberThreshold },
      { now, clientIdPrefix: `tg:${chat.id}:${messageId}`, telegramMessageId: messageId, telegramReplyMessageId: priorReplyMessageId ?? undefined },
    );

    if (!result.ok) {
      await ctx.reply(buildAskAgainText());
      return;
    }

    const summary = computeConfirmationSummary(deps.db, ctx.user.id, now, deps.config.timeZone);
    const confirmationText = buildConfirmationText(result.items, summary, deps.config.timeZone, now);
    const keyboard = buildConfirmationKeyboard(result.items, messageId);

    let replyMessageId = priorReplyMessageId;
    if (priorReplyMessageId) {
      try {
        await ctx.api.editMessageText(chat.id, priorReplyMessageId, confirmationText, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (err) {
        deps.logger.warn({ err }, "Không sửa được tin xác nhận cũ, gửi tin mới");
        replyMessageId = null;
      }
    }
    if (!replyMessageId) {
      const sent = await ctx.reply(confirmationText, { parse_mode: "HTML", reply_markup: keyboard });
      replyMessageId = sent.message_id;
    }

    for (const item of result.items) {
      transactionsRepo.update(deps.db, ctx.user.id, item.transaction.id, { telegramReplyMessageId: replyMessageId });
    }

    if (result.items.some((i) => i.transaction.type === "expense")) {
      const alerts = checkBudgetAlerts(deps.db, ctx.user.id, now, deps.config.timeZone);
      for (const alert of alerts) {
        await ctx.reply(buildBudgetAlertText(alert.label, alert.spent, alert.budget, alert.pct));
      }
    }

    void upgradeFallbackCategoriesWithLlm(deps, ctx, ctx.user.id, result.items, chat.id, replyMessageId).catch((err: unknown) =>
      deps.logger.warn({ err }, "Lỗi khi đoán lại danh mục bằng LLM"),
    );
  });
}
