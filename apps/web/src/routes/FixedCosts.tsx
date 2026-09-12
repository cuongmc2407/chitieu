import { useMemo, useState } from "react";
import CategoryPicker from "../components/CategoryPicker";
import { IconPlus, IconRepeat, IconTrash } from "../components/icons";
import { Button, Card, Chip, EmptyState, Field, Page, PageHeader, SectionTitle, Sheet, inputClass } from "../components/ui";
import { useCategories } from "../hooks/useCategories";
import { useCreateFixedCost, useDeleteFixedCost, useFixedCosts, useUpdateFixedCost } from "../hooks/useFixedCosts";
import { formatVnd, parseAmount } from "../lib/format";
import type { Category, FixedCost } from "../types";

export default function FixedCosts() {
  const { data: costs, isLoading } = useFixedCosts();
  const { data: categories } = useCategories();
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [creating, setCreating] = useState(false);

  const active = useMemo(() => (costs ?? []).filter((c) => c.active), [costs]);
  const paused = useMemo(() => (costs ?? []).filter((c) => !c.active), [costs]);
  const monthlyTotal = active.reduce((sum, c) => sum + c.amount, 0);
  const postedCount = active.filter((c) => c.postedThisMonth).length;

  return (
    <Page>
      <PageHeader
        title="Cố định"
        subtitle="Khoản lặp lại đều mỗi tháng"
        action={
          <Button onClick={() => setCreating(true)} className="flex items-center gap-1 !px-3 !py-2">
            <IconPlus className="h-4 w-4" />
            Thêm
          </Button>
        }
      />

      <Card className="mt-4 bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white dark:border-brand-700">
        <p className="text-xs font-medium text-white/70">Tổng cố định mỗi tháng</p>
        <p className="tabular mt-1 text-3xl font-bold">{formatVnd(monthlyTotal)}</p>
        <p className="mt-1 text-xs text-white/70">
          {active.length === 0 ? "Chưa có khoản nào đang chạy" : `${postedCount}/${active.length} khoản đã được ghi trong tháng này`}
        </p>
      </Card>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">Đang tải…</p>}

      {!isLoading && (costs ?? []).length === 0 && (
        <Card className="mt-4">
          <EmptyState
            icon={<IconRepeat className="h-10 w-10" />}
            title="Chưa có chi phí cố định nào"
            hint="Tiền nhà, internet, bảo hiểm… khai báo một lần, bot sẽ tự ghi vào sổ đúng ngày mỗi tháng."
          />
        </Card>
      )}

      {active.length > 0 && (
        <section className="mt-5">
          <SectionTitle>Đang chạy</SectionTitle>
          <Card className="mt-2 overflow-hidden">
            {active.map((cost) => (
              <FixedCostRow key={cost.id} cost={cost} onClick={() => setEditing(cost)} />
            ))}
          </Card>
        </section>
      )}

      {paused.length > 0 && (
        <section className="mt-5">
          <SectionTitle>Tạm dừng</SectionTitle>
          <Card className="mt-2 overflow-hidden">
            {paused.map((cost) => (
              <FixedCostRow key={cost.id} cost={cost} onClick={() => setEditing(cost)} />
            ))}
          </Card>
        </section>
      )}

      {(creating || editing) && (
        <FixedCostSheet
          cost={editing ?? undefined}
          categories={(categories ?? []).filter((c) => !c.hidden)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function statusChip(cost: FixedCost) {
  if (!cost.active) return <Chip tone="muted">Tạm dừng</Chip>;
  if (cost.postedThisMonth) return <Chip tone="brand">Đã ghi tháng này</Chip>;
  if (!cost.autoPost) return <Chip tone="neutral">Tự ghi tay</Chip>;
  return <Chip tone="warn">Sẽ ghi ngày {cost.dueDay}</Chip>;
}

function FixedCostRow({ cost, onClick }: { cost: FixedCost; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-b-0 active:bg-slate-50 dark:border-slate-800/80 dark:active:bg-slate-800/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
        {cost.categoryEmoji ?? "❓"}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${cost.active ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
          {cost.name}
        </span>
        <span className="mt-1 flex items-center gap-1.5">{statusChip(cost)}</span>
      </span>
      <span className={`tabular shrink-0 text-sm font-semibold ${cost.active ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
        {formatVnd(cost.amount)}
      </span>
    </button>
  );
}

function FixedCostSheet({ cost, categories, onClose }: { cost?: FixedCost; categories: Category[]; onClose: () => void }) {
  const [name, setName] = useState(cost?.name ?? "");
  const [amount, setAmount] = useState(cost ? String(cost.amount) : "");
  const [categoryId, setCategoryId] = useState(cost?.categoryId ?? categories[0]?.id ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(String(cost?.dayOfMonth ?? 1));
  const [autoPost, setAutoPost] = useState(cost?.autoPost ?? true);
  const [active, setActive] = useState(cost?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateFixedCost();
  const update = useUpdateFixedCost();
  const remove = useDeleteFixedCost();

  const parsedAmount = parseAmount(amount);
  const day = Number(dayOfMonth);
  const canSave = name.trim() !== "" && parsedAmount !== null && parsedAmount > 0 && day >= 1 && day <= 31 && categoryId !== "";

  async function save(): Promise<void> {
    if (!canSave || parsedAmount === null) return;
    setError(null);
    const payload = { name: name.trim(), amount: parsedAmount, categoryId, dayOfMonth: day, autoPost };
    try {
      if (cost) await update.mutateAsync({ id: cost.id, ...payload, active });
      else await create.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được");
    }
  }

  async function del(): Promise<void> {
    if (!cost) return;
    await remove.mutateAsync(cost.id);
    onClose();
  }

  return (
    <Sheet onClose={onClose} title={cost ? "Sửa chi phí cố định" : "Thêm chi phí cố định"}>
      <div className="space-y-3">
        <Field label="Tên khoản">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tiền nhà" className={inputClass} />
        </Field>

        <Field label="Số tiền mỗi tháng" hint={parsedAmount !== null ? formatVnd(parsedAmount) : 'Gõ được cả "4tr" hay "250k"'}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="4tr" className={inputClass} />
        </Field>

        <Field label="Ngày trong tháng" hint="Chọn 31 thì tháng ngắn hơn sẽ tự lùi về ngày cuối tháng.">
          <input
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputMode="numeric"
            placeholder="5"
            className={inputClass}
          />
        </Field>

        <Field label="Danh mục">
          <CategoryPicker categories={categories} selectedId={categoryId} onSelect={(c) => setCategoryId(c.id)} wrap />
        </Field>

        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-sm dark:bg-slate-800/60">
          <span className="pr-3 text-slate-700 dark:text-slate-200">
            Tự ghi vào sổ
            <span className="mt-0.5 block text-xs text-slate-400">Tắt nếu bạn chỉ muốn theo dõi, tự nhập tay mỗi tháng.</span>
          </span>
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="h-5 w-5 accent-brand-600" />
        </label>

        {cost && (
          <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-sm dark:bg-slate-800/60">
            <span className="pr-3 text-slate-700 dark:text-slate-200">Đang áp dụng</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-brand-600" />
          </label>
        )}

        {error && <p className="px-1 text-sm text-red-500">{error}</p>}
      </div>

      <div className="mt-4 flex gap-2">
        {cost && (
          <Button variant="danger" onClick={del} className="flex items-center justify-center gap-1.5">
            <IconTrash className="h-4 w-4" />
            Xóa
          </Button>
        )}
        <Button onClick={save} disabled={!canSave || create.isPending || update.isPending} className="flex-1">
          Lưu
        </Button>
      </div>
    </Sheet>
  );
}
