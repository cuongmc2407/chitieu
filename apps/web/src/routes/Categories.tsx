import { useState } from "react";
import { IconPlus, IconTrash } from "../components/icons";
import { Button, Card, Chip, Field, Page, PageHeader, SectionTitle, Sheet, inputClass } from "../components/ui";
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
    <Page>
      <PageHeader
        title="Danh mục"
        subtitle="Bot dùng từ khóa ở đây để đoán"
        action={
          <Button onClick={() => setCreating(true)} className="flex items-center gap-1 !px-3 !py-2">
            <IconPlus className="h-4 w-4" />
            Thêm
          </Button>
        }
      />

      <Section title="Chi" categories={expense} onEdit={setEditing} />
      <Section title="Thu" categories={income} onEdit={setEditing} />

      {overrides && overrides.length > 0 && (
        <section className="mt-5">
          <SectionTitle>Từ khóa bot đã học</SectionTitle>
          <Card className="mt-2 overflow-hidden">
            {overrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5 text-sm last:border-b-0 dark:border-slate-800/80"
              >
                <span>{o.categoryEmoji}</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                  “{o.keyword}” → {o.categoryName}
                </span>
                <button onClick={() => deleteOverride.mutate(o.id)} className="text-xs font-medium text-red-500">
                  Xóa
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {editing && <CategorySheet category={editing} onClose={() => setEditing(null)} />}
      {creating && <CategorySheet onClose={() => setCreating(false)} />}
    </Page>
  );
}

function Section({ title, categories, onEdit }: { title: string; categories: Category[]; onEdit: (c: Category) => void }) {
  if (categories.length === 0) return null;
  return (
    <section className="mt-5">
      <SectionTitle>{title}</SectionTitle>
      <Card className="mt-2 overflow-hidden">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onEdit(c)}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-b-0 active:bg-slate-50 dark:border-slate-800/80 dark:active:bg-slate-800/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
              {c.emoji}
            </span>
            <span
              className={`flex-1 truncate text-sm font-medium ${c.hidden ? "text-slate-400 line-through" : "text-slate-900 dark:text-white"}`}
            >
              {c.name}
            </span>
            {c.monthlyBudget != null && <Chip tone="neutral">{formatCompact(c.monthlyBudget)}/tháng</Chip>}
          </button>
        ))}
      </Card>
    </section>
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
    <Sheet onClose={onClose} title={category ? "Sửa danh mục" : "Thêm danh mục"}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Biểu tượng"
            className={`${inputClass} w-16 shrink-0 text-center text-xl`}
            maxLength={4}
          />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên danh mục" className={inputClass} />
        </div>

        {!category && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  type === t ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t === "expense" ? "Chi" : "Thu"}
              </button>
            ))}
          </div>
        )}

        <Field label="Từ khóa" hint="Cách nhau bởi dấu phẩy — bot dùng để tự đoán danh mục.">
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="phở, bún, cơm" className={inputClass} />
        </Field>

        {category && (
          <>
            <Field label="Ngân sách tháng" hint='Để trống nếu không đặt. Gõ được "3tr".'>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="3tr" className={inputClass} />
            </Field>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-sm dark:bg-slate-800/60">
              <span className="text-slate-700 dark:text-slate-200">Ẩn danh mục này</span>
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-brand-600" />
            </label>
          </>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {category && !category.isFallback && (
          <Button variant="danger" onClick={del} className="flex items-center justify-center gap-1.5">
            <IconTrash className="h-4 w-4" />
            Xóa
          </Button>
        )}
        <Button onClick={save} disabled={!name.trim()} className="flex-1">
          Lưu
        </Button>
      </div>
    </Sheet>
  );
}
