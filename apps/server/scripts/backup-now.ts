#!/usr/bin/env tsx
/** Manual backup: `pnpm backup:now`. Same code path the 03:00 daily job uses. */
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db/index.js";
import { createBackup } from "../src/domain/backup.js";

const config = loadConfig();
const db = openDb({ path: config.dbPath, runMigrations: false });
try {
  const file = await createBackup(db, config.backup.dir, config.backup.keep);
  console.log(`Đã sao lưu: ${file}`);
} finally {
  db.close();
}
