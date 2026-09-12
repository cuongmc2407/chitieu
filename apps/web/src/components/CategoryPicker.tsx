import clsx from "clsx";
import type { Category } from "../types";

interface CategoryPickerProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  /**
   * Wrap onto several lines instead of scrolling sideways. Use it wherever
   * picking the right category is the whole point of the screen (the edit
   * sheets): a sideways-scrolling row hides most options behind a swipe,
   * which a mouse can't even perform.
   */
  wrap?: boolean;
  className?: string;
}

export default function CategoryPicker({ categories, selectedId, onSelect, wrap, className }: CategoryPickerProps) {
  return (
    <div className={clsx("flex gap-2", wrap ? "flex-wrap" : "-mx-1 overflow-x-auto px-1 pb-1", className)}>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            selectedId === c.id
              ? "border-brand-600 bg-brand-600 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
          )}
        >
          <span>{c.emoji}</span>
          {c.name}
        </button>
      ))}
    </div>
  );
}
