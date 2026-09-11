import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import * as categoriesRepo from "../db/repos/categories.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import { checkBudgetAlerts } from "../domain/budgetAlerts.js";
import { changeCategory, restoreTransaction, undo, undoAllForMessage, type LedgerItemResult } from "../domain/ledger.js";
import { decodeCallbackData } from "./callbackData.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import {
  buildBudgetAlertText,
  buildCategoryKeyboard,
  buildConfirmationKeyboard,
  buildConfirmationText,
  buildRestoredText,
  buildUndoneKeyboard,
  buildUndoneText,
} from "./format.js";
import { computeConfirmationSummary } from "./summary.js";

/** Rebuilds the (possibly multi-item) confirmation message for every active item from the same Telegram message. */
function siblingDisplayItems(deps: BotDeps, userId: number, telegramMessageId: number): LedgerItemResult[] {
  return transactionsRepo.listByTelegramMessageId(deps.db, userId, telegramMessageId).flatMap((transaction) => {
    const category = categoriesRepo.getById(deps.db, userId, transaction.categoryId);
    return category ? [{ transaction, category, matchedBy: "keyword" as const }] : [];
  });
}

export function installCallbackHandler(bot: Bot<BotContext>, deps: BotDeps): void {
  bot.on("callback_query:data", async (ctx) => {
    const action = decodeCallbackData(ctx.callbackQuery.data);
    if (!action) {
      await ctx.answerCallbackQuery();
      return;
    }
    const userId = ctx.user.id;

    switch (action.kind) {
      case "changeCategory": {
        const tx = transactionsRepo.findByRowId(deps.db, userId, action.txRowId);
        if (!tx) {
          await ctx.answerCallbackQuery({ text: "Không tìm thấy giao dịch này." });
          return;
        }
        const categories = categoriesRepo.listByUser(deps.db, userId);
        await ctx.editMessageReplyMarkup({ reply_markup: buildCategoryKeyboard(categories, tx.rowId) });
        await ctx.answerCallbackQuery();
        return;
      }

      case "selectCategory": {
        const category = categoriesRepo.getByRowId(deps.db, userId, action.categoryRowId);
        const txBefore = transactionsRepo.findByRowId(deps.db, userId, action.txRowId);
        if (!category || !txBefore) {
          await ctx.answerCallbackQuery({ text: "Không tìm thấy dữ liệu, thử lại nhé." });
          return;
        }
        const changed = changeCategory(deps.db, userId, txBefore.id, category.id);
        if (!changed) {
          await ctx.answerCallbackQuery({ text: "Không đổi được danh mục." });
          return;
        }

        const telegramMessageId = txBefore.telegramMessageId ?? 0;
        const items = siblingDisplayItems(deps, userId, telegramMessageId);
        const now = new Date();
        const summary = computeConfirmationSummary(deps.db, userId, now, deps.config.timeZone);
        const text = buildConfirmationText(items, summary, deps.config.timeZone, now);
        const keyboard = buildConfirmationKeyboard(items, telegramMessageId);
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        await ctx.answerCallbackQuery({ text: "🏷 Lần sau mình sẽ tự nhớ!" });

        if (changed.transaction.type === "expense") {
          const alerts = checkBudgetAlerts(deps.db, userId, now, deps.config.timeZone);
          for (const alert of alerts) {
            await ctx.reply(buildBudgetAlertText(alert.label, alert.spent, alert.budget, alert.pct));
          }
        }
        return;
      }

      case "undo": {
        const tx = transactionsRepo.findByRowId(deps.db, userId, action.txRowId);
        if (!tx) {
          await ctx.answerCallbackQuery({ text: "Không tìm thấy giao dịch này." });
          return;
        }
        const undone = undo(deps.db, userId, tx.id);
        if (!undone) {
          await ctx.answerCallbackQuery({ text: "Không hoàn tác được." });
          return;
        }
        const category = categoriesRepo.getById(deps.db, userId, undone.categoryId);
        if (category) {
          await ctx.editMessageText(buildUndoneText({ transaction: undone, category }), {
            parse_mode: "HTML",
            reply_markup: buildUndoneKeyboard(undone.rowId),
          });
        }
        await ctx.answerCallbackQuery({ text: "↩️ Đã hoàn tác." });
        return;
      }

      case "restore": {
        const tx = transactionsRepo.findByRowId(deps.db, userId, action.txRowId);
        if (!tx) {
          await ctx.answerCallbackQuery({ text: "Không tìm thấy giao dịch này." });
          return;
        }
        const restored = restoreTransaction(deps.db, userId, tx.id);
        if (!restored) {
          await ctx.answerCallbackQuery({ text: "Không khôi phục được." });
          return;
        }
        const category = categoriesRepo.getById(deps.db, userId, restored.categoryId);
        if (category) {
          const keyboard =
            restored.telegramMessageId != null
              ? buildConfirmationKeyboard([{ transaction: restored, category, matchedBy: "keyword" }], restored.telegramMessageId)
              : new InlineKeyboard();
          await ctx.editMessageText(buildRestoredText({ transaction: restored, category }), { parse_mode: "HTML", reply_markup: keyboard });
        }
        await ctx.answerCallbackQuery({ text: "Đã khôi phục." });
        return;
      }

      case "undoAll": {
        const count = undoAllForMessage(deps.db, userId, action.telegramMessageId);
        if (count > 0) {
          await ctx.editMessageText(`↩️ Đã hoàn tác ${count} khoản.`);
        }
        await ctx.answerCallbackQuery();
        return;
      }
    }
  });
}
