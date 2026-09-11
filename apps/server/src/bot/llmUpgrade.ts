import * as categoriesRepo from "../db/repos/categories.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import { loadParseOptions, type LedgerItemResult } from "../domain/ledger.js";
import { guessCategory } from "../domain/llm.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import { buildConfirmationText } from "./format.js";
import { computeConfirmationSummary } from "./summary.js";

/**
 * For items the dictionary couldn't confidently categorize (matchedBy ===
 * "fallback"), asks the optional LLM and, if it disagrees with "Khác" (or
 * "Thu khác"), updates the transaction and tries to patch the confirmation
 * message. Never writes keyword_overrides — only a manual correction
 * should teach the bot a new keyword. Callers should NOT await this in the
 * main reply path (the bot must answer within ~1s); it's meant to be
 * fired in the background right after the confirmation reply is sent.
 */
export async function upgradeFallbackCategoriesWithLlm(
  deps: BotDeps,
  ctx: BotContext,
  userId: number,
  items: LedgerItemResult[],
  replyChatId: number,
  replyMessageId: number,
): Promise<void> {
  if (!deps.config.llm.enabled) return;
  const fallbackItems = items.filter((i) => i.matchedBy === "fallback");
  if (fallbackItems.length === 0) return;

  const { categories } = loadParseOptions(deps.db, userId);
  let changed = false;

  for (const item of fallbackItems) {
    const guessedId = await guessCategory(deps.config.llm, item.transaction.note, categories);
    if (!guessedId || guessedId === item.category.id) continue;

    const categoryRow = categoriesRepo.getById(deps.db, userId, guessedId);
    if (!categoryRow) continue;

    transactionsRepo.update(deps.db, userId, item.transaction.id, { categoryId: categoryRow.id, type: categoryRow.type });
    item.transaction = { ...item.transaction, categoryId: categoryRow.id, type: categoryRow.type };
    item.category = categoryRow;
    changed = true;
  }

  if (!changed) return;

  try {
    const now = new Date();
    const summary = computeConfirmationSummary(deps.db, userId, now, deps.config.timeZone);
    const text = buildConfirmationText(items, summary, deps.config.timeZone, now);
    await ctx.api.editMessageText(replyChatId, replyMessageId, text, { parse_mode: "HTML" });
  } catch (err) {
    deps.logger.warn({ err }, "Không sửa được tin xác nhận sau khi LLM đoán lại danh mục");
  }
}
