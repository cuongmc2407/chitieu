import { zonedToUtc } from "@chitieu/core";
import { Cron } from "croner";
import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import * as usersRepo from "../src/db/repos/users.js";
import { runDailyReminders, runMonthlyReports, runWeeklyReports } from "../src/jobs/scheduler.js";
import { createTestDb, createTestDeps, seedUser } from "./setup.js";
import { createTestBot } from "./testBot.js";

const TZ = "Asia/Ho_Chi_Minh";

describe("cron pattern next-run (croner + Asia/Ho_Chi_Minh)", () => {
  it("weekly report '0 20 * * 0' next fires Sun 14/09 20:00 +07 (13:00 UTC) after Thu 11/09", () => {
    const job = new Cron("0 20 * * 0", { timezone: TZ });
    const next = job.nextRun(new Date("2025-09-11T00:00:00.000Z"));
    expect(next?.toISOString()).toBe("2025-09-14T13:00:00.000Z");
  });

  it("monthly report '0 8 1 * *' next fires the 1st at 08:00 +07 (01:00 UTC)", () => {
    const job = new Cron("0 8 1 * *", { timezone: TZ });
    const next = job.nextRun(new Date("2025-09-15T00:00:00.000Z"));
    expect(next?.toISOString()).toBe("2025-10-01T01:00:00.000Z");
  });

  it("daily reminder '30 21 * * *' next fires the same day at 21:30 +07 (14:30 UTC) if not yet passed", () => {
    const job = new Cron("30 21 * * *", { timezone: TZ });
    const next = job.nextRun(new Date("2025-09-15T00:00:00.000Z")); // 07:00 +07
    expect(next?.toISOString()).toBe("2025-09-15T14:30:00.000Z");
  });
});

function noon(year: number, month: number, day: number): Date {
  return zonedToUtc({ year, month, day, hour: 12, minute: 0, second: 0 }, TZ);
}

describe("runWeeklyReports", () => {
  it("sends one report per user and never repeats it for the same week", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    const user = seedUser(db, 800);
    const category = categoriesRepo.listByUser(db, user.id)[0];
    if (!category) throw new Error("expected a category");
    transactionsRepo.create(db, user.id, {
      amount: 50_000,
      type: "expense",
      categoryId: category.id,
      note: "x",
      rawText: "x",
      occurredAt: noon(2025, 9, 10).toISOString(),
      source: "telegram",
      clientId: "seed",
    });

    const sundayEvening = zonedToUtc({ year: 2025, month: 9, day: 14, hour: 20, minute: 0, second: 0 }, TZ);
    await runWeeklyReports(bot, deps, sundayEvening);
    expect(callsOf("sendMessage")).toHaveLength(1);

    await runWeeklyReports(bot, deps, sundayEvening);
    expect(callsOf("sendMessage")).toHaveLength(1); // still 1, not sent twice
  });
});

describe("runMonthlyReports", () => {
  it("reports on the month that just ended, not the current one", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);
    const user = seedUser(db, 801);
    const category = categoriesRepo.listByUser(db, user.id)[0];
    if (!category) throw new Error("expected a category");
    transactionsRepo.create(db, user.id, {
      amount: 999_000,
      type: "expense",
      categoryId: category.id,
      note: "tháng trước",
      rawText: "x",
      occurredAt: noon(2025, 8, 20).toISOString(),
      source: "telegram",
      clientId: "seed-aug",
    });

    const firstOfMonth = zonedToUtc({ year: 2025, month: 9, day: 1, hour: 8, minute: 0, second: 0 }, TZ);
    await runMonthlyReports(bot, deps, firstOfMonth);
    const calls = callsOf("sendMessage");
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.payload.text)).toContain("999.000");
  });
});

describe("runDailyReminders", () => {
  it("nudges only users with reminders on who have not logged anything today", async () => {
    const db = createTestDb();
    const deps = createTestDeps({}, db);
    const { bot, callsOf } = createTestBot(deps);

    const quiet = seedUser(db, 802);
    const active = seedUser(db, 803);
    const optedOut = seedUser(db, 804);
    usersRepo.setReminderEnabled(db, optedOut.id, false);

    const category = categoriesRepo.listByUser(db, active.id)[0];
    if (!category) throw new Error("expected a category");
    const evening = zonedToUtc({ year: 2025, month: 9, day: 15, hour: 21, minute: 30, second: 0 }, TZ);
    transactionsRepo.create(db, active.id, {
      amount: 20_000,
      type: "expense",
      categoryId: category.id,
      note: "x",
      rawText: "x",
      occurredAt: evening.toISOString(),
      source: "telegram",
      clientId: "today",
    });

    await runDailyReminders(bot, deps, evening);
    const calls = callsOf("sendMessage");
    const chatIds = calls.map((c) => c.payload.chat_id);
    expect(chatIds).toContain(quiet.telegramId);
    expect(chatIds).not.toContain(active.telegramId);
    expect(chatIds).not.toContain(optedOut.telegramId);
  });
});
