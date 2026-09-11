import { describe, expect, it } from "vitest";
import * as categoriesRepo from "../src/db/repos/categories.js";
import * as keywordOverridesRepo from "../src/db/repos/keywordOverrides.js";
import * as transactionsRepo from "../src/db/repos/transactions.js";
import { migrate } from "../src/db/migrate.js";
import { createTestDb, seedUser } from "./setup.js";

describe("migrations", () => {
  it("creates every expected table", () => {
    const db = createTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const expected of ["users", "categories", "transactions", "keyword_overrides", "sessions", "pairing_codes", "notifications_sent"]) {
      expect(tables).toContain(expected);
    }
  });

  it("is idempotent — running migrate() again does nothing", () => {
    const db = createTestDb();
    expect(() => migrate(db)).not.toThrow();
  });
});

describe("user data isolation", () => {
  it("user A cannot read user B's transactions", () => {
    const db = createTestDb();
    const alice = seedUser(db, 1001);
    const bob = seedUser(db, 1002);

    const aliceCategories = categoriesRepo.listByUser(db, alice.id);
    const foodCategory = aliceCategories.find((c) => c.key === "food");
    if (!foodCategory) throw new Error("expected seeded food category");

    const tx = transactionsRepo.create(db, alice.id, {
      amount: 45_000,
      type: "expense",
      categoryId: foodCategory.id,
      note: "phở",
      rawText: "phở 45k",
      occurredAt: new Date().toISOString(),
      source: "telegram",
      clientId: "tg:1:1:0",
    });

    expect(transactionsRepo.findById(db, bob.id, tx.id)).toBeUndefined();
    expect(transactionsRepo.findById(db, alice.id, tx.id)).toBeDefined();
    expect(transactionsRepo.listRange(db, bob.id, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toHaveLength(0);
  });

  it("user A cannot modify user B's transaction (soft delete is a no-op)", () => {
    const db = createTestDb();
    const alice = seedUser(db, 2001);
    const bob = seedUser(db, 2002);
    const category = categoriesRepo.listByUser(db, bob.id)[0];
    if (!category) throw new Error("expected at least one seeded category");

    const tx = transactionsRepo.create(db, bob.id, {
      amount: 10_000,
      type: "expense",
      categoryId: category.id,
      note: "test",
      rawText: "test 10k",
      occurredAt: new Date().toISOString(),
      source: "telegram",
      clientId: "tg:2:2:0",
    });

    expect(transactionsRepo.softDelete(db, alice.id, tx.id)).toBe(false);
    expect(transactionsRepo.findById(db, bob.id, tx.id)?.deletedAt).toBeNull();
  });

  it("user A cannot see user B's categories or keyword overrides", () => {
    const db = createTestDb();
    const alice = seedUser(db, 3001);
    const bob = seedUser(db, 3002);

    const bobCategories = categoriesRepo.listByUser(db, bob.id);
    for (const cat of bobCategories) {
      expect(categoriesRepo.getById(db, alice.id, cat.id)).toBeUndefined();
    }

    const bobFood = bobCategories.find((c) => c.key === "food");
    if (!bobFood) throw new Error("expected seeded food category");
    keywordOverridesRepo.upsert(db, bob.id, "banh mi dac biet", bobFood.id);

    expect(keywordOverridesRepo.listByUser(db, alice.id)).toHaveLength(0);
    expect(keywordOverridesRepo.listByUser(db, bob.id)).toHaveLength(1);
  });

  it("each user gets their own copy of the default categories", () => {
    const db = createTestDb();
    const alice = seedUser(db, 4001);
    const bob = seedUser(db, 4002);
    expect(categoriesRepo.listByUser(db, alice.id).length).toBeGreaterThan(0);
    expect(categoriesRepo.listByUser(db, alice.id).length).toBe(categoriesRepo.listByUser(db, bob.id).length);
    // category ids are per-user (UUIDs), never shared
    const aliceIds = new Set(categoriesRepo.listByUser(db, alice.id).map((c) => c.id));
    const bobIds = categoriesRepo.listByUser(db, bob.id).map((c) => c.id);
    for (const id of bobIds) expect(aliceIds.has(id)).toBe(false);
  });
});
