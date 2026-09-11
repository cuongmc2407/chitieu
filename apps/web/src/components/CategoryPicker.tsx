import clsx from "clsx";
import type { Category } from "../types";

interface CategoryPickerProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  className?: string;
}

/** Horizontally-scrolling row of category chips — used to eyeball/override the guessed category before saving. */
export default function CategoryPicker({ categories, selectedId, onSelect, className }: CategoryPickerProps) {
  return (
    <div className={clsx("flex gap-2 overflow-x-auto pb-1", className)}>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
          )}
        >
          <span>{c.emoji}</span>
          {c.name}
        </button>
      ))}
    </div>
  );
}
