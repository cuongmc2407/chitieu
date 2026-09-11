import { useMemo, useState } from "react";
import TransactionRow from "../components/TransactionRow";
import CategoryPicker from "../components/CategoryPicker";
import { useCategories } from "../hooks/useCategories";
import { useDeleteTransaction, useTransactions, useUpdateTransaction } from "../hooks/useTransactions";
import { formatDayHeading, formatVnd, dateKey } from "../lib/format";
import type { Category, Transaction } from "../types";

export default function History() {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<"" | "expense" | "income">("");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: categories } = useCategories();
  const { data: transactions, isLoading } = useTransactions({
    q: q || undefined,
    category: categoryId || undefined,
    type: type || undefined,
  });

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions ?? []) {
      const key = dateKey(tx.occurredAt);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  return (
    <div className="mx-auto max-w-lg px-4 pt-safe pt-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lịch sử</h1>

      <div className="mt-3 space-y-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo ghi chú…"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <div className="flex gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Mọi danh mục</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "" | "expense" | "income")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Chi & Thu</option>
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-4 pb-4">
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">Đang tải…</p>}
        {!isLoading && groups.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Không có khoản nào.</p>}
        {groups.map(([day, items]) => {
          const total = items.reduce((s, t) => s + (t.type === "expense" ? t.amount : -t.amount), 0);
          return (
            <div key={day}>
              <div className="flex items-baseline justify-between px-1 pb-1">
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{formatDayHeading(items[0]!.occurredAt)}</h2>
                <span className="text-xs font-medium text-slate-400">{formatVnd(total)}</span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
                {items.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onClick={() => setEditing(tx)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <EditSheet tx={editing} categories={categories ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditSheet({ tx, categories, onClose }: { tx: Transaction; categories: Category[]; onClose: () => void }) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [note, setNote] = useState(tx.note);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  async function save(): Promise<void> {
    await update.mutateAsync({
      id: tx.id,
      amount: Number(amount) || tx.amount,
      note,
      categoryId: categoryId !== tx.categoryId ? categoryId : undefined,
      learn: categoryId !== tx.categoryId,
    });
    onClose();
  }

  async function del(): Promise<void> {
    await remove.mutateAsync(tx.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-white p-4 pb-safe dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-lg font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <CategoryPicker categories={categories.filter((c) => !c.hidden)} selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={del}
            className="flex-1 rounded-xl bg-red-50 py-3 font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400"
          >
            Xóa
          </button>
          <button onClick={save} className="flex-1 rounded-xl bg-teal-600 py-3 font-medium text-white">
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
