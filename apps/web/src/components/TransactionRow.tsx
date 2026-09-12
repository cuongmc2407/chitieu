import { formatVnd } from "../lib/format";
import type { Transaction } from "../types";

interface TransactionRowProps {
  tx: Transaction;
  onClick?: () => void;
  pending?: boolean;
}

export default function TransactionRow({ tx, onClick, pending }: TransactionRowProps) {
  const isIncome = tx.type === "income";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-b-0 active:bg-slate-50 dark:border-slate-800/80 dark:active:bg-slate-800/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
        {tx.categoryEmoji ?? "❓"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{tx.note || (tx.categoryName ?? "Khác")}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">{tx.categoryName ?? "Khác"}</span>
          {tx.fixedCostId && (
            <span className="rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              🔁 cố định
            </span>
          )}
          {pending && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              chờ đồng bộ
            </span>
          )}
        </span>
      </span>
      <span
        className={`tabular shrink-0 text-sm font-semibold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}
      >
        {isIncome ? "+" : "−"}
        {formatVnd(tx.amount).replace("-", "")}
      </span>
    </button>
  );
}
