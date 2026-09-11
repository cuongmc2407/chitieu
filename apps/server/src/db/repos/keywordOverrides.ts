import type { Db } from "../index.js";

export interface KeywordOverrideRow {
  id: number;
  userId: number;
  keyword: string;
  categoryId: string;
  createdAt: string;
}

interface RawRow {
  id: number;
  user_id: number;
  keyword: string;
  category_id: string;
  created_at: string;
}

function mapRow(row: RawRow): KeywordOverrideRow {
  return { id: row.id, userId: row.user_id, keyword: row.keyword, categoryId: row.category_id, createdAt: row.created_at };
}

export function listByUser(db: Db, userId: number): KeywordOverrideRow[] {
  const rows = db.prepare("SELECT * FROM keyword_overrides WHERE user_id = ?").all(userId) as RawRow[];
  return rows.map(mapRow);
}

/** Teaches the bot: this keyword should map to this category from now on. */
export function upsert(db: Db, userId: number, keyword: string, categoryId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO keyword_overrides (user_id, keyword, category_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, keyword) DO UPDATE SET category_id = excluded.category_id`,
  ).run(userId, keyword, categoryId, now);
}

export function deleteByKeyword(db: Db, userId: number, keyword: string): boolean {
  const info = db.prepare("DELETE FROM keyword_overrides WHERE user_id = ? AND keyword = ?").run(userId, keyword);
  return info.changes > 0;
}

export function deleteById(db: Db, userId: number, id: number): boolean {
  const info = db.prepare("DELETE FROM keyword_overrides WHERE user_id = ? AND id = ?").run(userId, id);
  return info.changes > 0;
}
