import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, listBackups, pruneOldBackups } from "../src/domain/backup.js";
import { createTestDb, seedUser } from "./setup.js";
import type { Db } from "../src/db/index.js";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "chitieu-backup-test-"));
  db = createTestDb();
  seedUser(db, 1);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("createBackup", () => {
  it("creates a restorable copy of the database", async () => {
    const file = await createBackup(db, dir, 30);
    expect(existsSync(file)).toBe(true);
    expect(path.basename(file)).toMatch(/^chitieu-\d{8}-\d{4}\.db$/);
  });

  it("creates the backups directory if it doesn't exist yet", async () => {
    const nested = path.join(dir, "nested", "backups");
    await createBackup(db, nested, 30);
    expect(readdirSync(nested)).toHaveLength(1);
  });
});

describe("pruneOldBackups", () => {
  it("keeps only the newest N backups", async () => {
    for (let i = 0; i < 5; i++) {
      await createBackup(db, dir, 100, new Date(2025, 0, 1, 0, i));
    }
    expect(listBackups(dir)).toHaveLength(5);

    const removed = pruneOldBackups(dir, 3);
    expect(removed).toBe(2);
    expect(listBackups(dir)).toHaveLength(3);
  });

  it("does nothing when under the limit", () => {
    expect(pruneOldBackups(dir, 30)).toBe(0);
  });

  it("returns an empty list for a directory that doesn't exist", () => {
    expect(listBackups(path.join(dir, "missing"))).toEqual([]);
  });
});
