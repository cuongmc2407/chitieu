import { ApiError, apiPost } from "./apiClient";
import { listOutbox, markOutboxError, removeFromOutbox } from "./db";

export interface FlushResult {
  synced: number;
  failed: number;
}

/**
 * Sends every queued offline transaction to the server, oldest first.
 * Idempotent on `clientId`, so a flush that gets interrupted (or run
 * twice) never creates duplicates. Permanent client errors (bad category,
 * etc.) are recorded on the item instead of retried forever; transient
 * ones (offline, 5xx) are just left queued for the next flush.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await listOutbox();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await apiPost("/api/transactions", {
        amount: item.amount,
        type: item.type,
        categoryId: item.categoryId,
        note: item.note,
        occurredAt: item.occurredAt,
        clientId: item.clientId,
        learn: item.learn,
      });
      await removeFromOutbox(item.clientId);
      synced++;
    } catch (err) {
      failed++;
      const isPermanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;
      if (isPermanent) {
        await markOutboxError(item.clientId, err.message);
      }
      // else: leave it queued — network error, server hiccup, or an
      // expired session that will be valid again after the user re-logs in.
    }
  }

  return { synced, failed };
}
