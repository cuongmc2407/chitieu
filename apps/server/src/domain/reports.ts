import { getZonedParts, monthRange, previousPeriod, rangeFor, weekdayOf, type Period, type PeriodKind, type YMD } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import type { CategoryRow } from "../db/repos/categories.js";
import * as usersRepo from "../db/repos/users.js";
import { sumByType, topTransactions, totalsByCategory, totalsByDay } from "./stats.js";
import type { TransactionRow } from "../db/repos/transactions.js";

const WEEKDAY_LABELS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export interface CategoryShare {
  category: CategoryRow;
  total: number;
  pct: number;
}

export interface PeriodReport {
  kind: PeriodKind;
  period: Period;
  totalExpense: number;
  totalIncome: number;
  /** % change of totalExpense vs the immediately preceding period of the same length. Null if the previous period had no expenses. */
  changePct: number | null;
  byCategory: CategoryShare[];
  topExpense: { transaction: TransactionRow; category: CategoryRow } | null;
  busiestDay: { date: string; total: number; weekdayLabel: string } | null;
  dailyAverage: number;
}

/** Builds the data for a /tuan, /thang, or scheduled weekly/monthly report. `anchorYmd` is any date inside the period. */
export function buildPeriodReport(db: Db, userId: number, kind: "week" | "month", anchorYmd: YMD, timeZone: string): PeriodReport {
  const period = rangeFor(kind, anchorYmd, timeZone);
  const prev = previousPeriod(period, kind, timeZone);

  const totalExpense = sumByType(db, userId, period.start.toISOString(), period.end.toISOString(), "expense");
  const totalIncome = sumByType(db, userId, period.start.toISOString(), period.end.toISOString(), "income");
  const prevTotalExpense = sumByType(db, userId, prev.start.toISOString(), prev.end.toISOString(), "expense");
  const changePct = prevTotalExpense > 0 ? Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100) : null;

  const categories = categoriesRepo.listByUser(db, userId, { includeHidden: true });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const byCategory: CategoryShare[] = totalsByCategory(db, userId, period.start.toISOString(), period.end.toISOString(), "expense")
    .map((ct) => {
      const category = categoryById.get(ct.categoryId);
      if (!category) return null;
      return { category, total: ct.total, pct: totalExpense > 0 ? Math.round((ct.total / totalExpense) * 100) : 0 };
    })
    .filter((x): x is CategoryShare => x !== null);

  const [topTx] = topTransactions(db, userId, period.start.toISOString(), period.end.toISOString(), 1, "expense");
  const fallbackCategory = categories[0];
  const topExpense = topTx && fallbackCategory ? { transaction: topTx, category: categoryById.get(topTx.categoryId) ?? fallbackCategory } : null;

  let busiestDay: PeriodReport["busiestDay"] = null;
  for (const d of totalsByDay(db, userId, period.start.toISOString(), period.end.toISOString(), timeZone, "expense")) {
    if (!busiestDay || d.total > busiestDay.total) {
      const parts = d.date.split("-").map(Number);
      const year = parts[0] ?? 1970;
      const month = parts[1] ?? 1;
      const day = parts[2] ?? 1;
      const weekday = weekdayOf({ year, month, day });
      busiestDay = { date: d.date, total: d.total, weekdayLabel: WEEKDAY_LABELS[weekday] ?? "" };
    }
  }

  const daySpan = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000));
  const dailyAverage = Math.round(totalExpense / daySpan);

  return { kind, period, totalExpense, totalIncome, changePct, byCategory, topExpense, busiestDay, dailyAverage };
}

export interface BudgetProgressItem {
  category: CategoryRow;
  spent: number;
  budget: number;
  pct: number;
}

export interface BudgetProgress {
  period: Period;
  /** User's total monthly budget if set, else the sum of every category budget, else null (hide the line entirely). */
  totalBudget: number | null;
  totalSpent: number;
  byCategory: BudgetProgressItem[];
}

/** Month-to-date budget progress — shown in both weekly and monthly reports, always for the CURRENT month. */
export function buildBudgetProgress(db: Db, userId: number, now: Date, timeZone: string): BudgetProgress {
  const period = monthRange(getZonedParts(now, timeZone), timeZone);
  const categories = categoriesRepo.listByUser(db, userId, { includeHidden: true });
  const user = usersRepo.findById(db, userId);
  const totalSpent = sumByType(db, userId, period.start.toISOString(), period.end.toISOString(), "expense");
  const spentByCategory = new Map(
    totalsByCategory(db, userId, period.start.toISOString(), period.end.toISOString(), "expense").map((c) => [c.categoryId, c.total]),
  );

  const byCategory: BudgetProgressItem[] = categories
    .filter((c): c is CategoryRow & { monthlyBudget: number } => c.monthlyBudget != null)
    .map((c) => {
      const spent = spentByCategory.get(c.id) ?? 0;
      return { category: c, spent, budget: c.monthlyBudget, pct: c.monthlyBudget > 0 ? Math.round((spent / c.monthlyBudget) * 100) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);

  const totalBudget = user?.monthlyBudget ?? (byCategory.length > 0 ? byCategory.reduce((sum, b) => sum + b.budget, 0) : null);

  return { period, totalBudget, totalSpent, byCategory };
}
