import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { Db } from "../db/index.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timestamp(now: Date): string {
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
}

/** All `chitieu-*.db` backups in `backupsDir`, oldest first (the timestamp format sorts lexicographically = chronologically). */
export function listBackups(backupsDir: string): string[] {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((f) => f.startsWith("chitieu-") && f.endsWith(".db"))
    .sort();
}

/** Deletes the oldest backups beyond `keep`. */
export function pruneOldBackups(backupsDir: string, keep: number): number {
  const files = listBackups(backupsDir);
  const excess = files.length - keep;
  if (excess <= 0) return 0;
  for (const file of files.slice(0, excess)) {
    unlinkSync(path.join(backupsDir, file));
  }
  return excess;
}

/** Uses SQLite's online backup API (safe to run against a live, in-use database) and prunes old backups afterward. */
export async function createBackup(db: Db, backupsDir: string, keep: number, now: Date = new Date()): Promise<string> {
  mkdirSync(backupsDir, { recursive: true });
  const fullPath = path.join(backupsDir, `chitieu-${timestamp(now)}.db`);
  await db.backup(fullPath);
  pruneOldBackups(backupsDir, keep);
  return fullPath;
}

export async function gzipFile(sourcePath: string, destPath: string): Promise<void> {
  await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(destPath));
}
