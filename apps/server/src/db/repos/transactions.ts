import type { TxType } from "@chitieu/core";
import { randomUUID } from "node:crypto";
import type { Db } from "../index.js";

export type TxSource = "telegram" | "web" | "ios";

export interface TransactionRow {
  id: string;
  rowId: number;
  userId: number;
  amount: number;
  type: TxType;
  categoryId: string;
  note: string;
  rawText: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  source: TxSource;
  clientId: string;
  telegramMessageId: number | null;
  telegramReplyMessageId: number | null;
  itemIndex: number;
  actualSyncedAt: string | null;
  /** Set when this row was written automatically from a monthly fixed cost. */
  fixedCostId: string | null;
}

interface RawTxRow {
  id: string;
  row_id: number;
  user_id: number;
  amount: number;
  type: TxType;
  category_id: string;
  note: string;
  raw_text: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  source: TxSource;
  client_id: string;
  telegram_message_id: number | null;
  telegram_reply_message_id: number | null;
  item_index: number;
  actual_synced_at: string | null;
  fixed_cost_id: string | null;
}

const SELECT_COLUMNS = `id, rowid AS row_id, user_id, amount, type, category_id, note, raw_text, occurred_at, created_at,
  updated_at, deleted_at, source, client_id, telegram_message_id, telegram_reply_message_id, item_index, actual_synced_at,
  fixed_cost_id`;

function mapTx(row: RawTxRow): TransactionRow {
  return {
    id: row.id,
    rowId: row.row_id,
    userId: row.user_id,
    amount: row.amount,
    type: row.type,
    categoryId: row.category_id,
    note: row.note,
    rawText: row.raw_text,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    source: row.source,
    clientId: row.client_id,
    telegramMessageId: row.telegram_message_id,
    telegramReplyMessageId: row.telegram_reply_message_id,
    itemIndex: row.item_index,
    actualSyncedAt: row.actual_synced_at,
    fixedCostId: row.fixed_cost_id,
  };
}

export interface CreateTxInput {
  amount: number;
  type: TxType;
  categoryId: string;
  note: string;
  rawText: string;
  occurredAt: string;
  source: TxSource;
  clientId: string;
  telegramMessageId?: number | null;
  telegramReplyMessageId?: number | null;
  itemIndex?: number;
  fixedCostId?: string | null;
}

export function create(db: Db, userId: number, input: CreateTxInput): TransactionRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO transactions
      (id, user_id, amount, type, category_id, note, raw_text, occurred_at, created_at, updated_at,
       source, client_id, telegram_message_id, telegram_reply_message_id, item_index, fixed_cost_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.amount,
    input.type,
    input.categoryId,
    input.note,
    input.rawText,
    input.occurredAt,
    now,
    now,
    input.source,
    input.clientId,
    input.telegramMessageId ?? null,
    input.telegramReplyMessageId ?? null,
    input.itemIndex ?? 0,
    input.fixedCostId ?? null,
  );
  const row = findById(db, userId, id);
  if (!row) throw new Error("Không tạo được giao dịch");
  return row;
}

export function findById(db: Db, userId: number, id: string): TransactionRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM transactions WHERE user_id = ? AND id = ?`).get(userId, id) as
    | RawTxRow
    | undefined;
  return row ? mapTx(row) : undefined;
}

export function findByRowId(db: Db, userId: number, rowId: number): TransactionRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM transactions WHERE user_id = ? AND rowid = ?`).get(userId, rowId) as
    | RawTxRow
    | undefined;
  return row ? mapTx(row) : undefined;
}

export function findByClientId(db: Db, userId: number, clientId: string): TransactionRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM transactions WHERE user_id = ? AND client_id = ?`).get(
    userId,
    clientId,
  ) as RawTxRow | undefined;
  return row ? mapTx(row) : undefined;
}

/** All (non-deleted) items that came from the same Telegram message, ordered by item_index — for edited_message handling. */
export function listByTelegramMessageId(db: Db, userId: number, telegramMessageId: number): TransactionRow[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM transactions
       WHERE user_id = ? AND telegram_message_id = ? AND deleted_at IS NULL
       ORDER BY item_index`,
    )
    .all(userId, telegramMessageId) as RawTxRow[];
  return rows.map(mapTx);
}

export function findLatestActive(db: Db, userId: number, source?: TxSource): TransactionRow | undefined {
  const row = source
    ? (db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM transactions
           WHERE user_id = ? AND source = ? AND deleted_at IS NULL
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(userId, source) as RawTxRow | undefined)
    : (db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM transactions
           WHERE user_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(userId) as RawTxRow | undefined);
  return row ? mapTx(row) : undefined;
}

export interface UpdateTxPatch {
  amount?: number;
  type?: TxType;
  categoryId?: string;
  note?: string;
  rawText?: string;
  occurredAt?: string;
  telegramReplyMessageId?: number | null;
}

export function update(db: Db, userId: number, id: string, patch: UpdateTxPatch): TransactionRow | undefined {
  const existing = findById(db, userId, id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  db.prepare(
    `UPDATE transactions SET amount = ?, type = ?, category_id = ?, note = ?, raw_text = ?, occurred_at = ?,
       telegram_reply_message_id = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
  ).run(
    next.amount,
    next.type,
    next.categoryId,
    next.note,
    next.rawText,
    next.occurredAt,
    next.telegramReplyMessageId,
    new Date().toISOString(),
    userId,
    id,
  );
  return findById(db, userId, id);
}

export function softDelete(db: Db, userId: number, id: string): boolean {
  const now = new Date().toISOString();
  const info = db
    .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL")
    .run(now, now, userId, id);
  return info.changes > 0;
}

export function restore(db: Db, userId: number, id: string): boolean {
  const now = new Date().toISOString();
  const info = db
    .prepare("UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL")
    .run(now, userId, id);
  return info.changes > 0;
}

export interface ListRangeOptions {
  from: string; // ISO, inclusive
  to: string; // ISO, exclusive
  type?: TxType;
  includeDeleted?: boolean;
}

export function listRange(db: Db, userId: number, opts: ListRangeOptions): TransactionRow[] {
  const conditions = ["user_id = ?", "occurred_at >= ?", "occurred_at < ?"];
  const params: unknown[] = [userId, opts.from, opts.to];
  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (!opts.includeDeleted) conditions.push("deleted_at IS NULL");
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM transactions WHERE ${conditions.join(" AND ")} ORDER BY occurred_at`)
    .all(...params) as RawTxRow[];
  return rows.map(mapTx);
}

/** Sum of amounts in [from, to) for a given type (default 'expense'), non-deleted only. */
export function sumRange(db: Db, userId: number, from: string, to: string, type: TxType = "expense"): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE user_id = ? AND type = ? AND occurred_at >= ? AND occurred_at < ? AND deleted_at IS NULL`,
    )
    .get(userId, type, from, to) as { total: number };
  return row.total;
}

/** Sum of amounts in [from, to) for one category, non-deleted only. Used for budget-threshold checks. */
export function sumRangeForCategory(db: Db, userId: number, categoryId: string, from: string, to: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE user_id = ? AND category_id = ? AND type = 'expense' AND occurred_at >= ? AND occurred_at < ? AND deleted_at IS NULL`,
    )
    .get(userId, categoryId, from, to) as { total: number };
  return row.total;
}

export function softDeleteAllByTelegramMessageId(db: Db, userId: number, telegramMessageId: number): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND telegram_message_id = ? AND deleted_at IS NULL",
    )
    .run(now, now, userId, telegramMessageId);
  return info.changes;
}

export interface SearchOptions {
  from?: string;
  to?: string;
  categoryId?: string;
  /** Free-text search, matched against `note` (case/diacritic-insensitive substring). */
  q?: string;
  type?: TxType;
}

/** Used by GET /api/transactions — like listRange but with category/text filters, newest first. */
export function search(db: Db, userId: number, opts: SearchOptions): TransactionRow[] {
  const conditions = ["user_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [userId];
  if (opts.from) {
    conditions.push("occurred_at >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push("occurred_at < ?");
    params.push(opts.to);
  }
  if (opts.categoryId) {
    conditions.push("category_id = ?");
    params.push(opts.categoryId);
  }
  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts.q) {
    conditions.push("note LIKE ? ESCAPE '\\'");
    const escaped = opts.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    params.push(`%${escaped}%`);
  }
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM transactions WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC`)
    .all(...params) as RawTxRow[];
  return rows.map(mapTx);
}

/** Moves every (non-deleted) transaction from one category to another — used when a category is deleted. */
export function reassignCategory(db: Db, userId: number, fromCategoryId: string, toCategoryId: string): number {
  const info = db
    .prepare("UPDATE transactions SET category_id = ?, updated_at = ? WHERE user_id = ? AND category_id = ?")
    .run(toCategoryId, new Date().toISOString(), userId, fromCategoryId);
  return info.changes;
}

/** Rows never synced to Actual Budget, or edited/deleted since their last sync — includes soft-deleted rows on purpose. */
export function listPendingActualSync(db: Db, userId: number): TransactionRow[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM transactions
       WHERE user_id = ? AND (actual_synced_at IS NULL OR updated_at > actual_synced_at)
       ORDER BY created_at`,
    )
    .all(userId) as RawTxRow[];
  return rows.map(mapTx);
}

export function markActualSynced(db: Db, userId: number, id: string, syncedAtIso: string): void {
  db.prepare("UPDATE transactions SET actual_synced_at = ? WHERE user_id = ? AND id = ?").run(syncedAtIso, userId, id);
}
