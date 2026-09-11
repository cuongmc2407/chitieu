import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.js";

export type Db = Database.Database;

export interface OpenDbOptions {
  /** Path to the .db file, or ":memory:" for an in-process test database. */
  path: string;
  /** Run pending migrations immediately after opening. Default true. */
  runMigrations?: boolean;
}

export function openDb(options: OpenDbOptions): Db {
  const { path, runMigrations = true } = options;

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  if (runMigrations) migrate(db);

  return db;
}
