import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { KeywordOverride, TxType } from "../types";

export interface OutboxItem {
  clientId: string;
  amount: number;
  type: TxType;
  categoryId: string;
  note: string;
  occurredAt: string;
  learn?: boolean;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

interface ChiTieuDB extends DBSchema {
  outbox: { key: string; value: OutboxItem };
  cache: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<ChiTieuDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ChiTieuDB>> {
  dbPromise ??= openDB<ChiTieuDB>("chitieu", 1, {
    upgrade(db) {
      db.createObjectStore("outbox", { keyPath: "clientId" });
      db.createObjectStore("cache");
    },
  });
  return dbPromise;
}

// --- Outbox: transactions saved while offline, waiting to sync -----------

export async function enqueueOutbox(item: Omit<OutboxItem, "createdAt" | "attempts">): Promise<void> {
  const db = await getDb();
  await db.put("outbox", { ...item, createdAt: new Date().toISOString(), attempts: 0 });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDb();
  return db.getAll("outbox");
}

export async function removeFromOutbox(clientId: string): Promise<void> {
  const db = await getDb();
  await db.delete("outbox", clientId);
}

export async function markOutboxError(clientId: string, error: string): Promise<void> {
  const db = await getDb();
  const item = await db.get("outbox", clientId);
  if (item) await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: error });
}

export async function clearOutbox(): Promise<void> {
  const db = await getDb();
  await db.clear("outbox");
}

// --- Cache: last-known categories/overrides, so the quick-entry preview --
// --- keeps working (and stays accurate) even fully offline. --------------

const CATEGORIES_CACHE_KEY = "categories";
const OVERRIDES_CACHE_KEY = "overrides";

export async function cacheCategories(categories: unknown): Promise<void> {
  const db = await getDb();
  await db.put("cache", categories, CATEGORIES_CACHE_KEY);
}

export async function getCachedCategories<T = unknown>(): Promise<T | undefined> {
  const db = await getDb();
  return db.get("cache", CATEGORIES_CACHE_KEY) as Promise<T | undefined>;
}

export async function cacheOverrides(overrides: KeywordOverride[]): Promise<void> {
  const db = await getDb();
  await db.put("cache", overrides, OVERRIDES_CACHE_KEY);
}

export async function getCachedOverrides(): Promise<KeywordOverride[] | undefined> {
  const db = await getDb();
  return db.get("cache", OVERRIDES_CACHE_KEY) as Promise<KeywordOverride[] | undefined>;
}
