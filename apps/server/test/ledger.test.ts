import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import {
  changeCategory,
  createFromText,
  restoreTransaction,
  undo,
  undoAllForMessage,
  undoLatest,
  updateFromEditedText,
} from "../src/domain/ledger.js";
import { createTestDb, seedUser } from "./setup.js";

const ENV = { timeZone: "Asia/Ho_Chi_Minh", bareNumberThreshold: 1000 };
const NOW = new Date("2025-09-15T02:00:00.000Z"); // Monday 09:00 +07:00

describe("createFromText", () => {
  it("parses and persists a single item", () => {
    const db = createTestDb();
    const user = seedUser(db, 1);
    const result = createFromText(db, user.id, "phở 45k", ENV, {
      source: "telegram",
      now: NOW,
      clientIdPrefix: "tg:1:100",
      telegramMessageId: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.transaction.amount).toBe(45_000);
    expect(result.items[0]?.category.key).toBe("food");
  });

  it("splits a multi-item message into separate transactions", () => {
    const db = createTestDb();
    const user = seedUser(db, 2);
    const result = createFromText(db, user.id, "phở 45k, trà đá 5k", ENV, {
      source: "telegram",
      now: NOW,
      clientIdPrefix: "tg:2:101",
      telegramMessageId: 101,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.transaction.amount)).toEqual([45_000, 5_000]);
  });

  it("is idempotent — resending the same Telegram message never duplicates rows", () => {
    const db = createTestDb();
    const user = seedUser(db, 3);
    const opts = { source: "telegram" as const, now: NOW, clientIdPrefix: "tg:3:102", telegramMessageId: 102 };
    const first = createFromText(db, user.id, "xăng 80k", ENV, opts);
    const second = createFromText(db, user.id, "xăng 80k", ENV, opts);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.items[0]?.transaction.id).toBe(first.items[0]?.transaction.id);
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(1);
  });

  it("returns errors and persists nothing when the text has no amount", () => {
    const db = createTestDb();
    const user = seedUser(db, 4);
    const result = createFromText(db, user.id, "phở", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:4:103" });
    expect(result.ok).toBe(false);
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(0);
  });
});

describe("updateFromEditedText", () => {
  it("updates the amount/category of an existing item in place", () => {
    const db = createTestDb();
    const user = seedUser(db, 10);
    const created = createFromText(db, user.id, "phở 45k", ENV, {
      source: "telegram",
      now: NOW,
      clientIdPrefix: "tg:10:200",
      telegramMessageId: 200,
    });
    if (!created.ok) throw new Error("setup failed");
    const originalId = created.items[0]!.transaction.id;

    const edited = updateFromEditedText(db, user.id, "phở 55k", ENV, {
      now: NOW,
      clientIdPrefix: "tg:10:200",
      telegramMessageId: 200,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.items).toHaveLength(1);
    expect(edited.items[0]?.transaction.id).toBe(originalId);
    expect(edited.items[0]?.transaction.amount).toBe(55_000);
  });

  it("adds a new item when the edited message gains one", () => {
    const db = createTestDb();
    const user = seedUser(db, 11);
    createFromText(db, user.id, "phở 45k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:11:201", telegramMessageId: 201 });
    const edited = updateFromEditedText(db, user.id, "phở 45k, trà đá 5k", ENV, { now: NOW, clientIdPrefix: "tg:11:201", telegramMessageId: 201 });
    expect(edited.ok && edited.items).toHaveLength(2);
  });

  it("soft-deletes items that no longer exist after editing", () => {
    const db = createTestDb();
    const user = seedUser(db, 12);
    createFromText(db, user.id, "phở 45k, trà đá 5k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:12:202", telegramMessageId: 202 });
    const before = transactionsRepo.listByTelegramMessageId(db, user.id, 202);
    expect(before).toHaveLength(2);

    const edited = updateFromEditedText(db, user.id, "phở 45k", ENV, { now: NOW, clientIdPrefix: "tg:12:202", telegramMessageId: 202 });
    expect(edited.ok && edited.items).toHaveLength(1);
    expect(transactionsRepo.listByTelegramMessageId(db, user.id, 202)).toHaveLength(1);
  });

  it("returns an error (and touches nothing) when the edited text has no amount", () => {
    const db = createTestDb();
    const user = seedUser(db, 13);
    createFromText(db, user.id, "phở 45k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:13:203", telegramMessageId: 203 });
    const edited = updateFromEditedText(db, user.id, "phở", ENV, { now: NOW, clientIdPrefix: "tg:13:203", telegramMessageId: 203 });
    expect(edited.ok).toBe(false);
    expect(transactionsRepo.listByTelegramMessageId(db, user.id, 203)).toHaveLength(1);
  });
});

describe("changeCategory — teaches the bot", () => {
  it("updates the transaction and makes the next identical note auto-categorize correctly", () => {
    const db = createTestDb();
    const user = seedUser(db, 20);
    const shopping = categoriesRepo.listByUser(db, user.id).find((c) => c.key === "shopping");
    if (!shopping) throw new Error("expected seeded shopping category");

    const created = createFromText(db, user.id, "bún 30k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:20:300", telegramMessageId: 300 });
    if (!created.ok) throw new Error("setup failed");
    expect(created.items[0]?.category.key).toBe("food"); // dictionary default, before teaching

    const changed = changeCategory(db, user.id, created.items[0]!.transaction.id, shopping.id);
    expect(changed?.category.id).toBe(shopping.id);

    const next = createFromText(db, user.id, "bún 25k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:20:301", telegramMessageId: 301 });
    expect(next.ok && next.items[0]?.category.id).toBe(shopping.id);
  });
});

describe("undo / restore", () => {
  it("undo soft-deletes and restore brings it back", () => {
    const db = createTestDb();
    const user = seedUser(db, 30);
    const created = createFromText(db, user.id, "cf 20k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:30:400", telegramMessageId: 400 });
    if (!created.ok) throw new Error("setup failed");
    const id = created.items[0]!.transaction.id;

    const undone = undo(db, user.id, id);
    expect(undone?.deletedAt).not.toBeNull();
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(0);

    const restored = restoreTransaction(db, user.id, id);
    expect(restored?.deletedAt).toBeNull();
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(1);
  });

  it("undoLatest removes the most recently created active transaction", () => {
    const db = createTestDb();
    const user = seedUser(db, 31);
    createFromText(db, user.id, "cf 20k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:31:500", telegramMessageId: 500 });
    createFromText(db, user.id, "xăng 80k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:31:501", telegramMessageId: 501 });

    const undone = undoLatest(db, user.id);
    expect(undone?.amount).toBe(80_000);
    const remaining = transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.amount).toBe(20_000);
  });

  it("undoAllForMessage soft-deletes every item from that message", () => {
    const db = createTestDb();
    const user = seedUser(db, 32);
    createFromText(db, user.id, "phở 45k, trà đá 5k", ENV, { source: "telegram", now: NOW, clientIdPrefix: "tg:32:600", telegramMessageId: 600 });
    const count = undoAllForMessage(db, user.id, 600);
    expect(count).toBe(2);
    expect(transactionsRepo.listRange(db, user.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(0);
  });
});
