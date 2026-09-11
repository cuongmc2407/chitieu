import { overrideKey, parseMessage, type CategoryDef, type KeywordOverride, type MatchedBy, type ParseIssue } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import type { CategoryRow } from "../db/repos/categories.js";
import * as keywordOverridesRepo from "../db/repos/keywordOverrides.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import type { TransactionRow, TxSource } from "../db/repos/transactions.js";

export interface ParseEnv {
  timeZone: string;
  bareNumberThreshold: number;
}

export interface LedgerItemResult {
  transaction: TransactionRow;
  category: CategoryRow;
  matchedBy: MatchedBy;
}

export type LedgerResult = { ok: true; items: LedgerItemResult[] } | { ok: false; errors: ParseIssue[] };

/** Loads a user's category dictionary + learned overrides in the shape @chitieu/core#parseMessage expects. */
export function loadParseOptions(db: Db, userId: number): { categories: CategoryDef[]; overrides: KeywordOverride[] } {
  const categoryRows = categoriesRepo.listByUser(db, userId);
  const overrideRows = keywordOverridesRepo.listByUser(db, userId);
  return {
    categories: categoriesRepo.toCategoryDefs(categoryRows),
    overrides: overrideRows.map((o) => ({ keyword: o.keyword, categoryId: o.categoryId })),
  };
}

function requireCategory(db: Db, userId: number, categoryId: string): CategoryRow {
  const row = categoriesRepo.getById(db, userId, categoryId);
  if (!row) throw new Error(`Danh mục không tồn tại: ${categoryId} (user ${userId})`);
  return row;
}

export interface CreateFromTextOptions {
  source: TxSource;
  now: Date;
  /** clientId for item N is `${clientIdPrefix}:${N}` — must be stable across retries/resends. */
  clientIdPrefix: string;
  telegramMessageId?: number;
  telegramReplyMessageId?: number;
}

/**
 * Parses `text` and persists every item as a transaction. Idempotent: an
 * item whose client_id already exists is returned as-is instead of being
 * inserted again (protects against Telegram resending the same update).
 */
export function createFromText(db: Db, userId: number, text: string, env: ParseEnv, opts: CreateFromTextOptions): LedgerResult {
  const { categories, overrides } = loadParseOptions(db, userId);
  const parsed = parseMessage(text, opts.now, {
    categories,
    overrides,
    timeZone: env.timeZone,
    bareNumberThreshold: env.bareNumberThreshold,
  });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const run = db.transaction((): LedgerItemResult[] =>
    parsed.items.map((item, index) => {
      const category = requireCategory(db, userId, item.categoryId);
      const clientId = `${opts.clientIdPrefix}:${index}`;
      const existing = transactionsRepo.findByClientId(db, userId, clientId);
      const transaction =
        existing ??
        transactionsRepo.create(db, userId, {
          amount: item.amount,
          type: item.type,
          categoryId: item.categoryId,
          note: item.note,
          rawText: item.raw,
          occurredAt: item.occurredAt.toISOString(),
          source: opts.source,
          clientId,
          telegramMessageId: opts.telegramMessageId,
          telegramReplyMessageId: opts.telegramReplyMessageId,
          itemIndex: index,
        });
      return { transaction, category, matchedBy: item.matchedBy };
    }),
  );

  return { ok: true, items: run() };
}

export interface UpdateFromEditedTextOptions {
  now: Date;
  clientIdPrefix: string;
  telegramMessageId: number;
  telegramReplyMessageId?: number;
}

/**
 * Re-parses a Telegram message the user just edited and reconciles it
 * against the transaction(s) originally created from it: same position ->
 * update in place, new position -> insert, position that no longer exists
 * -> soft-delete.
 */
export function updateFromEditedText(db: Db, userId: number, text: string, env: ParseEnv, opts: UpdateFromEditedTextOptions): LedgerResult {
  const { categories, overrides } = loadParseOptions(db, userId);
  const parsed = parseMessage(text, opts.now, {
    categories,
    overrides,
    timeZone: env.timeZone,
    bareNumberThreshold: env.bareNumberThreshold,
  });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const run = db.transaction((): LedgerItemResult[] => {
    const existing = transactionsRepo.listByTelegramMessageId(db, userId, opts.telegramMessageId);

    const items = parsed.items.map((item, index) => {
      const category = requireCategory(db, userId, item.categoryId);
      const prior = existing[index];
      const patch = {
        amount: item.amount,
        type: item.type,
        categoryId: item.categoryId,
        note: item.note,
        rawText: item.raw,
        occurredAt: item.occurredAt.toISOString(),
      };

      if (prior) {
        const updated = transactionsRepo.update(db, userId, prior.id, {
          ...patch,
          telegramReplyMessageId: opts.telegramReplyMessageId ?? prior.telegramReplyMessageId,
        });
        return { transaction: updated ?? prior, category, matchedBy: item.matchedBy };
      }

      const clientId = `${opts.clientIdPrefix}:${index}`;
      const transaction =
        transactionsRepo.findByClientId(db, userId, clientId) ??
        transactionsRepo.create(db, userId, {
          ...patch,
          source: "telegram",
          clientId,
          telegramMessageId: opts.telegramMessageId,
          telegramReplyMessageId: opts.telegramReplyMessageId,
          itemIndex: index,
        });
      return { transaction, category, matchedBy: item.matchedBy };
    });

    for (let i = parsed.items.length; i < existing.length; i++) {
      const extra = existing[i];
      if (extra) transactionsRepo.softDelete(db, userId, extra.id);
    }

    return items;
  });

  return { ok: true, items: run() };
}

export interface ChangeCategoryResult {
  transaction: TransactionRow;
  category: CategoryRow;
}

/** Applies a manual category correction and teaches the bot the note -> category mapping for next time. */
export function changeCategory(db: Db, userId: number, transactionId: string, categoryId: string): ChangeCategoryResult | null {
  const category = categoriesRepo.getById(db, userId, categoryId);
  if (!category) return null;

  const run = db.transaction((): TransactionRow | null => {
    const updated = transactionsRepo.update(db, userId, transactionId, { categoryId, type: category.type });
    if (!updated) return null;
    const key = overrideKey(updated.note);
    if (key) keywordOverridesRepo.upsert(db, userId, key, categoryId);
    return updated;
  });

  const transaction = run();
  return transaction ? { transaction, category } : null;
}

export function undo(db: Db, userId: number, transactionId: string): TransactionRow | null {
  const ok = transactionsRepo.softDelete(db, userId, transactionId);
  return ok ? (transactionsRepo.findById(db, userId, transactionId) ?? null) : null;
}

export function restoreTransaction(db: Db, userId: number, transactionId: string): TransactionRow | null {
  const ok = transactionsRepo.restore(db, userId, transactionId);
  return ok ? (transactionsRepo.findById(db, userId, transactionId) ?? null) : null;
}

/** For /xoa — undoes the single most recently created active transaction. */
export function undoLatest(db: Db, userId: number): TransactionRow | null {
  const tx = transactionsRepo.findLatestActive(db, userId);
  if (!tx) return null;
  return undo(db, userId, tx.id);
}

/** For the "Hoàn tác tất cả" button on a multi-item confirmation message. */
export function undoAllForMessage(db: Db, userId: number, telegramMessageId: number): number {
  return transactionsRepo.softDeleteAllByTelegramMessageId(db, userId, telegramMessageId);
}
