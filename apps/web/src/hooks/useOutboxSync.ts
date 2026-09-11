import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { listOutbox } from "../lib/db";
import { flushOutbox } from "../lib/sync";
import { useOnlineStatus } from "./useOnlineStatus";

const PERIODIC_FLUSH_MS = 30_000;

/**
 * Keeps the offline outbox in sync: flushes on mount, whenever the browser
 * regains connectivity, whenever the tab becomes visible again, and every
 * 30s while online (in case connectivity flapped without firing events).
 * Exposes the current queue length so the UI can show a "chờ đồng bộ" badge.
 */
export function useOutboxSync(): { pendingCount: number; flushNow: () => Promise<void> } {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const items = await listOutbox();
    setPendingCount(items.length);
  }, []);

  const flushNow = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      const result = await flushOutbox();
      if (result.synced > 0) {
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["stats"] });
      }
    } finally {
      flushingRef.current = false;
      await refreshCount();
    }
  }, [queryClient, refreshCount]);

  useEffect(() => {
    void refreshCount();
    void flushNow();
  }, [flushNow, refreshCount]);

  useEffect(() => {
    if (online) void flushNow();
  }, [online, flushNow]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flushNow]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (navigator.onLine) void flushNow();
    }, PERIODIC_FLUSH_MS);
    return () => window.clearInterval(id);
  }, [flushNow]);

  return { pendingCount, flushNow };
}
