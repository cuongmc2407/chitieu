import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import clsx from "clsx";
import { useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { IconChart } from "../components/icons";
import { Card, EmptyState, Page, PageHeader, SectionTitle } from "../components/ui";
import { useStats, type StatsPeriod } from "../hooks/useStats";
import { formatShortDate, formatVnd } from "../lib/format";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PERIOD_LABELS: Record<StatsPeriod, string> = { week: "Tuần", month: "Tháng", year: "Năm" };
const CHART_COLORS = ["#0d9488", "#14b88f", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0284c7", "#c026d3", "#64748b"];
const AXIS_COLOR = "#94a3b8";

export default function Reports() {
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data, isLoading } = useStats(period);

  return (
    <Page>
      <PageHeader title="Báo cáo" />

      <div className="mt-3 flex gap-1 rounded-2xl bg-slate-200/60 p-1 dark:bg-slate-800/60">
        {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={clsx(
              "flex-1 rounded-xl py-2 text-sm font-semibold transition-colors",
              period === p ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">Đang tải…</p>}

      {data && (
        <div className="mt-4 space-y-4">
          <Card className="p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng chi</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="tabular text-3xl font-bold text-slate-900 dark:text-white">{formatVnd(data.totalExpense)}</span>
              {data.changePct !== null && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    data.changePct >= 0
                      ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
                  )}
                >
                  {data.changePct >= 0 ? "▲" : "▼"} {Math.abs(data.changePct)}%
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400">Tổng thu</span>
              <span className="tabular text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatVnd(data.totalIncome)}</span>
            </div>
          </Card>

          {data.byCategory.length === 0 && (
            <Card>
              <EmptyState icon={<IconChart className="h-10 w-10" />} title="Chưa có dữ liệu cho kỳ này" />
            </Card>
          )}

          {data.byCategory.length > 0 && (
            <Card className="p-4">
              <SectionTitle className="!px-0">Theo danh mục</SectionTitle>
              <div className="mx-auto mt-3 max-w-[210px]">
                <Doughnut
                  data={{
                    labels: data.byCategory.map((c) => `${c.emoji} ${c.name}`),
                    datasets: [{ data: data.byCategory.map((c) => c.total), backgroundColor: CHART_COLORS, borderWidth: 0 }],
                  }}
                  options={{ cutout: "62%", plugins: { legend: { display: false } } }}
                />
              </div>
              <ul className="mt-4 space-y-2">
                {data.byCategory.map((c, i) => (
                  <li key={c.categoryId} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                      {c.emoji} {c.name}
                    </span>
                    <span className="tabular text-xs text-slate-400">{c.pct}%</span>
                    <span className="tabular w-24 text-right font-medium text-slate-900 dark:text-white">{formatVnd(c.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.dailyTotals.length > 0 && (
            <Card className="p-4">
              <SectionTitle className="!px-0">Theo ngày</SectionTitle>
              <div className="mt-3">
                <Bar
                  data={{
                    labels: data.dailyTotals.map((d) => formatShortDate(d.date)),
                    datasets: [{ data: data.dailyTotals.map((d) => d.total), backgroundColor: "#0d9488", borderRadius: 6 }],
                  }}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { display: false },
                      x: { grid: { display: false }, border: { display: false }, ticks: { color: AXIS_COLOR, font: { size: 10 } } },
                    },
                  }}
                />
              </div>
            </Card>
          )}

          <Card className="divide-y divide-slate-100 px-4 text-sm dark:divide-slate-800">
            {data.topExpense && (
              <div className="flex justify-between gap-3 py-3">
                <span className="text-slate-500 dark:text-slate-400">Khoản lớn nhất</span>
                <span className="truncate text-right font-medium text-slate-900 dark:text-white">
                  {data.topExpense.categoryEmoji} {data.topExpense.note || data.topExpense.categoryName} · {formatVnd(data.topExpense.amount)}
                </span>
              </div>
            )}
            {data.busiestDay && (
              <div className="flex justify-between gap-3 py-3">
                <span className="text-slate-500 dark:text-slate-400">Ngày chi nhiều nhất</span>
                <span className="text-right font-medium text-slate-900 dark:text-white">
                  {data.busiestDay.weekdayLabel} · {formatVnd(data.busiestDay.total)}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3 py-3">
              <span className="text-slate-500 dark:text-slate-400">Trung bình mỗi ngày</span>
              <span className="tabular font-medium text-slate-900 dark:text-white">{formatVnd(data.dailyAverage)}</span>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
