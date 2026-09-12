import clsx from "clsx";
import { NavLink } from "react-router";
import { IconChart, IconPencil, IconReceipt, IconRepeat, IconSettings } from "./icons";

const TABS = [
  { to: "/", label: "Nhập", Icon: IconPencil, end: true },
  { to: "/history", label: "Lịch sử", Icon: IconReceipt, end: false },
  { to: "/reports", label: "Báo cáo", Icon: IconChart, end: false },
  { to: "/fixed", label: "Cố định", Icon: IconRepeat, end: false },
  { to: "/settings", label: "Cài đặt", Icon: IconSettings, end: false },
] as const;

export default function TabBar() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center gap-1 pt-2 pb-1">
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    isActive ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span
                  className={clsx(
                    "text-[11px] font-medium transition-colors",
                    isActive ? "text-brand-700 dark:text-brand-300" : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
