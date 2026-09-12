import { formatCompact, formatVnd, getZonedParts, sameYMD, weekdayOf, type YMD } from "@chitieu/core";
import { InlineKeyboard } from "grammy";
import type { FixedCostStatus, PostedFixedCost } from "../domain/fixedCosts.js";
import type { BudgetProgress, PeriodReport } from "../domain/reports.js";
import type { LedgerItemResult } from "../domain/ledger.js";
import type { CategoryRow } from "../db/repos/categories.js";
import type { TransactionRow } from "../db/repos/transactions.js";
import {
  encodeChangeCategory,
  encodeRestore,
  encodeSelectCategory,
  encodeUndo,
  encodeUndoAll,
} from "./callbackData.js";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dd(n: number): string {
  return String(n).padStart(2, "0");
}

function ddmm(ymd: YMD): string {
  return `${dd(ymd.day)}/${dd(ymd.month)}`;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// ---------------------------------------------------------------------------
// Confirmation message (after saving one or more items)
// ---------------------------------------------------------------------------

export interface ConfirmationSummary {
  todayTotal: number;
  monthTotal: number;
  monthBudget: number | null;
}

export function buildConfirmationText(items: LedgerItemResult[], summary: ConfirmationSummary, timeZone: string, now: Date): string {
  const todayYmd = getZonedParts(now, timeZone);

  const lines = items.map((item) => {
    const occurredYmd = getZonedParts(new Date(item.transaction.occurredAt), timeZone);
    const dateSuffix = sameYMD(occurredYmd, todayYmd) ? "" : ` · 📅 ${ddmm(occurredYmd)}`;
    const noteSuffix = item.transaction.note ? ` · ${escapeHtml(item.transaction.note)}` : "";
    const verb = item.transaction.type === "income" ? "✅" : "✅";
    return `${verb} ${item.category.emoji} ${escapeHtml(item.category.name)} · ${formatVnd(item.transaction.amount)}${noteSuffix}${dateSuffix}`;
  });

  const budgetSuffix = summary.monthBudget != null ? ` / ngân sách ${formatCompact(summary.monthBudget)}` : "";
  lines.push(`Hôm nay: ${formatVnd(summary.todayTotal)} · Tháng ${todayYmd.month}: ${formatCompact(summary.monthTotal)}${budgetSuffix}`);

  return lines.join("\n");
}

export function buildConfirmationKeyboard(items: LedgerItemResult[], telegramMessageId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (items.length === 1 && items[0]) {
    const item = items[0];
    kb.text("🏷 Đổi danh mục", encodeChangeCategory(item.transaction.rowId)).text("↩️ Hoàn tác", encodeUndo(item.transaction.rowId));
    return kb;
  }
  items.forEach((item, i) => {
    kb.text(`🏷 ${i + 1}`, encodeChangeCategory(item.transaction.rowId));
  });
  kb.row().text("↩️ Hoàn tác tất cả", encodeUndoAll(telegramMessageId));
  return kb;
}

export function buildCategoryKeyboard(categories: CategoryRow[], txRowId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  categories.forEach((c, i) => {
    kb.text(`${c.emoji} ${c.name}`, encodeSelectCategory(txRowId, c.rowId));
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

export function buildUndoneText(item: { category: CategoryRow; transaction: TransactionRow }): string {
  const noteSuffix = item.transaction.note ? ` · ${escapeHtml(item.transaction.note)}` : "";
  return `<s>${item.category.emoji} ${escapeHtml(item.category.name)} · ${formatVnd(item.transaction.amount)}${noteSuffix}</s>\n↩️ Đã hoàn tác.`;
}

export function buildUndoneKeyboard(txRowId: number): InlineKeyboard {
  return new InlineKeyboard().text("Khôi phục", encodeRestore(txRowId));
}

export function buildRestoredText(item: { category: CategoryRow; transaction: TransactionRow }): string {
  const noteSuffix = item.transaction.note ? ` · ${escapeHtml(item.transaction.note)}` : "";
  return `✅ ${item.category.emoji} ${escapeHtml(item.category.name)} · ${formatVnd(item.transaction.amount)}${noteSuffix}\n↩️ Đã khôi phục.`;
}

export function buildCategoryChangedText(item: { category: CategoryRow; transaction: TransactionRow }): string {
  const noteSuffix = item.transaction.note ? ` · ${escapeHtml(item.transaction.note)}` : "";
  return `✅ ${item.category.emoji} ${escapeHtml(item.category.name)} · ${formatVnd(item.transaction.amount)}${noteSuffix}\n🏷 Đã đổi danh mục. Lần sau mình sẽ tự nhớ!`;
}

// ---------------------------------------------------------------------------
// Ask-again (edited message with no amount)
// ---------------------------------------------------------------------------

export function buildAskAgainText(): string {
  return [
    "🤔 Mình không tìm thấy số tiền trong tin đã sửa.",
    'Ví dụ cú pháp: "phở 45k" hoặc "xăng 80k, trà đá 5k".',
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reports (week/month) — shared by /tuan, /thang and the scheduled jobs
// ---------------------------------------------------------------------------

function displayWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    width += cp >= 0x1f000 || (cp >= 0x2190 && cp <= 0x2bff) ? 2 : 1;
  }
  return width;
}

function padEndDisplay(s: string, width: number): string {
  const w = displayWidth(s);
  return w >= width ? s : s + " ".repeat(width - w);
}

function padStartDisplay(s: string, width: number): string {
  const w = displayWidth(s);
  return w >= width ? s : " ".repeat(width - w) + s;
}

function truncate(s: string, maxChars: number): string {
  return [...s].length > maxChars ? [...s].slice(0, maxChars).join("") : s;
}

function buildCategoryTable(byCategory: PeriodReport["byCategory"]): string {
  if (byCategory.length === 0) return "";
  const amountWidth = Math.max(...byCategory.map((c) => displayWidth(formatVnd(c.total)) + 2));
  const rows = byCategory.map((c) => {
    const name = padEndDisplay(`${c.category.emoji} ${truncate(c.category.name, 10)}`, 15);
    const amount = padStartDisplay(formatVnd(c.total), amountWidth);
    const pct = padStartDisplay(`${c.pct}%`, 4);
    const bar = "█".repeat(Math.max(0, Math.round(c.pct / 5)));
    return `${name} ${amount}  ${pct}  ${bar}`;
  });
  return rows.join("\n");
}

function budgetProgressLines(budget: BudgetProgress): string[] {
  return budget.byCategory.map((b) => `${b.category.emoji} ${formatCompact(b.spent)}/${formatCompact(b.budget)} (${b.pct}%)`);
}

export function buildReportText(kind: "week" | "month", report: PeriodReport, budget: BudgetProgress, timeZone: string): string {
  const startYmd = getZonedParts(report.period.start, timeZone);
  const lastDayYmd = getZonedParts(new Date(report.period.end.getTime() - 1), timeZone);

  const title = kind === "week" ? `📊 Báo cáo tuần ${ddmm(startYmd)} – ${ddmm(lastDayYmd)}` : `📊 Báo cáo tháng ${startYmd.month}/${startYmd.year}`;

  const changeLabel = kind === "week" ? "tuần trước" : "tháng trước";
  const changeSuffix =
    report.changePct === null ? "" : ` (${report.changePct >= 0 ? "▲" : "▼"} ${Math.abs(report.changePct)}% so với ${changeLabel})`;

  const lines: string[] = [
    title,
    `Tổng chi: ${formatVnd(report.totalExpense)}${changeSuffix}`,
    `Tổng thu: ${formatVnd(report.totalIncome)}`,
  ];

  const table = buildCategoryTable(report.byCategory);
  if (table) lines.push("", `<pre>${escapeHtml(table)}</pre>`);

  lines.push("");

  if (report.topExpense) {
    const { transaction, category } = report.topExpense;
    const occurred = getZonedParts(new Date(transaction.occurredAt), timeZone);
    const when = kind === "week" ? `(${WEEKDAY_SHORT[weekdayOf(occurred)] ?? ""})` : `(${ddmm(occurred)})`;
    const noteSuffix = transaction.note ? ` ${escapeHtml(transaction.note)}` : "";
    lines.push(`Khoản lớn nhất: ${category.emoji}${noteSuffix} ${formatVnd(transaction.amount)} ${when}`);
  }

  if (report.busiestDay) {
    const [y, m, d] = report.busiestDay.date.split("-").map(Number);
    const when = kind === "week" ? report.busiestDay.weekdayLabel : ddmm({ year: y ?? 1970, month: m ?? 1, day: d ?? 1 });
    lines.push(`Ngày chi nhiều nhất: ${when} (${formatVnd(report.busiestDay.total)})`);
  }

  lines.push(`Trung bình mỗi ngày: ${formatVnd(report.dailyAverage)}`);

  const budgetLines = budgetProgressLines(budget);
  if (budgetLines.length > 0) {
    lines.push(`Ngân sách tháng ${getZonedParts(new Date(), timeZone).month}: ${budgetLines.join(", ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /homnay
// ---------------------------------------------------------------------------

export function buildTodayText(rows: Array<{ transaction: TransactionRow; category: CategoryRow }>, timeZone: string, now: Date): string {
  const ymd = getZonedParts(now, timeZone);
  if (rows.length === 0) {
    return `📅 Hôm nay (${ddmm(ymd)})\nChưa có khoản nào. Nhắn ví dụ "phở 45k" để bắt đầu nhé!`;
  }
  const lines = [`📅 Hôm nay (${ddmm(ymd)})`];
  let totalExpense = 0;
  let totalIncome = 0;
  for (const { transaction, category } of rows) {
    if (transaction.type === "expense") totalExpense += transaction.amount;
    else totalIncome += transaction.amount;
    const noteSuffix = transaction.note ? ` · ${escapeHtml(transaction.note)}` : "";
    lines.push(`${category.emoji} ${escapeHtml(category.name)} · ${formatVnd(transaction.amount)}${noteSuffix}`);
  }
  lines.push("", `Tổng chi: ${formatVnd(totalExpense)} · Tổng thu: ${formatVnd(totalIncome)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /danhmuc, /ngansach
// ---------------------------------------------------------------------------

export function buildCategoryListText(categories: CategoryRow[]): string {
  const expense = categories.filter((c) => c.type === "expense");
  const income = categories.filter((c) => c.type === "income");
  const line = (c: CategoryRow) => `${c.emoji} ${escapeHtml(c.name)}${c.monthlyBudget != null ? ` — ngân sách ${formatCompact(c.monthlyBudget)}` : ""}`;
  const lines = ["📂 <b>Danh mục chi</b>", ...expense.map(line), "", "💰 <b>Danh mục thu</b>", ...income.map(line)];
  return lines.join("\n");
}

export function buildBudgetListText(categories: CategoryRow[], userMonthlyBudget: number | null): string {
  const budgeted = categories.filter((c) => c.monthlyBudget != null);
  const lines = ["💰 <b>Ngân sách tháng</b>"];
  if (budgeted.length === 0 && userMonthlyBudget == null) {
    lines.push("Chưa đặt ngân sách nào.");
  } else {
    for (const c of budgeted) lines.push(`${c.emoji} ${escapeHtml(c.name)}: ${formatCompact(c.monthlyBudget ?? 0)}`);
    if (userMonthlyBudget != null) lines.push(`Tổng: ${formatCompact(userMonthlyBudget)}`);
  }
  lines.push("", "Đặt ngân sách: /ngansach &lt;tên danh mục&gt; &lt;số tiền&gt;", "Đặt tổng: /ngansach tổng &lt;số tiền&gt;");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /codinh — fixed monthly costs
// ---------------------------------------------------------------------------

export function buildFixedCostsText(items: FixedCostStatus[], now: Date, timeZone: string): string {
  if (items.length === 0) {
    return ["🔁 <b>Chi phí cố định hàng tháng</b>", "Chưa khai báo khoản nào.", "", "Thêm ở tab <b>Cố định</b> trên web/app."].join("\n");
  }

  const lines = ["🔁 <b>Chi phí cố định hàng tháng</b>"];
  for (const item of items) {
    const emoji = item.category?.emoji ?? "❓";
    const status = !item.cost.active
      ? "⏸ tạm dừng"
      : item.postedThisMonth
        ? "✅ đã ghi"
        : item.cost.autoPost
          ? `⏳ ngày ${item.dueDay}`
          : "✋ tự ghi tay";
    lines.push(`${emoji} ${escapeHtml(item.cost.name)} · ${formatVnd(item.cost.amount)} · ${status}`);
  }

  const total = items.filter((i) => i.cost.active).reduce((sum, i) => sum + i.cost.amount, 0);
  lines.push("", `Tổng cố định tháng ${getZonedParts(now, timeZone).month}: ${formatVnd(total)}`);
  return lines.join("\n");
}

export function buildFixedCostPostedText(posted: PostedFixedCost[]): string {
  const lines = ["🔁 <b>Đã tự ghi chi phí cố định</b>"];
  let total = 0;
  for (const p of posted) {
    total += p.transaction.amount;
    lines.push(`${p.category.emoji} ${escapeHtml(p.cost.name)} · ${formatVnd(p.transaction.amount)}`);
  }
  lines.push("", `Tổng: ${formatVnd(total)} — sai thì sửa hoặc xóa như khoản thường nhé.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Budget alerts
// ---------------------------------------------------------------------------

export function buildBudgetAlertText(label: string, spent: number, budget: number, pct: number): string {
  const emoji = pct >= 100 ? "🚨" : "⚠️";
  return `${emoji} ${escapeHtml(label)} đã dùng ${formatCompact(spent)}/${formatCompact(budget)} ngân sách tháng (${pct}%).`;
}

// ---------------------------------------------------------------------------
// Static help / welcome text
// ---------------------------------------------------------------------------

export function buildWelcomeText(): string {
  return [
    "👋 Chào bạn, mình là Chi Tiêu!",
    "",
    'Nhắn cho mình một khoản chi/thu, ví dụ: "phở 45k" hoặc "xăng 80k".',
    "Mình sẽ tự đoán danh mục và ghi lại ngay.",
    "",
    "Gõ /huongdan để xem đầy đủ cú pháp và lệnh.",
  ].join("\n");
}

export function buildHelpText(): string {
  return [
    "📖 <b>Cách ghi chi tiêu</b>",
    '"phở 45k", "45k phở", "xăng 80k" — số tiền đứng trước hay sau đều được.',
    "Đơn vị: k/nghìn, tr/triệu, củ (1 củ = 1 triệu). Ví dụ: 1tr2 = 1.200.000, 2k5 = 2.500.",
    "Nhiều khoản một lúc: cách nhau bởi dấu phẩy hoặc xuống dòng.",
    "Ghi ngày khác: thêm hôm qua/hqua/hôm kia/12/9/thứ 2 ở đầu hoặc cuối.",
    "Thu nhập: bắt đầu bằng dấu + hoặc có từ lương/thưởng/hoàn tiền.",
    "",
    "📋 <b>Lệnh</b>",
    "/homnay — chi tiêu hôm nay",
    "/tuan — báo cáo tuần này",
    "/thang — báo cáo tháng này",
    "/xoa — xóa khoản gần nhất",
    "/danhmuc — xem danh mục",
    "/ngansach — xem/đặt ngân sách",
    "/codinh — chi phí cố định hàng tháng",
    "/nhacnho — bật/tắt nhắc nhở buổi tối",
    "/ketnoi — lấy mã đăng nhập web/app",
    "/xuat — xuất CSV chi tiêu tháng này",
  ].join("\n");
}

export function buildUnknownCommandText(): string {
  return "🤷 Mình chưa hiểu lệnh này. Gõ /huongdan để xem danh sách lệnh nhé.";
}

export function buildRejectedText(): string {
  return "Xin lỗi, mình chỉ phục vụ chủ nhân và những người được cho phép. 🙏";
}
