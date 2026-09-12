import { zonedToUtc } from "@chitieu/core";
import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import type { CategoryRow } from "../src/db/repos/categories.js";
import * as fixedCostsRepo from "../src/db/repos/fixedCosts.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import type { Db } from "../src/db/index.js";
import { deleteCategory } from "../src/domain/categories.js";
import { effectiveDueDay, initialPostedPeriod, listWithStatus, postDueFixedCostsForUser } from "../src/domain/fixedCosts.js";
import { createTestDb, seedUser } from "./setup.js";

const TZ = "Asia/Ho_Chi_Minh";

function vnAt(year: number, month: number, day: number, hour = 9): Date {
  return zonedToUtc({ year, month, day, hour, minute: 0, second: 0 }, TZ);
}

function categoryByKey(db: Db, userId: number, key: string): CategoryRow {
  const found = categoriesRepo.listByUser(db, userId, { includeHidden: true }).find((c) => c.key === key);
  if (!found) throw new Error(`missing seeded category ${key}`);
  return found;
}

function setup(telegramId: number) {
  const db = createTestDb();
  const user = seedUser(db, telegramId);
  const housing = categoryByKey(db, user.id, "housing");
  return { db, user, housing };
}

describe("postDueFixedCostsForUser", () => {
  it("writes the cost once the due day has arrived", () => {
    const { db, user, housing } = setup(700);
    fixedCostsRepo.create(db, user.id, { name: "Tiền nhà", amount: 4_000_000, categoryId: housing.id, dayOfMonth: 5 });

    const posted = postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 5), TZ);

    expect(posted).toHaveLength(1);
    expect(posted[0]?.transaction.amount).toBe(4_000_000);
    expect(posted[0]?.transaction.type).toBe("expense");
    expect(posted[0]?.transaction.note).toBe("Tiền nhà");
    expect(posted[0]?.transaction.categoryId).toBe(housing.id);
    expect(posted[0]?.transaction.fixedCostId).toBe(posted[0]?.cost.id);
    // Dated on the due day itself, not on the day the job happened to run.
    expect(posted[0]?.transaction.occurredAt).toBe(vnAt(2026, 9, 5, 12).toISOString());
  });

  it("does nothing before the due day", () => {
    const { db, user, housing } = setup(701);
    fixedCostsRepo.create(db, user.id, { name: "Internet", amount: 250_000, categoryId: housing.id, dayOfMonth: 20 });

    expect(postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 19), TZ)).toHaveLength(0);
  });

  it("is idempotent within a month — a second run adds nothing", () => {
    const { db, user, housing } = setup(702);
    fixedCostsRepo.create(db, user.id, { name: "Tiền nhà", amount: 4_000_000, categoryId: housing.id, dayOfMonth: 5 });

    postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 5), TZ);
    const second = postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 28), TZ);

    expect(second).toHaveLength(0);
    const all = transactionsRepo.search(db, user.id, {});
    expect(all).toHaveLength(1);
  });

  it("posts again the following month", () => {
    const { db, user, housing } = setup(703);
    fixedCostsRepo.create(db, user.id, { name: "Tiền nhà", amount: 4_000_000, categoryId: housing.id, dayOfMonth: 5 });

    postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 5), TZ);
    const october = postDueFixedCostsForUser(db, user.id, vnAt(2026, 10, 5), TZ);

    expect(october).toHaveLength(1);
    expect(transactionsRepo.search(db, user.id, {})).toHaveLength(2);
  });

  it("clamps day 31 to the last day of a short month", () => {
    const { db, user, housing } = setup(704);
    fixedCostsRepo.create(db, user.id, { name: "Bảo hiểm", amount: 500_000, categoryId: housing.id, dayOfMonth: 31 });

    // February 2026 has 28 days — the cost is due on the 28th, not skipped.
    const posted = postDueFixedCostsForUser(db, user.id, vnAt(2026, 2, 28), TZ);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.transaction.occurredAt).toBe(vnAt(2026, 2, 28, 12).toISOString());
  });

  it("skips paused costs and ones marked as manual-only", () => {
    const { db, user, housing } = setup(705);
    fixedCostsRepo.create(db, user.id, { name: "Đã tạm dừng", amount: 100_000, categoryId: housing.id, dayOfMonth: 1, active: false });
    fixedCostsRepo.create(db, user.id, { name: "Ghi tay", amount: 100_000, categoryId: housing.id, dayOfMonth: 1, autoPost: false });

    expect(postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 10), TZ)).toHaveLength(0);
  });
});

describe("effectiveDueDay / initialPostedPeriod", () => {
  it("clamps the due day to the length of the month", () => {
    expect(effectiveDueDay(31, 2026, 2)).toBe(28);
    expect(effectiveDueDay(31, 2024, 2)).toBe(29); // leap year
    expect(effectiveDueDay(31, 2026, 4)).toBe(30);
    expect(effectiveDueDay(5, 2026, 9)).toBe(5);
  });

  it("marks the current month as done when the due day already passed", () => {
    // Added on the 20th, due on the 5th — this month was almost certainly
    // logged by hand already, so don't charge it retroactively.
    expect(initialPostedPeriod(5, vnAt(2026, 9, 20), TZ)).toBe("2026-09");
    // Added on the 1st, due on the 5th — still ahead, so let it post.
    expect(initialPostedPeriod(5, vnAt(2026, 9, 1), TZ)).toBeNull();
  });
});

describe("listWithStatus", () => {
  it("reports whether each cost has been written this month", () => {
    const { db, user, housing } = setup(706);
    fixedCostsRepo.create(db, user.id, { name: "Tiền nhà", amount: 4_000_000, categoryId: housing.id, dayOfMonth: 5 });
    postDueFixedCostsForUser(db, user.id, vnAt(2026, 9, 5), TZ);

    const [status] = listWithStatus(db, user.id, vnAt(2026, 9, 6), TZ);
    expect(status?.postedThisMonth).toBe(true);
    expect(status?.category?.key).toBe("housing");
    expect(status?.dueDay).toBe(5);

    // Next month it's pending again.
    const [nextMonth] = listWithStatus(db, user.id, vnAt(2026, 10, 1), TZ);
    expect(nextMonth?.postedThisMonth).toBe(false);
  });
});

describe("deleting a category used by a fixed cost", () => {
  it("moves the fixed cost to the fallback category instead of failing", () => {
    const { db, user, housing } = setup(707);
    const cost = fixedCostsRepo.create(db, user.id, { name: "Tiền nhà", amount: 4_000_000, categoryId: housing.id, dayOfMonth: 5 });

    const result = deleteCategory(db, user.id, housing.id);
    expect(result.ok).toBe(true);

    const fallback = categoriesRepo.findFallback(db, user.id, "expense");
    expect(fixedCostsRepo.getById(db, user.id, cost.id)?.categoryId).toBe(fallback?.id);
  });
});
