import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { useStats, type StatsPeriod } from "../hooks/useStats";
import { formatShortDate, formatVnd } from "../lib/format";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PERIOD_LABELS: Record<StatsPeriod, string> = { week: "Tuần", month: "Tháng", year: "Năm" };
const CHART_COLORS = ["#0d9488", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0284c7", "#c026d3", "#dc2626", "#475569"];

export default function Reports() {
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data, isLoading } = useStats(period);

  return (
    <div className="mx-auto max-w-lg px-4 pt-safe pt-4 pb-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Báo cáo</h1>

      <div className="mt-3 flex gap-2">
        {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${
              period === p ? "bg-teal-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">Đang tải…</p>}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Tổng chi</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{formatVnd(data.totalExpense)}</span>
            </div>
            {data.changePct !== null && (
              <p className={`text-xs ${data.changePct >= 0 ? "text-red-500" : "text-emerald-600"}`}>
                {data.changePct >= 0 ? "▲" : "▼"} {Math.abs(data.changePct)}% so với kỳ trước
              </p>
            )}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Tổng thu</span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatVnd(data.totalIncome)}</span>
            </div>
          </div>

          {data.byCategory.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Theo danh mục</h2>
              <div className="mx-auto max-w-[220px]">
                <Doughnut
                  data={{
                    labels: data.byCategory.map((c) => `${c.emoji} ${c.name}`),
                    datasets: [{ data: data.byCategory.map((c) => c.total), backgroundColor: CHART_COLORS, borderWidth: 0 }],
                  }}
                  options={{ plugins: { legend: { display: false } } }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {data.byCategory.map((c, i) => (
                  <li key={c.categoryId} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                      {c.emoji} {c.name}
                    </span>
                    <span className="text-slate-400">{c.pct}%</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatVnd(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.dailyTotals.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Theo ngày</h2>
              <Bar
                data={{
                  labels: data.dailyTotals.map((d) => formatShortDate(d.date)),
                  datasets: [{ data: data.dailyTotals.map((d) => d.total), backgroundColor: "#0d9488", borderRadius: 6 }],
                }}
                options={{ plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm dark:bg-slate-900">
            {data.topExpense && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Khoản lớn nhất</span>
                <span className="text-right font-medium text-slate-900 dark:text-white">
                  {data.topExpense.categoryEmoji} {data.topExpense.note || data.topExpense.categoryName} · {formatVnd(data.topExpense.amount)}
                </span>
              </div>
            )}
            {data.busiestDay && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Ngày chi nhiều nhất</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {data.busiestDay.weekdayLabel} · {formatVnd(data.busiestDay.total)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Trung bình mỗi ngày</span>
              <span className="font-medium text-slate-900 dark:text-white">{formatVnd(data.dailyAverage)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
