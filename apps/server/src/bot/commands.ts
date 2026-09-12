import { dayRange, getZonedParts, monthRange, parseAmount, stripDiacritics } from "@chitieu/core";
import { randomInt } from "node:crypto";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import * as categoriesRepo from "../db/repos/categories.js";
import * as pairingCodesRepo from "../db/repos/pairingCodes.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import * as usersRepo from "../db/repos/users.js";
import { buildCsv } from "../domain/csv.js";
import { listWithStatus } from "../domain/fixedCosts.js";
import { undoLatest } from "../domain/ledger.js";
import { buildBudgetProgress, buildPeriodReport } from "../domain/reports.js";
import type { BotContext } from "./context.js";
import type { BotDeps } from "./deps.js";
import {
  buildBudgetListText,
  buildCategoryListText,
  buildFixedCostsText,
  buildHelpText,
  buildReportText,
  buildTodayText,
  buildUndoneKeyboard,
  buildUndoneText,
  buildWelcomeText,
} from "./format.js";

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

export const BOT_COMMANDS = [
  { command: "start", description: "Giới thiệu bot" },
  { command: "huongdan", description: "Hướng dẫn cú pháp & lệnh" },
  { command: "homnay", description: "Chi tiêu hôm nay" },
  { command: "tuan", description: "Báo cáo tuần này" },
  { command: "thang", description: "Báo cáo tháng này" },
  { command: "xoa", description: "Xóa khoản gần nhất" },
  { command: "danhmuc", description: "Xem danh mục" },
  { command: "ngansach", description: "Xem/đặt ngân sách" },
  { command: "codinh", description: "Chi phí cố định hàng tháng" },
  { command: "nhacnho", description: "Bật/tắt nhắc nhở buổi tối" },
  { command: "ketnoi", description: "Lấy mã đăng nhập web/app" },
  { command: "xuat", description: "Xuất CSV chi tiêu tháng này" },
] as const;

export function installCommands(bot: Bot<BotContext>, deps: BotDeps): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(buildWelcomeText());
  });

  bot.command("huongdan", async (ctx) => {
    await ctx.reply(buildHelpText(), { parse_mode: "HTML" });
  });

  bot.command("homnay", async (ctx) => {
    const now = new Date();
    const ymd = getZonedParts(now, deps.config.timeZone);
    const range = dayRange(ymd, deps.config.timeZone);
    const rows = transactionsRepo.listRange(deps.db, ctx.user.id, { from: range.start.toISOString(), to: range.end.toISOString() });
    const items = rows.flatMap((transaction) => {
      const category = categoriesRepo.getById(deps.db, ctx.user.id, transaction.categoryId);
      return category ? [{ transaction, category }] : [];
    });
    await ctx.reply(buildTodayText(items, deps.config.timeZone, now));
  });

  bot.command("tuan", async (ctx) => {
    const now = new Date();
    const ymd = getZonedParts(now, deps.config.timeZone);
    const report = buildPeriodReport(deps.db, ctx.user.id, "week", ymd, deps.config.timeZone);
    const budget = buildBudgetProgress(deps.db, ctx.user.id, now, deps.config.timeZone);
    await ctx.reply(buildReportText("week", report, budget, deps.config.timeZone), { parse_mode: "HTML" });
  });

  bot.command("thang", async (ctx) => {
    const now = new Date();
    const ymd = getZonedParts(now, deps.config.timeZone);
    const report = buildPeriodReport(deps.db, ctx.user.id, "month", ymd, deps.config.timeZone);
    const budget = buildBudgetProgress(deps.db, ctx.user.id, now, deps.config.timeZone);
    await ctx.reply(buildReportText("month", report, budget, deps.config.timeZone), { parse_mode: "HTML" });
  });

  bot.command("xoa", async (ctx) => {
    const undone = undoLatest(deps.db, ctx.user.id);
    if (!undone) {
      await ctx.reply("Không có khoản nào gần đây để xóa.");
      return;
    }
    const category = categoriesRepo.getById(deps.db, ctx.user.id, undone.categoryId);
    if (!category) {
      await ctx.reply("Đã xóa khoản gần nhất.");
      return;
    }
    await ctx.reply(buildUndoneText({ transaction: undone, category }), {
      parse_mode: "HTML",
      reply_markup: buildUndoneKeyboard(undone.rowId),
    });
  });

  bot.command("danhmuc", async (ctx) => {
    const categories = categoriesRepo.listByUser(deps.db, ctx.user.id);
    await ctx.reply(buildCategoryListText(categories), { parse_mode: "HTML" });
  });

  bot.command("ngansach", async (ctx) => {
    await handleBudgetCommand(deps, ctx);
  });

  bot.command("codinh", async (ctx) => {
    const now = new Date();
    const items = listWithStatus(deps.db, ctx.user.id, now, deps.config.timeZone);
    await ctx.reply(buildFixedCostsText(items, now, deps.config.timeZone), { parse_mode: "HTML" });
  });

  bot.command("nhacnho", async (ctx) => {
    const next = !ctx.user.reminderEnabled;
    usersRepo.setReminderEnabled(deps.db, ctx.user.id, next);
    await ctx.reply(next ? "🔔 Đã bật nhắc nhở buổi tối (21:30 nếu chưa ghi khoản nào)." : "🔕 Đã tắt nhắc nhở buổi tối.");
  });

  bot.command("ketnoi", async (ctx) => {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    pairingCodesRepo.create(deps.db, ctx.user.id, code, expiresAt);
    await ctx.reply(`🔑 Mã đăng nhập của bạn: <b>${code}</b>\nCó hiệu lực 5 phút, dùng một lần trên web hoặc app.`, { parse_mode: "HTML" });
  });

  bot.command("xuat", async (ctx) => {
    const now = new Date();
    const ymd = getZonedParts(now, deps.config.timeZone);
    const monthLabel = `${ymd.year}-${String(ymd.month).padStart(2, "0")}`;
    const period = monthRange(ymd, deps.config.timeZone);
    const csv = buildCsv(deps.db, ctx.user.id, period.start.toISOString(), period.end.toISOString(), deps.config.timeZone);
    await ctx.replyWithDocument(new InputFile(Buffer.from(csv, "utf8"), `chitieu-${monthLabel}.csv`));
  });
}

async function handleBudgetCommand(deps: BotDeps, ctx: BotContext): Promise<void> {
  const argText = (ctx.match as string | undefined)?.trim() ?? "";
  if (argText === "") {
    const categories = categoriesRepo.listByUser(deps.db, ctx.user.id);
    await ctx.reply(buildBudgetListText(categories, ctx.user.monthlyBudget), { parse_mode: "HTML" });
    return;
  }

  const parts = argText.split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply("Cú pháp: /ngansach <tên danh mục> <số tiền>  hoặc  /ngansach tổng <số tiền>");
    return;
  }

  const amountToken = parts[parts.length - 1] ?? "";
  const amount = parseAmount(amountToken, deps.config.bareNumberThreshold);
  if (amount === null) {
    await ctx.reply(`Không hiểu số tiền "${amountToken}".`);
    return;
  }

  const firstToken = parts[0] ?? "";
  if (stripDiacritics(firstToken).toLowerCase() === "tong") {
    if (amount === 0) {
      usersRepo.setMonthlyBudget(deps.db, ctx.user.id, null);
      await ctx.reply("Đã xóa ngân sách tổng.");
      return;
    }
    usersRepo.setMonthlyBudget(deps.db, ctx.user.id, amount);
    await ctx.reply(`Đã đặt ngân sách tổng: ${amount.toLocaleString("vi-VN")} ₫`);
    return;
  }

  const categoryName = parts.slice(0, -1).join(" ");
  const category = categoriesRepo.findByNameLoose(deps.db, ctx.user.id, categoryName);
  if (!category) {
    await ctx.reply(`Không tìm thấy danh mục "${categoryName}". Gõ /danhmuc để xem danh sách.`);
    return;
  }

  if (amount === 0) {
    categoriesRepo.setMonthlyBudget(deps.db, ctx.user.id, category.id, null);
    await ctx.reply(`Đã xóa ngân sách của ${category.emoji} ${category.name}.`);
    return;
  }

  categoriesRepo.setMonthlyBudget(deps.db, ctx.user.id, category.id, amount);
  await ctx.reply(`Đã đặt ngân sách ${category.emoji} ${category.name}: ${amount.toLocaleString("vi-VN")} ₫`);
}
