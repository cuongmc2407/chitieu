import type { Db } from "../index.js";

export type NotificationKind = "budget_80" | "budget_100" | "weekly_report" | "monthly_report" | "daily_reminder";

export function hasSent(db: Db, userId: number, kind: NotificationKind, ref: string, period: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM notifications_sent WHERE user_id = ? AND kind = ? AND ref = ? AND period = ?")
    .get(userId, kind, ref, period);
  return row !== undefined;
}

export function markSent(db: Db, userId: number, kind: NotificationKind, ref: string, period: string): void {
  db.prepare(
    `INSERT INTO notifications_sent (user_id, kind, ref, period, sent_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, kind, ref, period) DO NOTHING`,
  ).run(userId, kind, ref, period, new Date().toISOString());
}
