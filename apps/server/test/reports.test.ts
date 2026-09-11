import { zonedToUtc } from "@chitieu/core";
import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import { buildBudgetProgress, buildPeriodReport } from "../src/domain/reports.js";
import { createTestDb, seedUser } from "./setup.js";

const TZ = "Asia/Ho_Chi_Minh";

function vnNoon(year: number, month: number, day: number): string {
  return zonedToUtc({ year, month, day, hour: 12, minute: 0, second: 0 }, TZ).toISOString();
}

/**
 * Fixed dataset for the week Mon 08/09 – Sun 14/09/2025, plus one
 * transaction the week before (for the vs-previous-week comparison):
 *
 *   Tue 02/09  food      1,000,000  (previous week, for changePct)
 *   Mon 08/09  food        200,000
 *   Tue 09/09  transport   240,000
 *   Wed 10/09  food        320,000  <- single biggest expense, busiest day
 *   Thu 11/09  drinks      185,000
 *   Fri 12/09  shopping    200,000
 *   Sat 13/09  shopping    300,000
 *   Mon 08/09  salary(+) 5,000,000  (income, must not affect expense totals)
 *
 * Current-week expense total = 200k+240k+320k+185k+200k+300k = 1,445,000.
 */
function seedWeekDataset(db: ReturnType<typeof createTestDb>) {
  const user = seedUser(db, 900);
  const cats = categoriesRepo.listByUser(db, user.id);
  const byKey = (key: string) => {
    const c = cats.find((x) => x.key === key);
    if (!c) throw new Error(`missing seeded category ${key}`);
    return c;
  };

  let n = 0;
  const insert = (dateYmd: [number, number, number], categoryKey: string, amount: number, type: "expense" | "income" = "expense", note = "x") =>
    transactionsRepo.create(db, user.id, {
      amount,
      type,
      categoryId: byKey(categoryKey).id,
      note,
      rawText: note,
      occurredAt: vnNoon(...dateYmd),
      source: "telegram",
      clientId: `seed:${n++}`,
    });

  insert([2025, 9, 2], "food", 1_000_000, "expense", "previous week");
  insert([2025, 9, 8], "food", 200_000, "expense", "phở");
  insert([2025, 9, 9], "transport", 240_000, "expense", "xăng");
  insert([2025, 9, 10], "food", 320_000, "expense", "lẩu đặc biệt");
  insert([2025, 9, 11], "drinks", 185_000, "expense", "trà sữa");
  insert([2025, 9, 12], "shopping", 200_000, "expense", "giày");
  insert([2025, 9, 13], "shopping", 300_000, "expense", "áo khoác");
  insert([2025, 9, 8], "salary", 5_000_000, "income", "lương");

  return user;
}

describe("buildPeriodReport('week', ...)", () => {
  it("matches the hand-computed totals for the fixed dataset", () => {
    const db = createTestDb();
    const user = seedWeekDataset(db);

    const report = buildPeriodReport(db, user.id, "week", { year: 2025, month: 9, day: 10 }, TZ);

    expect(report.totalExpense).toBe(1_445_000);
    expect(report.totalIncome).toBe(5_000_000);

    // vs previous week (1,000,000): (1,445,000 - 1,000,000) / 1,000,000 = 44.5% -> rounds to 45.
    expect(report.changePct).toBe(45);

    const byKey = Object.fromEntries(report.byCategory.map((c) => [c.category.key, c]));
    expect(byKey.food?.total).toBe(520_000);
    expect(byKey.transport?.total).toBe(240_000);
    expect(byKey.drinks?.total).toBe(185_000);
    expect(byKey.shopping?.total).toBe(500_000);
    // 520000/1445000 = 35.98% -> 36
    expect(byKey.food?.pct).toBe(36);

    expect(report.topExpense?.transaction.amount).toBe(320_000);
    expect(report.topExpense?.category.key).toBe("food");

    expect(report.busiestDay?.total).toBe(320_000);
    expect(report.busiestDay?.date).toBe("2025-09-10");
    expect(report.busiestDay?.weekdayLabel).toBe("Thứ Tư");

    // 1,445,000 / 7 days = 206,428.57 -> rounds to 206,429.
    expect(report.dailyAverage).toBe(206_429);
  });

  it("changePct is null when the previous period had no expenses", () => {
    const db = createTestDb();
    const user = seedUser(db, 901);
    const category = categoriesRepo.listByUser(db, user.id)[0];
    if (!category) throw new Error("expected a seeded category");
    transactionsRepo.create(db, user.id, {
      amount: 50_000,
      type: "expense",
      categoryId: category.id,
      note: "x",
      rawText: "x",
      occurredAt: vnNoon(2025, 9, 10),
      source: "telegram",
      clientId: "only-one",
    });

    const report = buildPeriodReport(db, user.id, "week", { year: 2025, month: 9, day: 10 }, TZ);
    expect(report.changePct).toBeNull();
  });
});

describe("buildPeriodReport('month', ...)", () => {
  it("aggregates the whole calendar month, independent of week boundaries", () => {
    const db = createTestDb();
    const user = seedWeekDataset(db); // spans both Sep 2 and Sep 8-13, all within September
    const report = buildPeriodReport(db, user.id, "month", { year: 2025, month: 9, day: 15 }, TZ);
    expect(report.totalExpense).toBe(1_445_000 + 1_000_000); // includes the "previous week" Sep 2 transaction too
  });
});

describe("buildBudgetProgress", () => {
  it("computes month-to-date spend against each category's budget", () => {
    const db = createTestDb();
    const user = seedWeekDataset(db);
    const food = categoriesRepo.listByUser(db, user.id).find((c) => c.key === "food");
    if (!food) throw new Error("expected food category");
    categoriesRepo.setMonthlyBudget(db, user.id, food.id, 1_000_000);

    const progress = buildBudgetProgress(db, user.id, vnNoonAsDate(2025, 9, 15), TZ);
    const foodProgress = progress.byCategory.find((b) => b.category.key === "food");
    // Sep spend for food = 1,000,000 (Sep 2) + 520,000 (week) = 1,520,000
    expect(foodProgress?.spent).toBe(1_520_000);
    expect(foodProgress?.budget).toBe(1_000_000);
    expect(foodProgress?.pct).toBe(152);
    expect(progress.totalBudget).toBe(1_000_000); // sum of category budgets, no explicit user total set
  });
});

function vnNoonAsDate(year: number, month: number, day: number): Date {
  return new Date(vnNoon(year, month, day));
}
