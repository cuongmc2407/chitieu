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
      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800/60"
    >
      <span className="text-xl">{tx.categoryEmoji ?? "❓"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{tx.categoryName ?? "Khác"}</span>
        {tx.note && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{tx.note}</span>}
      </span>
      <span className={`shrink-0 text-sm font-semibold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
        {isIncome ? "+" : "-"}
        {formatVnd(tx.amount).replace("-", "")}
      </span>
      {pending && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          chờ đồng bộ
        </span>
      )}
    </button>
  );
}
