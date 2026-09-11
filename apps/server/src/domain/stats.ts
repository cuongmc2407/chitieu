import { getZonedParts, type TxType } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import type { TransactionRow } from "../db/repos/transactions.js";

export interface CategoryTotal {
  categoryId: string;
  total: number;
}

export interface DayTotal {
  /** yyyy-mm-dd, in the report's timezone. */
  date: string;
  total: number;
}

export function sumByType(db: Db, userId: number, from: string, to: string, type: TxType = "expense"): number {
  return transactionsRepo.sumRange(db, userId, from, to, type);
}

export function totalsByCategory(db: Db, userId: number, from: string, to: string, type: TxType = "expense"): CategoryTotal[] {
  const rows = transactionsRepo.listRange(db, userId, { from, to, type });
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amount);
  return [...totals.entries()].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
}

export function totalsByDay(db: Db, userId: number, from: string, to: string, timeZone: string, type: TxType = "expense"): DayTotal[] {
  const rows = transactionsRepo.listRange(db, userId, { from, to, type });
  const totals = new Map<string, number>();
  for (const r of rows) {
    const p = getZonedParts(new Date(r.occurredAt), timeZone);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) ?? 0) + r.amount);
  }
  return [...totals.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
}

export function topTransactions(db: Db, userId: number, from: string, to: string, limit = 1, type: TxType = "expense"): TransactionRow[] {
  const rows = transactionsRepo.listRange(db, userId, { from, to, type });
  return [...rows].sort((a, b) => b.amount - a.amount).slice(0, limit);
}
