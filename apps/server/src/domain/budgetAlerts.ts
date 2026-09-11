import { getZonedParts } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as notificationsSentRepo from "../db/repos/notificationsSent.js";
import * as usersRepo from "../db/repos/users.js";
import { buildBudgetProgress } from "./reports.js";

export interface BudgetAlert {
  kind: "budget_80" | "budget_100";
  ref: string; // category id, or "total"
  label: string; // "🍜 Ăn uống" or "Tổng ngân sách"
  spent: number;
  budget: number;
  pct: number;
}

function monthKey(now: Date, timeZone: string): string {
  const p = getZonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/**
 * Checks every budgeted category (and the total budget) against the
 * 80%/100% thresholds. Each threshold fires at most once per category per
 * month — call this after any change that could push spending over a
 * threshold (new/edited expense).
 */
export function checkBudgetAlerts(db: Db, userId: number, now: Date, timeZone: string): BudgetAlert[] {
  const progress = buildBudgetProgress(db, userId, now, timeZone);
  const period = monthKey(now, timeZone);
  const alerts: BudgetAlert[] = [];

  function consider(ref: string, label: string, spent: number, budget: number): void {
    if (budget <= 0) return;
    const pct = Math.round((spent / budget) * 100);
    if (pct >= 100 && !notificationsSentRepo.hasSent(db, userId, "budget_100", ref, period)) {
      alerts.push({ kind: "budget_100", ref, label, spent, budget, pct });
      notificationsSentRepo.markSent(db, userId, "budget_100", ref, period);
    } else if (pct >= 80 && !notificationsSentRepo.hasSent(db, userId, "budget_80", ref, period)) {
      alerts.push({ kind: "budget_80", ref, label, spent, budget, pct });
      notificationsSentRepo.markSent(db, userId, "budget_80", ref, period);
    }
  }

  for (const item of progress.byCategory) {
    consider(item.category.id, `${item.category.emoji} ${item.category.name}`, item.spent, item.budget);
  }

  // Only alert on the TOTAL budget when the user explicitly set one — the
  // derived "sum of category budgets" fallback (see buildBudgetProgress) is
  // fine for display, but would otherwise double up every category alert
  // whenever there's just one (or few) budgeted categories.
  const explicitTotalBudget = usersRepo.findById(db, userId)?.monthlyBudget;
  if (explicitTotalBudget != null) {
    consider("total", "Tổng ngân sách", progress.totalSpent, explicitTotalBudget);
  }

  return alerts;
}
