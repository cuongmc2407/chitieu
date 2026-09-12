import { useMemo, useState } from "react";
import CategoryPicker from "../components/CategoryPicker";
import TransactionRow from "../components/TransactionRow";
import { IconReceipt, IconSearch, IconTrash } from "../components/icons";
import { Button, Card, Field, Page, PageHeader, Sheet, inputClass } from "../components/ui";
import { useCategories } from "../hooks/useCategories";
import { useDeleteTransaction, useTransactions, useUpdateTransaction } from "../hooks/useTransactions";
import { dateKey, formatDayHeading, formatVnd } from "../lib/format";
import type { Category, Transaction } from "../types";

const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

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
    <Page>
      <PageHeader title="Lịch sử" subtitle={transactions ? `${transactions.length} khoản` : undefined} />

      <div className="mt-3 space-y-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo ghi chú…" className={`${inputClass} pl-9`} />
        </div>
        <div className="flex gap-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${selectClass} min-w-0 flex-1`}>
            <option value="">Mọi danh mục</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as "" | "expense" | "income")} className={selectClass}>
            <option value="">Chi &amp; Thu</option>
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">Đang tải…</p>}
        {!isLoading && groups.length === 0 && (
          <Card>
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <IconReceipt className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Không có khoản nào</p>
              <p className="text-xs text-slate-400">Thử bỏ bớt bộ lọc phía trên.</p>
            </div>
          </Card>
        )}
        {groups.map(([day, items]) => {
          const total = items.reduce((s, t) => s + (t.type === "expense" ? t.amount : -t.amount), 0);
          return (
            <div key={day}>
              <div className="flex items-baseline justify-between px-1 pb-1.5">
                <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {formatDayHeading(items[0]!.occurredAt)}
                </h2>
                <span className="tabular text-xs font-medium text-slate-400">{formatVnd(total)}</span>
              </div>
              <Card className="overflow-hidden">
                {items.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onClick={() => setEditing(tx)} />
                ))}
              </Card>
            </div>
          );
        })}
      </div>

      {editing && <EditSheet tx={editing} categories={categories ?? []} onClose={() => setEditing(null)} />}
    </Page>
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
    <Sheet onClose={onClose} title="Sửa khoản">
      <div className="space-y-3">
        <Field label="Số tiền">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className={`${inputClass} tabular text-lg font-semibold`}
          />
        </Field>
        <Field label="Ghi chú">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" className={inputClass} />
        </Field>
        <Field label="Danh mục">
          <CategoryPicker categories={categories.filter((c) => !c.hidden)} selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="danger" onClick={del} className="flex items-center justify-center gap-1.5">
          <IconTrash className="h-4 w-4" />
          Xóa
        </Button>
        <Button onClick={save} className="flex-1">
          Lưu
        </Button>
      </div>
    </Sheet>
  );
}
