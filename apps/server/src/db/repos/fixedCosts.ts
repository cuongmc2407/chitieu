import { randomUUID } from "node:crypto";
import type { Db } from "../index.js";

export interface FixedCostRow {
  id: string;
  userId: number;
  name: string;
  amount: number;
  categoryId: string;
  dayOfMonth: number;
  note: string;
  autoPost: boolean;
  active: boolean;
  /** 'yyyy-mm' of the last month this cost was written to the ledger. */
  lastPostedPeriod: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawFixedCostRow {
  id: string;
  user_id: number;
  name: string;
  amount: number;
  category_id: string;
  day_of_month: number;
  note: string;
  auto_post: number;
  active: number;
  last_posted_period: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  "id, user_id, name, amount, category_id, day_of_month, note, auto_post, active, last_posted_period, created_at, updated_at";

function mapFixedCost(row: RawFixedCostRow): FixedCostRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    amount: row.amount,
    categoryId: row.category_id,
    dayOfMonth: row.day_of_month,
    note: row.note,
    autoPost: row.auto_post === 1,
    active: row.active === 1,
    lastPostedPeriod: row.last_posted_period,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listByUser(db: Db, userId: number, opts: { includeInactive?: boolean } = {}): FixedCostRow[] {
  const sql = opts.includeInactive
    ? `SELECT ${SELECT_COLUMNS} FROM fixed_costs WHERE user_id = ? ORDER BY day_of_month, name`
    : `SELECT ${SELECT_COLUMNS} FROM fixed_costs WHERE user_id = ? AND active = 1 ORDER BY day_of_month, name`;
  const rows = db.prepare(sql).all(userId) as RawFixedCostRow[];
  return rows.map(mapFixedCost);
}

export function getById(db: Db, userId: number, id: string): FixedCostRow | undefined {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM fixed_costs WHERE user_id = ? AND id = ?`).get(userId, id) as
    | RawFixedCostRow
    | undefined;
  return row ? mapFixedCost(row) : undefined;
}

export interface CreateFixedCostInput {
  name: string;
  amount: number;
  categoryId: string;
  dayOfMonth: number;
  note?: string;
  autoPost?: boolean;
  active?: boolean;
  lastPostedPeriod?: string | null;
}

export function create(db: Db, userId: number, input: CreateFixedCostInput): FixedCostRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO fixed_costs
       (id, user_id, name, amount, category_id, day_of_month, note, auto_post, active, last_posted_period, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.name,
    input.amount,
    input.categoryId,
    input.dayOfMonth,
    input.note ?? "",
    input.autoPost === false ? 0 : 1,
    input.active === false ? 0 : 1,
    input.lastPostedPeriod ?? null,
    now,
    now,
  );
  const row = getById(db, userId, id);
  if (!row) throw new Error("Không tạo được chi phí cố định");
  return row;
}

export interface FixedCostPatch {
  name?: string;
  amount?: number;
  categoryId?: string;
  dayOfMonth?: number;
  note?: string;
  autoPost?: boolean;
  active?: boolean;
}

export function update(db: Db, userId: number, id: string, patch: FixedCostPatch): FixedCostRow | undefined {
  const existing = getById(db, userId, id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  db.prepare(
    `UPDATE fixed_costs SET name = ?, amount = ?, category_id = ?, day_of_month = ?, note = ?, auto_post = ?, active = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
  ).run(
    next.name,
    next.amount,
    next.categoryId,
    next.dayOfMonth,
    next.note,
    next.autoPost ? 1 : 0,
    next.active ? 1 : 0,
    new Date().toISOString(),
    userId,
    id,
  );
  return getById(db, userId, id);
}

export function markPosted(db: Db, userId: number, id: string, period: string): void {
  db.prepare("UPDATE fixed_costs SET last_posted_period = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(
    period,
    new Date().toISOString(),
    userId,
    id,
  );
}

export function remove(db: Db, userId: number, id: string): boolean {
  const info = db.prepare("DELETE FROM fixed_costs WHERE user_id = ? AND id = ?").run(userId, id);
  return info.changes > 0;
}

/** Points every fixed cost of one category at another — used when a category is deleted. */
export function reassignCategory(db: Db, userId: number, fromCategoryId: string, toCategoryId: string): number {
  const info = db
    .prepare("UPDATE fixed_costs SET category_id = ?, updated_at = ? WHERE user_id = ? AND category_id = ?")
    .run(toCategoryId, new Date().toISOString(), userId, fromCategoryId);
  return info.changes;
}
