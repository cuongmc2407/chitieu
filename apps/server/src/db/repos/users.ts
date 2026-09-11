import type { Db } from "../index.js";

export interface UserRow {
  id: number;
  telegramId: number;
  username: string | null;
  name: string | null;
  reminderEnabled: boolean;
  monthlyBudget: number | null;
  createdAt: string;
}

interface RawUserRow {
  id: number;
  telegram_id: number;
  username: string | null;
  name: string | null;
  reminder_enabled: number;
  monthly_budget: number | null;
  created_at: string;
}

function mapUser(row: RawUserRow): UserRow {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    name: row.name,
    reminderEnabled: row.reminder_enabled === 1,
    monthlyBudget: row.monthly_budget,
    createdAt: row.created_at,
  };
}

export function findByTelegramId(db: Db, telegramId: number): UserRow | undefined {
  const row = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as RawUserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function findById(db: Db, userId: number): UserRow | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as RawUserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function create(db: Db, input: { telegramId: number; username?: string | null; name?: string | null }): UserRow {
  const now = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO users (telegram_id, username, name, reminder_enabled, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(input.telegramId, input.username ?? null, input.name ?? null, now);
  const row = findById(db, Number(info.lastInsertRowid));
  if (!row) throw new Error("Không tạo được user");
  return row;
}

export function setReminderEnabled(db: Db, userId: number, enabled: boolean): void {
  db.prepare("UPDATE users SET reminder_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, userId);
}

export function setMonthlyBudget(db: Db, userId: number, amount: number | null): void {
  db.prepare("UPDATE users SET monthly_budget = ? WHERE id = ?").run(amount, userId);
}

export function listAll(db: Db): UserRow[] {
  const rows = db.prepare("SELECT * FROM users").all() as RawUserRow[];
  return rows.map(mapUser);
}
