import clsx from "clsx";
import { NavLink } from "react-router";

const TABS = [
  { to: "/", label: "Nhập", icon: "✏️", end: true },
  { to: "/history", label: "Lịch sử", icon: "🧾", end: false },
  { to: "/reports", label: "Báo cáo", icon: "📊", end: false },
  { to: "/categories", label: "Danh mục", icon: "🏷️", end: false },
  { to: "/settings", label: "Cài đặt", icon: "⚙️", end: false },
] as const;

export default function TabBar() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
                isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500",
              )
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
