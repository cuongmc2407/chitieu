import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import * as pairingCodesRepo from "../db/repos/pairingCodes.js";
import * as sessionsRepo from "../db/repos/sessions.js";
import type { Client, SessionRow } from "../db/repos/sessions.js";
import * as usersRepo from "../db/repos/users.js";
import type { UserRow } from "../db/repos/users.js";

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const TELEGRAM_LOGIN_MAX_AGE_MS = 60 * 60 * 1000;
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const PAIRING_CODE_MAX_ATTEMPTS = 5;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates a new session for `user` and returns the raw (unhashed) bearer token — shown/stored exactly once. */
export function createSession(db: Db, userId: number, client: Client, device?: string): { token: string; session: SessionRow } {
  const token = generateSessionToken();
  const session = sessionsRepo.create(db, {
    userId,
    tokenHash: hashToken(token),
    client,
    device,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return { token, session };
}

/**
 * Resolves a bearer token to its (user, session), sliding the expiry
 * forward at most once every 5 minutes. Returns null for a missing,
 * expired session, or one whose user fell out of ALLOWED_TELEGRAM_IDS.
 */
export function resolveSession(db: Db, config: Pick<AppConfig, "allowedTelegramIds">, token: string): { user: UserRow; session: SessionRow } | null {
  const session = sessionsRepo.findByTokenHash(db, hashToken(token));
  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessionsRepo.remove(db, session.id);
    return null;
  }

  const user = usersRepo.findById(db, session.userId);
  if (!user || !config.allowedTelegramIds.has(user.telegramId)) return null;

  if (Date.now() - new Date(session.lastUsedAt).getTime() > SESSION_REFRESH_THRESHOLD_MS) {
    sessionsRepo.touch(db, session.id, new Date(Date.now() + SESSION_TTL_MS).toISOString());
  }

  return { user, session };
}

// ---------------------------------------------------------------------------
// Telegram Login Widget
// ---------------------------------------------------------------------------

export interface TelegramLoginPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** Verifies a Telegram Login Widget payload per https://core.telegram.org/widgets/login#checking-authorization. */
export function verifyTelegramLogin(payload: TelegramLoginPayload, botToken: string): boolean {
  const { hash, ...fields } = payload;
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return false;

  const checkString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHex = createHmac("sha256", secretKey).update(checkString).digest("hex");

  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(hash.toLowerCase(), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const authDateMs = payload.auth_date * 1000;
  if (Number.isNaN(authDateMs) || Date.now() - authDateMs > TELEGRAM_LOGIN_MAX_AGE_MS) return false;
  if (authDateMs > Date.now() + 60_000) return false; // clock skew guard against a future-dated payload

  return true;
}

// ---------------------------------------------------------------------------
// Pairing codes (bot's /ketnoi -> web/app login)
// ---------------------------------------------------------------------------

export function generatePairingCode(db: Db, userId: number): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  pairingCodesRepo.create(db, userId, code, new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString());
  return code;
}

export type RedeemPairingCodeResult = { ok: true; user: UserRow } | { ok: false; reason: "invalid" | "expired" | "locked" };

/**
 * Redeems a one-time pairing code. Every failed attempt (wrong/unknown
 * code, expired, already used) increments the attempt counter on EVERY
 * currently-active code — an attacker guessing codes doesn't know which
 * one they're bruteforcing, so this bounds total guesses across all
 * pending pairings rather than per-code.
 */
export function redeemPairingCode(db: Db, code: string): RedeemPairingCodeResult {
  const nowIso = new Date().toISOString();
  const row = pairingCodesRepo.findByCode(db, code);
  const isActive = row && !row.consumedAt && row.expiresAt > nowIso;

  if (!row || !isActive || row.attempts >= PAIRING_CODE_MAX_ATTEMPTS) {
    pairingCodesRepo.incrementAttemptsOnAllActive(db, nowIso);
    if (row?.attempts !== undefined && row.attempts >= PAIRING_CODE_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
    if (row && row.expiresAt <= nowIso) return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }

  pairingCodesRepo.consume(db, code);
  const user = usersRepo.findById(db, row.userId);
  if (!user) return { ok: false, reason: "invalid" };
  return { ok: true, user };
}
