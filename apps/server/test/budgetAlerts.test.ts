import { zonedToUtc } from "@chitieu/core";
import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import * as usersRepo from "../src/db/repos/users.js";
import { checkBudgetAlerts } from "../src/domain/budgetAlerts.js";
import { createTestDb, seedUser } from "./setup.js";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = zonedToUtc({ year: 2025, month: 9, day: 15, hour: 9, minute: 0, second: 0 }, TZ);

function spend(db: ReturnType<typeof createTestDb>, userId: number, categoryId: string, amount: number, n: number): void {
  transactionsRepo.create(db, userId, {
    amount,
    type: "expense",
    categoryId,
    note: "x",
    rawText: "x",
    occurredAt: NOW.toISOString(),
    source: "telegram",
    clientId: `spend:${n}`,
  });
}

describe("checkBudgetAlerts", () => {
  it("fires nothing under 80%, budget_80 once at/over 80%, budget_100 once at/over 100%", () => {
    const db = createTestDb();
    const user = seedUser(db, 700);
    const food = categoriesRepo.listByUser(db, user.id).find((c) => c.key === "food");
    if (!food) throw new Error("expected food category");
    categoriesRepo.setMonthlyBudget(db, user.id, food.id, 1_000_000);

    spend(db, user.id, food.id, 500_000, 1); // 50%
    expect(checkBudgetAlerts(db, user.id, NOW, TZ)).toHaveLength(0);

    spend(db, user.id, food.id, 350_000, 2); // 85%
    const first = checkBudgetAlerts(db, user.id, NOW, TZ);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "budget_80", ref: food.id, pct: 85 });

    // Calling again with no new spend must not repeat the same alert.
    expect(checkBudgetAlerts(db, user.id, NOW, TZ)).toHaveLength(0);

    spend(db, user.id, food.id, 200_000, 3); // 105%
    const second = checkBudgetAlerts(db, user.id, NOW, TZ);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ kind: "budget_100", ref: food.id, pct: 105 });

    expect(checkBudgetAlerts(db, user.id, NOW, TZ)).toHaveLength(0);
  });

  it("also checks the total monthly budget, keyed separately from category budgets", () => {
    const db = createTestDb();
    const user = seedUser(db, 701);
    usersRepo.setMonthlyBudget(db, user.id, 100_000);
    const category = categoriesRepo.listByUser(db, user.id)[0];
    if (!category) throw new Error("expected a category");

    spend(db, user.id, category.id, 90_000, 1); // 90% of total
    const alerts = checkBudgetAlerts(db, user.id, NOW, TZ);
    expect(alerts.some((a) => a.ref === "total" && a.kind === "budget_80")).toBe(true);
  });
});
