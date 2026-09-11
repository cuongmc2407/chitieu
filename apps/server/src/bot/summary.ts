import { dayRange, getZonedParts, monthRange } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import * as usersRepo from "../db/repos/users.js";
import { sumByType } from "../domain/stats.js";
import type { ConfirmationSummary } from "./format.js";

/** Today/month-to-date expense totals + the effective total monthly budget, for the confirmation message. */
export function computeConfirmationSummary(db: Db, userId: number, now: Date, timeZone: string): ConfirmationSummary {
  const ymd = getZonedParts(now, timeZone);
  const today = dayRange(ymd, timeZone);
  const month = monthRange(ymd, timeZone);

  const todayTotal = sumByType(db, userId, today.start.toISOString(), today.end.toISOString(), "expense");
  const monthTotal = sumByType(db, userId, month.start.toISOString(), month.end.toISOString(), "expense");

  const user = usersRepo.findById(db, userId);
  const categories = categoriesRepo.listByUser(db, userId, { includeHidden: true });
  const hasAnyCategoryBudget = categories.some((c) => c.monthlyBudget != null);
  const categoryBudgetSum = categories.reduce((sum, c) => sum + (c.monthlyBudget ?? 0), 0);
  const monthBudget = user?.monthlyBudget ?? (hasAnyCategoryBudget ? categoryBudgetSum : null);

  return { todayTotal, monthTotal, monthBudget };
}
