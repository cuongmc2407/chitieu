import clsx from "clsx";

/**
 * The handful of shapes every screen repeats: a page heading, a card, a
 * bottom sheet, buttons and inputs. Keeping them here is what stops the
 * five screens from slowly drifting into five slightly different designs.
 */

export const cardClass =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900";

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx(cardClass, className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={clsx("px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400", className)}>{children}</h2>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white shadow-sm active:bg-brand-700 disabled:opacity-40",
  secondary: "bg-slate-100 text-slate-700 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700",
  danger: "bg-red-50 text-red-600 active:bg-red-100 dark:bg-red-950/50 dark:text-red-400",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      type={type}
      className={clsx(
        "rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:pointer-events-none",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Bottom sheet: tap the backdrop or the handle area to dismiss. */
export function Sheet({ onClose, title, children }: { onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade fixed inset-0 z-30 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        // Wrapped category chips can make a sheet taller than the screen —
        // cap it and scroll inside so the save button stays reachable.
        className="animate-sheet pb-safe max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        {title && <h2 className="mb-3 text-center text-base font-semibold text-slate-900 dark:text-white">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-slate-300 dark:text-slate-600">{icon}</div>}
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "warn" | "muted"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    warn: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    muted: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
  } as const;
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}

/** Shared page shell: consistent max width, horizontal padding and safe-area top. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("pt-safe mx-auto max-w-lg px-4 pt-4 pb-8", className)}>{children}</div>;
}
