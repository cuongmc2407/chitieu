import { getZonedParts, zonedToUtc, type YMD } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import type { CategoryRow } from "../db/repos/categories.js";
import * as fixedCostsRepo from "../db/repos/fixedCosts.js";
import type { FixedCostRow } from "../db/repos/fixedCosts.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import type { TransactionRow } from "../db/repos/transactions.js";
import * as usersRepo from "../db/repos/users.js";

/** 'yyyy-mm' — the key stored in fixed_costs.last_posted_period. */
export function periodKey(ymd: Pick<YMD, "year" | "month">): string {
  return `${ymd.year}-${String(ymd.month).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The day this cost actually falls on in a given month — day 31 lands on 28/02, 30/04, etc. */
export function effectiveDueDay(dayOfMonth: number, year: number, month: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month));
}

export interface FixedCostStatus {
  cost: FixedCostRow;
  /** Null only if the category was deleted out from under it — the UI shows a warning. */
  category: CategoryRow | null;
  dueDay: number;
  postedThisMonth: boolean;
}

export function listWithStatus(db: Db, userId: number, now: Date, timeZone: string, includeInactive = true): FixedCostStatus[] {
  const today = getZonedParts(now, timeZone);
  const period = periodKey(today);
  return fixedCostsRepo.listByUser(db, userId, { includeInactive }).map((cost) => ({
    cost,
    category: categoriesRepo.getById(db, userId, cost.categoryId) ?? null,
    dueDay: effectiveDueDay(cost.dayOfMonth, today.year, today.month),
    postedThisMonth: cost.lastPostedPeriod === period,
  }));
}

/** Total of every active cost — what this user is committed to spending each month before anything else. */
export function monthlyTotal(db: Db, userId: number): number {
  return fixedCostsRepo.listByUser(db, userId).reduce((sum, c) => sum + c.amount, 0);
}

export interface PostedFixedCost {
  cost: FixedCostRow;
  category: CategoryRow;
  transaction: TransactionRow;
}

/**
 * Writes every active auto-post cost whose due day has arrived this month
 * and that hasn't been written yet. Safe to run repeatedly: the ledger row
 * is keyed by `fixed:<id>:<yyyy-mm>`, so a second run finds the existing
 * transaction instead of inserting a duplicate.
 */
export function postDueFixedCostsForUser(db: Db, userId: number, now: Date, timeZone: string): PostedFixedCost[] {
  const today = getZonedParts(now, timeZone);
  const period = periodKey(today);
  const posted: PostedFixedCost[] = [];

  for (const cost of fixedCostsRepo.listByUser(db, userId)) {
    if (!cost.autoPost) continue;
    if (cost.lastPostedPeriod === period) continue;

    const dueDay = effectiveDueDay(cost.dayOfMonth, today.year, today.month);
    if (today.day < dueDay) continue;

    const category = categoriesRepo.getById(db, userId, cost.categoryId);
    if (!category) continue; // category deleted — leave it for the user to fix

    const clientId = `fixed:${cost.id}:${period}`;
    const occurredAt = zonedToUtc(
      { year: today.year, month: today.month, day: dueDay, hour: 12, minute: 0, second: 0 },
      timeZone,
    ).toISOString();

    const run = db.transaction((): TransactionRow => {
      const transaction =
        transactionsRepo.findByClientId(db, userId, clientId) ??
        transactionsRepo.create(db, userId, {
          amount: cost.amount,
          type: category.type,
          categoryId: category.id,
          note: cost.name,
          rawText: cost.note || cost.name,
          occurredAt,
          source: "telegram",
          clientId,
          fixedCostId: cost.id,
        });
      fixedCostsRepo.markPosted(db, userId, cost.id, period);
      return transaction;
    });

    posted.push({ cost, category, transaction: run() });
  }

  return posted;
}

export interface PostedForUser {
  user: ReturnType<typeof usersRepo.listAll>[number];
  posted: PostedFixedCost[];
}

/** Same as postDueFixedCostsForUser, across every user — used by the daily job. */
export function postDueFixedCosts(db: Db, now: Date, timeZone: string): PostedForUser[] {
  return usersRepo
    .listAll(db)
    .map((user) => ({ user, posted: postDueFixedCostsForUser(db, user.id, now, timeZone) }))
    .filter((r) => r.posted.length > 0);
}

/**
 * Decides the `last_posted_period` a brand-new cost should start with: if
 * its due day already passed this month, mark the current month as done so
 * adding it today doesn't retroactively charge a month the user most
 * likely already logged by hand.
 */
export function initialPostedPeriod(dayOfMonth: number, now: Date, timeZone: string): string | null {
  const today = getZonedParts(now, timeZone);
  const dueDay = effectiveDueDay(dayOfMonth, today.year, today.month);
  return today.day > dueDay ? periodKey(today) : null;
}
