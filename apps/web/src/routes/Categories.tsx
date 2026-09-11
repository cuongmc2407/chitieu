import { useState } from "react";
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from "../hooks/useCategories";
import { useDeleteKeywordOverride, useKeywordOverrides } from "../hooks/useKeywordOverrides";
import { formatCompact, parseAmount } from "../lib/format";
import type { Category } from "../types";

export default function Categories() {
  const { data: categories } = useCategories(true);
  const { data: overrides } = useKeywordOverrides();
  const deleteOverride = useDeleteKeywordOverride();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const expense = (categories ?? []).filter((c) => c.type === "expense");
  const income = (categories ?? []).filter((c) => c.type === "income");

  return (
    <div className="mx-auto max-w-lg px-4 pt-safe pt-4 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Danh mục</h1>
        <button onClick={() => setCreating(true)} className="rounded-full bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
          + Thêm
        </button>
      </div>

      <Section title="Chi" categories={expense} onEdit={setEditing} />
      <Section title="Thu" categories={income} onEdit={setEditing} />

      {overrides && overrides.length > 0 && (
        <div className="mt-6">
          <h2 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Từ khóa bot đã học</h2>
          <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
            {overrides.map((o) => (
              <div key={o.id} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0 dark:border-slate-800">
                <span>{o.categoryEmoji}</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">"{o.keyword}" → {o.categoryName}</span>
                <button onClick={() => deleteOverride.mutate(o.id)} className="text-xs font-medium text-red-500">
                  Xóa
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && <CategorySheet category={editing} onClose={() => setEditing(null)} />}
      {creating && <CategorySheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function Section({ title, categories, onEdit }: { title: string; categories: Category[]; onEdit: (c: Category) => void }) {
  if (categories.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onEdit(c)}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800/60"
          >
            <span className="text-xl">{c.emoji}</span>
            <span className={`flex-1 truncate text-sm font-medium ${c.hidden ? "text-slate-400 line-through" : "text-slate-900 dark:text-white"}`}>
              {c.name}
            </span>
            {c.monthlyBudget != null && <span className="text-xs text-slate-400">{formatCompact(c.monthlyBudget)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategorySheet({ category, onClose }: { category?: Category; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? "🏷️");
  const [type, setType] = useState<"expense" | "income">(category?.type ?? "expense");
  const [keywords, setKeywords] = useState((category?.keywords ?? []).join(", "));
  const [budget, setBudget] = useState(category?.monthlyBudget != null ? String(category.monthlyBudget) : "");
  const [hidden, setHidden] = useState(category?.hidden ?? false);

  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  async function save(): Promise<void> {
    const keywordList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const monthlyBudget = budget.trim() === "" ? null : (parseAmount(budget) ?? null);

    if (category) {
      await update.mutateAsync({ id: category.id, name, emoji, keywords: keywordList, hidden, monthlyBudget });
    } else {
      await create.mutateAsync({ name, emoji, type, keywords: keywordList });
    }
    onClose();
  }

  async function del(): Promise<void> {
    if (!category) return;
    await remove.mutateAsync(category.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-white p-4 pb-safe dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-16 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-xl dark:border-slate-700 dark:bg-slate-800"
              maxLength={4}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên danh mục"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {!category && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${type === "expense" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                Chi
              </button>
              <button
                type="button"
                onClick={() => setType("income")}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${type === "income" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                Thu
              </button>
            </div>
          )}
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Từ khóa, cách nhau bởi dấu phẩy"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {category && (
            <>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Ngân sách tháng (vd: 3tr) — để trống nếu không đặt"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <label className="flex items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
                Ẩn danh mục này
              </label>
            </>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          {category && !category.isFallback && (
            <button onClick={del} className="flex-1 rounded-xl bg-red-50 py-3 font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
              Xóa
            </button>
          )}
          <button onClick={save} disabled={!name.trim()} className="flex-1 rounded-xl bg-teal-600 py-3 font-medium text-white disabled:opacity-50">
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
