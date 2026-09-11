import { getZonedParts } from "@chitieu/core";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import type { TransactionRow } from "../db/repos/transactions.js";
import * as usersRepo from "../db/repos/users.js";
import type { Logger } from "../logger.js";

// @actual-app/api has no bundled types export path we can `import type` from
// cleanly across module resolutions, and it's a heavy, optional dependency —
// loaded lazily (only when ACTUAL_* is configured), so it's typed loosely here.
type ActualApi = typeof import("@actual-app/api");

const EXPENSE_GROUP_NAME = "Chi Tiêu — Chi";
const INCOME_GROUP_NAME = "Chi Tiêu — Thu";

function dateOnly(occurredAtIso: string, timeZone: string): string {
  const p = getZonedParts(new Date(occurredAtIso), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

async function ensureAccount(api: ActualApi, accountName: string): Promise<string> {
  const accounts = await api.getAccounts();
  const existing = accounts.find((a) => a.name === accountName);
  if (existing) return existing.id;
  return api.createAccount({ name: accountName }, 0);
}

async function ensureCategoryGroup(api: ActualApi, name: string, isIncome: boolean): Promise<string> {
  const groups = await api.getCategoryGroups();
  const existing = groups.find((g) => g.name === name);
  if (existing) return existing.id;
  return api.createCategoryGroup({ name, is_income: isIncome });
}

/** Ensures every local category has a same-named Actual category, grouped by chi/thu. Returns localCategoryId -> actualCategoryId. */
async function ensureCategoryMap(api: ActualApi, db: Db, userId: number): Promise<Map<string, string>> {
  const localCategories = categoriesRepo.listByUser(db, userId, { includeHidden: true });
  const actualCategories = await api.getCategories();
  const expenseGroupId = await ensureCategoryGroup(api, EXPENSE_GROUP_NAME, false);
  const incomeGroupId = await ensureCategoryGroup(api, INCOME_GROUP_NAME, true);

  const map = new Map<string, string>();
  for (const cat of localCategories) {
    const existing = actualCategories.find((c) => c.name === cat.name);
    if (existing) {
      map.set(cat.id, existing.id);
      continue;
    }
    const isIncome = cat.type === "income";
    const newId = await api.createCategory({ name: cat.name, group_id: isIncome ? incomeGroupId : expenseGroupId, is_income: isIncome });
    map.set(cat.id, newId);
  }
  return map;
}

/** Looks up Actual's own transaction id for one we previously imported, by its imported_id (our UUID) — needed to delete it. */
async function findActualTransactionId(api: ActualApi, accountId: string, importedId: string): Promise<string | null> {
  const all = await api.getTransactions(accountId, "0001-01-01", "9999-12-31");
  return all.find((t) => t.imported_id === importedId)?.id ?? null;
}

function resolveTargetUserId(db: Db, config: AppConfig): number | null {
  if (config.actual.userTelegramId != null) {
    return usersRepo.findByTelegramId(db, config.actual.userTelegramId)?.id ?? null;
  }
  const [firstAllowedId] = [...config.allowedTelegramIds].sort((a, b) => a - b);
  if (firstAllowedId == null) return null;
  return usersRepo.findByTelegramId(db, firstAllowedId)?.id ?? null;
}

async function syncOneTransaction(
  api: ActualApi,
  db: Db,
  userId: number,
  accountId: string,
  categoryMap: Map<string, string>,
  tx: TransactionRow,
  timeZone: string,
  nowIso: string,
): Promise<void> {
  if (tx.deletedAt) {
    if (tx.actualSyncedAt) {
      const actualId = await findActualTransactionId(api, accountId, tx.id);
      if (actualId) await api.deleteTransaction(actualId);
    }
    transactionsRepo.markActualSynced(db, userId, tx.id, nowIso);
    return;
  }

  const categoryId = categoryMap.get(tx.categoryId);
  // Actual convention: negative = money out (expense), positive = money in (income).
  const signedAmount = tx.type === "expense" ? -tx.amount : tx.amount;

  await api.importTransactions(accountId, [
    {
      account: accountId,
      date: dateOnly(tx.occurredAt, timeZone),
      // Actual stores amounts as an integer with an implicit 2 decimal places
      // for every currency, VND included — utils.amountToInteger does the ×100.
      amount: api.utils.amountToInteger(signedAmount),
      payee_name: tx.note || undefined,
      category: categoryId,
      notes: tx.rawText,
      imported_id: tx.id,
    },
  ]);
  transactionsRepo.markActualSynced(db, userId, tx.id, nowIso);
}

/**
 * One-way sync, SQLite -> Actual Budget: every new/edited/deleted
 * transaction since the last run is pushed over. SQLite is always the
 * source of truth; any failure here is logged and swallowed — it must
 * never affect the bot or API.
 */
export async function runActualSync(db: Db, config: AppConfig, logger: Logger): Promise<void> {
  // `enabled` is derived from serverUrl/password/syncId all being set (see config.ts),
  // but re-check here so TypeScript can narrow them from `string | undefined`.
  if (!config.actual.enabled || !config.actual.serverUrl || !config.actual.password || !config.actual.syncId) return;
  const { serverUrl, password, syncId } = config.actual;

  const userId = resolveTargetUserId(db, config);
  if (userId == null) {
    logger.warn("Đồng bộ Actual: không tìm thấy user để đồng bộ (kiểm tra ACTUAL_USER_TELEGRAM_ID/ALLOWED_TELEGRAM_IDS)");
    return;
  }

  let api: ActualApi | null = null;
  try {
    api = await import("@actual-app/api");
    await api.init({
      serverURL: serverUrl,
      password,
      dataDir: config.actual.dataDir,
    });
    await api.downloadBudget(syncId, config.actual.encryptionPassword ? { password: config.actual.encryptionPassword } : undefined);

    const accountId = await ensureAccount(api, config.actual.accountName);
    const categoryMap = await ensureCategoryMap(api, db, userId);

    const pending = transactionsRepo.listPendingActualSync(db, userId);
    const nowIso = new Date().toISOString();
    for (const tx of pending) {
      try {
        await syncOneTransaction(api, db, userId, accountId, categoryMap, tx, config.timeZone, nowIso);
      } catch (err) {
        logger.error({ err, transactionId: tx.id }, "Đồng bộ Actual: lỗi khi đồng bộ một giao dịch, bỏ qua và thử lại lần sau");
      }
    }

    await api.sync();
    logger.info({ count: pending.length }, "Đồng bộ Actual Budget hoàn tất");
  } catch (err) {
    logger.error({ err }, "Đồng bộ Actual Budget thất bại — sẽ thử lại ở lượt sau, không ảnh hưởng bot/API");
  } finally {
    if (api) await api.shutdown().catch(() => undefined);
  }
}
