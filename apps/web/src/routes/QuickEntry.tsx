import { DEFAULT_TIME_ZONE, parseMessage, type CategoryDef, type KeywordOverride as CoreKeywordOverride } from "@chitieu/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import CategoryPicker from "../components/CategoryPicker";
import TransactionRow from "../components/TransactionRow";
import { useCachedCategoriesFallback, useCategories } from "../hooks/useCategories";
import { useTransactions } from "../hooks/useTransactions";
import { getCachedOverrides, enqueueOutbox, listOutbox, type OutboxItem } from "../lib/db";
import { flushOutbox } from "../lib/sync";
import { dateKey, formatVnd } from "../lib/format";
import type { Category, Transaction } from "../types";

function toCategoryDef(c: Category): CategoryDef {
  return { id: c.id, name: c.name, emoji: c.emoji, type: c.type, keywords: c.keywords, isFallback: c.isFallback };
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function QuickEntry() {
  const [text, setText] = useState("");
  const [overrideCategoryId, setOverrideCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: categories } = useCategories();
  const cachedCategories = useCachedCategoriesFallback();
  const effectiveCategories = categories ?? cachedCategories ?? [];

  const { data: cachedOverrides } = useQuery({
    queryKey: ["overrides-cache-fallback"],
    queryFn: async () => (await getCachedOverrides()) ?? null,
    staleTime: Infinity,
  });
  const overrides: CoreKeywordOverride[] = (cachedOverrides ?? []).map((o) => ({ keyword: o.keyword, categoryId: o.categoryId }));

  const { from, to } = todayRange();
  const { data: todayTx } = useTransactions({ from, to });
  const [pendingOutbox, setPendingOutbox] = useState<OutboxItem[]>([]);

  const preview = useMemo(() => {
    if (text.trim() === "" || effectiveCategories.length === 0) return null;
    return parseMessage(text, new Date(), {
      categories: effectiveCategories.map(toCategoryDef),
      overrides,
      timeZone: DEFAULT_TIME_ZONE,
    });
  }, [text, effectiveCategories, overrides]);

  const singleItem = preview?.ok && preview.items.length === 1 ? preview.items[0] : null;

  async function refreshPending(): Promise<void> {
    const all = await listOutbox();
    setPendingOutbox(all.filter((o) => dateKey(o.occurredAt) === dateKey(new Date().toISOString())));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!preview?.ok || preview.items.length === 0 || saving) return;
    setSaving(true);
    try {
      for (const item of preview.items) {
        const categoryId = preview.items.length === 1 && overrideCategoryId ? overrideCategoryId : item.categoryId;
        const category = effectiveCategories.find((c) => c.id === categoryId);
        await enqueueOutbox({
          clientId: crypto.randomUUID(),
          amount: item.amount,
          type: category?.type ?? item.type,
          categoryId,
          note: item.note,
          occurredAt: item.occurredAt.toISOString(),
          learn: overrideCategoryId !== null,
        });
      }
      setText("");
      setOverrideCategoryId(null);
      await refreshPending();
      const result = await flushOutbox();
      if (result.synced > 0) {
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["stats"] });
        await refreshPending();
      }
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  const mergedTodayItems: Array<{ key: string; tx?: Transaction; outbox?: OutboxItem }> = [
    ...pendingOutbox.map((o) => ({ key: o.clientId, outbox: o })),
    ...(todayTx ?? []).map((t) => ({ key: t.id, tx: t })),
  ];
  const todayItems = mergedTodayItems.sort((a, b) => {
    const ta = a.tx?.occurredAt ?? a.outbox?.occurredAt ?? "";
    const tb = b.tx?.occurredAt ?? b.outbox?.occurredAt ?? "";
    return tb.localeCompare(ta);
  });

  const todayExpenseTotal =
    (todayTx ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0) +
    pendingOutbox.filter((o) => o.type === "expense").reduce((s, o) => s + o.amount, 0);

  return (
    <div className="mx-auto max-w-lg px-4 pt-safe pt-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Chi Tiêu</h1>

      <form onSubmit={handleSubmit} className="mt-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOverrideCategoryId(null);
          }}
          placeholder='"phở 45k" hoặc "xăng 80k"…'
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          enterKeyHint="done"
          autoComplete="off"
        />

        {preview && !preview.ok && (
          <p className="mt-2 px-1 text-sm text-red-500">{preview.errors.map((e) => e.message).join(", ")}</p>
        )}

        {singleItem && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm dark:bg-slate-900">
              <span className="text-lg">{effectiveCategories.find((c) => c.id === (overrideCategoryId ?? singleItem.categoryId))?.emoji}</span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{singleItem.note || "(không ghi chú)"}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatVnd(singleItem.amount)}</span>
            </div>
            <CategoryPicker
              categories={effectiveCategories.filter((c) => !c.hidden)}
              selectedId={overrideCategoryId ?? singleItem.categoryId}
              onSelect={(c) => setOverrideCategoryId(c.id)}
            />
          </div>
        )}

        {preview?.ok && preview.items.length > 1 && (
          <p className="mt-2 px-1 text-sm text-slate-500 dark:text-slate-400">{preview.items.length} khoản sẽ được lưu.</p>
        )}

        <button
          type="submit"
          disabled={!preview?.ok || saving}
          className="mt-3 w-full rounded-2xl bg-teal-600 py-3.5 text-base font-semibold text-white transition-opacity disabled:opacity-40"
        >
          Lưu
        </button>
      </form>

      <div className="mt-6">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Hôm nay</h2>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatVnd(todayExpenseTotal)}</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
          {todayItems.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Chưa có khoản nào hôm nay.</p>}
          {todayItems.map((item) =>
            item.tx ? (
              <TransactionRow key={item.key} tx={item.tx} />
            ) : item.outbox ? (
              <TransactionRow
                key={item.key}
                pending
                tx={{
                  id: item.outbox.clientId,
                  amount: item.outbox.amount,
                  type: item.outbox.type,
                  categoryId: item.outbox.categoryId,
                  categoryName: effectiveCategories.find((c) => c.id === item.outbox!.categoryId)?.name ?? null,
                  categoryEmoji: effectiveCategories.find((c) => c.id === item.outbox!.categoryId)?.emoji ?? null,
                  note: item.outbox.note,
                  rawText: item.outbox.note,
                  occurredAt: item.outbox.occurredAt,
                  source: "web",
                  clientId: item.outbox.clientId,
                  createdAt: item.outbox.createdAt,
                  updatedAt: item.outbox.createdAt,
                }}
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
