import type { Db } from "../index.js";

export interface PairingCodeRow {
  code: string;
  userId: number;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

interface RawRow {
  code: string;
  user_id: number;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
}

function mapRow(row: RawRow): PairingCodeRow {
  return { code: row.code, userId: row.user_id, expiresAt: row.expires_at, attempts: row.attempts, consumedAt: row.consumed_at, createdAt: row.created_at };
}

export function create(db: Db, userId: number, code: string, expiresAt: string): PairingCodeRow {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO pairing_codes (code, user_id, expires_at, attempts, consumed_at, created_at) VALUES (?, ?, ?, 0, NULL, ?)").run(
    code,
    userId,
    expiresAt,
    now,
  );
  const row = db.prepare("SELECT * FROM pairing_codes WHERE code = ?").get(code) as RawRow;
  return mapRow(row);
}

export function findByCode(db: Db, code: string): PairingCodeRow | undefined {
  const row = db.prepare("SELECT * FROM pairing_codes WHERE code = ?").get(code) as RawRow | undefined;
  return row ? mapRow(row) : undefined;
}

/** Increments the failed-attempt counter on every still-valid (unconsumed, unexpired) code — see plan note on pairing-code brute force. */
export function incrementAttemptsOnAllActive(db: Db, nowIso: string): void {
  db.prepare("UPDATE pairing_codes SET attempts = attempts + 1 WHERE consumed_at IS NULL AND expires_at > ?").run(nowIso);
}

export function consume(db: Db, code: string): void {
  db.prepare("UPDATE pairing_codes SET consumed_at = ? WHERE code = ?").run(new Date().toISOString(), code);
}
