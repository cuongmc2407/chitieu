import { randomUUID } from "node:crypto";
import type { Db } from "../index.js";

export type Client = "web" | "ios";

export interface SessionRow {
  id: string;
  userId: number;
  tokenHash: string;
  client: Client;
  device: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
}

interface RawRow {
  id: string;
  user_id: number;
  token_hash: string;
  client: Client;
  device: string | null;
  last_used_at: string;
  created_at: string;
  expires_at: string;
}

function mapRow(row: RawRow): SessionRow {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    client: row.client,
    device: row.device,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function create(db: Db, input: { userId: number; tokenHash: string; client: Client; device?: string | null; expiresAt: string }): SessionRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, client, device, last_used_at, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.userId, input.tokenHash, input.client, input.device ?? null, now, now, input.expiresAt);
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as RawRow;
  return mapRow(row);
}

export function findByTokenHash(db: Db, tokenHash: string): SessionRow | undefined {
  const row = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash) as RawRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function findById(db: Db, userId: number, id: string): SessionRow | undefined {
  const row = db.prepare("SELECT * FROM sessions WHERE user_id = ? AND id = ?").get(userId, id) as RawRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function listByUser(db: Db, userId: number): SessionRow[] {
  const rows = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC").all(userId) as RawRow[];
  return rows.map(mapRow);
}

export function touch(db: Db, id: string, expiresAt: string): void {
  db.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?").run(new Date().toISOString(), expiresAt, id);
}

export function remove(db: Db, id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function removeByUserAndId(db: Db, userId: number, id: string): boolean {
  const info = db.prepare("DELETE FROM sessions WHERE user_id = ? AND id = ?").run(userId, id);
  return info.changes > 0;
}
