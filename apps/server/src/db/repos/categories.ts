import { stripDiacritics, type CategoryDef, type TxType } from "@chitieu/core";
import { randomUUID } from "node:crypto";
import type { Db } from "../index.js";

export interface CategoryRow {
  id: string;
  rowId: number;
  userId: number;
  key: string | null;
  name: string;
  emoji: string;
  type: TxType;
  keywords: string[];
  monthlyBudget: number | null;
  sortOrder: number;
  isFallback: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RawCategoryRow {
  id: string;
  row_id: number;
  user_id: number;
  key: string | null;
  name: string;
  emoji: string;
  type: TxType;
  keywords: string;
  monthly_budget: number | null;
  sort_order: number;
  is_fallback: number;
  hidden: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = "id, rowid AS row_id, user_id, key, name, emoji, type, keywords, monthly_budget, sort_order, is_fallback, hidden, created_at, updated_at";

function mapCategory(row: RawCategoryRow): CategoryRow {
  return {
    id: row.id,
    rowId: row.row_id,
    userId: row.user_id,
    key: row.key,
    name: row.name,
    emoji: row.emoji,
    type: row.type,
    keywords: JSON.parse(row.keywords) as string[],
    monthlyBudget: row.monthly_budget,
    sortOrder: row.sort_order,
    isFallback: row.is_fallback === 1,
    hidden: row.hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listByUser(db: Db, userId: number, opts: { includeHidden?: boolean } = {}): CategoryRow[] {
  const sql = opts.includeHidden
    ? `SELECT ${SELECT_COLUMNS} FROM categories WHERE user_id = ? ORDER BY sort_order, rowid`
    : `SELECT ${SELECT_COLUMNS} FROM categories WHERE user_id = ? AND hidden = 0 ORDER BY sort_order, rowid`;
  const rows = db.prepare(sql).all(userId) as RawCategoryRow[];
  return rows.map(mapCategory);
}

export function getById(db: Db, userId: number, categoryId: string): CategoryRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM categories WHERE user_id = ? AND id = ?`).get(userId, categoryId) as
    | RawCategoryRow
    | undefined;
  return row ? mapCategory(row) : undefined;
}

export function getByRowId(db: Db, userId: number, rowId: number): CategoryRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM categories WHERE user_id = ? AND rowid = ?`).get(userId, rowId) as
    | RawCategoryRow
    | undefined;
  return row ? mapCategory(row) : undefined;
}

export function findByKey(db: Db, userId: number, key: string): CategoryRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM categories WHERE user_id = ? AND key = ?`).get(userId, key) as
    | RawCategoryRow
    | undefined;
  return row ? mapCategory(row) : undefined;
}

/** Diacritic/case-insensitive lookup by display name, for the /ngansach command. */
export function findByNameLoose(db: Db, userId: number, nameQuery: string): CategoryRow | undefined {
  const rows = listByUser(db, userId, { includeHidden: true });
  const normalize = (s: string) => stripDiacritics(s.trim()).toLowerCase();
  const target = normalize(nameQuery);
  return rows.find((r) => normalize(r.name) === target);
}

export function create(
  db: Db,
  userId: number,
  input: { key?: string | null; name: string; emoji: string; type: TxType; keywords?: string[]; sortOrder?: number; isFallback?: boolean },
): CategoryRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO categories (id, user_id, key, name, emoji, type, keywords, sort_order, is_fallback, hidden, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    userId,
    input.key ?? null,
    input.name,
    input.emoji,
    input.type,
    JSON.stringify(input.keywords ?? []),
    input.sortOrder ?? 0,
    input.isFallback ? 1 : 0,
    now,
    now,
  );
  const row = getById(db, userId, id);
  if (!row) throw new Error("Không tạo được danh mục");
  return row;
}

/** Seeds a brand-new user's category list from the shared default dictionary. Call inside a transaction. */
export function seedDefaults(db: Db, userId: number, defaults: CategoryDef[]): void {
  defaults.forEach((def, index) => {
    create(db, userId, {
      key: def.id,
      name: def.name,
      emoji: def.emoji,
      type: def.type,
      keywords: def.keywords,
      sortOrder: index,
      isFallback: def.isFallback,
    });
  });
}

export function setMonthlyBudget(db: Db, userId: number, categoryId: string, amount: number | null): void {
  db.prepare("UPDATE categories SET monthly_budget = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(
    amount,
    new Date().toISOString(),
    userId,
    categoryId,
  );
}

export function setHidden(db: Db, userId: number, categoryId: string, hidden: boolean): void {
  db.prepare("UPDATE categories SET hidden = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(
    hidden ? 1 : 0,
    new Date().toISOString(),
    userId,
    categoryId,
  );
}

export interface CategoryPatch {
  name?: string;
  emoji?: string;
  keywords?: string[];
  sortOrder?: number;
  hidden?: boolean;
}

export function update(db: Db, userId: number, categoryId: string, patch: CategoryPatch): CategoryRow | undefined {
  const existing = getById(db, userId, categoryId);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  db.prepare(
    `UPDATE categories SET name = ?, emoji = ?, keywords = ?, sort_order = ?, hidden = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
  ).run(next.name, next.emoji, JSON.stringify(next.keywords), next.sortOrder, next.hidden ? 1 : 0, new Date().toISOString(), userId, categoryId);
  return getById(db, userId, categoryId);
}

export function findFallback(db: Db, userId: number, type: TxType): CategoryRow | undefined {
  const rows = listByUser(db, userId, { includeHidden: true });
  return rows.find((c) => c.isFallback && c.type === type);
}

/** Permanently deletes a category row. Callers must reassign its transactions first (see domain/categories.ts). */
export function remove(db: Db, userId: number, categoryId: string): boolean {
  const info = db.prepare("DELETE FROM categories WHERE user_id = ? AND id = ?").run(userId, categoryId);
  return info.changes > 0;
}

/** Converts DB rows into the plain CategoryDef[] shape that @chitieu/core#parseMessage/categorize expect. */
export function toCategoryDefs(rows: CategoryRow[]): CategoryDef[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    type: r.type,
    keywords: r.keywords,
    isFallback: r.isFallback,
  }));
}
