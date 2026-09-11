#!/usr/bin/env tsx
/**
 * Restores a backup file over the live database.
 *
 *   pnpm restore backups/chitieu-20250915-0300.db
 *
 * Run this with the server STOPPED — it swaps the actual DB file on disk.
 * The current database is renamed (not deleted) so a mistake is
 * recoverable, and any leftover -wal/-shm files are removed so SQLite
 * doesn't try to replay stale write-ahead-log pages against the restored file.
 */
import Database from "better-sqlite3";
import { existsSync, renameSync, unlinkSync, copyFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Cách dùng: pnpm restore "backups/chitieu-YYYYMMDD-HHmm.db"');
  process.exit(1);
}
if (!existsSync(backupFile)) {
  console.error(`Không tìm thấy file: ${backupFile}`);
  process.exit(1);
}

const check = new Database(backupFile, { readonly: true });
const integrity = check.pragma("integrity_check") as Array<{ integrity_check: string }>;
check.close();
const isOk = integrity.length === 1 && integrity[0]?.integrity_check === "ok";
if (!isOk) {
  console.error("File backup không hợp lệ (integrity_check thất bại):", integrity);
  process.exit(1);
}

const config = loadConfig();
const dbPath = config.dbPath;

if (existsSync(dbPath)) {
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  const savedAside = `${dbPath}.before-restore-${suffix}`;
  renameSync(dbPath, savedAside);
  console.log(`Đã đổi tên DB hiện tại thành: ${savedAside}`);
}
for (const ext of ["-wal", "-shm"]) {
  const stale = `${dbPath}${ext}`;
  if (existsSync(stale)) unlinkSync(stale);
}

copyFileSync(backupFile, dbPath);
console.log(`Đã khôi phục "${backupFile}" -> "${dbPath}".`);
console.log("Khởi động lại server để áp dụng.");
