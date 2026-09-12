import { DEFAULT_TIME_ZONE, parseMessage, type CategoryDef, type KeywordOverride as CoreKeywordOverride } from "@chitieu/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import CategoryPicker from "../components/CategoryPicker";
import TransactionRow from "../components/TransactionRow";
import { IconArrowUp, IconWallet } from "../components/icons";
import { Card, EmptyState, Page, SectionTitle } from "../components/ui";
import { useCachedCategoriesFallback, useCategories } from "../hooks/useCategories";
import { useTransactions } from "../hooks/useTransactions";
import { getCachedOverrides, enqueueOutbox, listOutbox, type OutboxItem } from "../lib/db";
import { dateKey, formatShortDate, formatVnd } from "../lib/format";
import { successHaptic } from "../lib/native";
import { flushOutbox } from "../lib/sync";
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

  // Anything still queued from an earlier session belongs in today's list too,
  // otherwise offline entries look lost until the next save.
  useEffect(() => {
    void refreshPending();
  }, []);

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
      void successHaptic();
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

  const previewCategoryId = overrideCategoryId ?? singleItem?.categoryId ?? null;

  return (
    <Page>
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hôm nay · {formatShortDate(new Date().toISOString())}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Chi Tiêu</h1>
        </div>
      </header>

      <Card className="mt-4 bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white dark:border-brand-700">
        <p className="text-xs font-medium text-white/70">Đã chi hôm nay</p>
        <p className="tabular mt-1 text-3xl font-bold">{formatVnd(todayExpenseTotal)}</p>
        <p className="mt-1 text-xs text-white/70">
          {todayItems.length === 0 ? "Chưa ghi khoản nào" : `${todayItems.length} khoản đã ghi`}
        </p>
      </Card>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="relative">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOverrideCategoryId(null);
            }}
            placeholder='"phở 45k" hoặc "xăng 80k"…'
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pr-14 pl-4 text-base text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            enterKeyHint="done"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!preview?.ok || saving}
            aria-label="Lưu khoản"
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-white transition-opacity active:bg-brand-700 disabled:opacity-30"
          >
            <IconArrowUp className="h-5 w-5" />
          </button>
        </div>

        {preview && !preview.ok && <p className="mt-2 px-1 text-sm text-red-500">{preview.errors.map((e) => e.message).join(", ")}</p>}

        {singleItem && (
          <div className="mt-3 space-y-2.5">
            <Card className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
                {effectiveCategories.find((c) => c.id === previewCategoryId)?.emoji ?? "❓"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                  {singleItem.note || "(không ghi chú)"}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {effectiveCategories.find((c) => c.id === previewCategoryId)?.name ?? "Khác"}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold text-slate-900 dark:text-white">{formatVnd(singleItem.amount)}</span>
            </Card>
            <CategoryPicker
              categories={effectiveCategories.filter((c) => !c.hidden)}
              selectedId={previewCategoryId}
              onSelect={(c) => setOverrideCategoryId(c.id)}
            />
          </div>
        )}

        {preview?.ok && preview.items.length > 1 && (
          <Card className="mt-3 overflow-hidden">
            {preview.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800/80"
              >
                <span className="text-base">{effectiveCategories.find((c) => c.id === item.categoryId)?.emoji ?? "❓"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {item.note || (effectiveCategories.find((c) => c.id === item.categoryId)?.name ?? "Khác")}
                </span>
                <span className="tabular shrink-0 text-sm font-medium text-slate-900 dark:text-white">{formatVnd(item.amount)}</span>
              </div>
            ))}
          </Card>
        )}
      </form>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <SectionTitle>Hôm nay</SectionTitle>
          <span className="tabular text-sm font-semibold text-slate-900 dark:text-white">{formatVnd(todayExpenseTotal)}</span>
        </div>
        <Card className="mt-2 overflow-hidden">
          {todayItems.length === 0 && (
            <EmptyState
              icon={<IconWallet className="h-9 w-9" />}
              title="Chưa có khoản nào hôm nay"
              hint='Gõ thẳng vào ô trên, ví dụ "cà phê 30k".'
            />
          )}
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
                  fixedCostId: null,
                  createdAt: item.outbox.createdAt,
                  updatedAt: item.outbox.createdAt,
                }}
              />
            ) : null,
          )}
        </Card>
      </section>
    </Page>
  );
}
