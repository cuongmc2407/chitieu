import { addDays, dayRange, getZonedParts } from "@chitieu/core";
import { Cron } from "croner";
import type { Bot } from "grammy";
import { buildReportText } from "../bot/format.js";
import type { BotContext } from "../bot/context.js";
import type { BotDeps } from "../bot/deps.js";
import * as notificationsSentRepo from "../db/repos/notificationsSent.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import * as usersRepo from "../db/repos/users.js";
import { buildBudgetProgress, buildPeriodReport } from "../domain/reports.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Sends the weekly report (Mon–Sun containing `now`) to every user, once per week. */
export async function runWeeklyReports(bot: Bot<BotContext>, deps: BotDeps, now: Date = new Date()): Promise<void> {
  const ymd = getZonedParts(now, deps.config.timeZone);
  for (const user of usersRepo.listAll(deps.db)) {
    const report = buildPeriodReport(deps.db, user.id, "week", ymd, deps.config.timeZone);
    const weekStart = getZonedParts(report.period.start, deps.config.timeZone);
    const periodKey = `${weekStart.year}-${pad2(weekStart.month)}-${pad2(weekStart.day)}`;
    if (notificationsSentRepo.hasSent(deps.db, user.id, "weekly_report", "self", periodKey)) continue;

    const budget = buildBudgetProgress(deps.db, user.id, now, deps.config.timeZone);
    const text = buildReportText("week", report, budget, deps.config.timeZone);
    try {
      await bot.api.sendMessage(user.telegramId, text, { parse_mode: "HTML" });
      notificationsSentRepo.markSent(deps.db, user.id, "weekly_report", "self", periodKey);
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "Không gửi được báo cáo tuần");
    }
  }
}

/** Sends the report for the month that just ended to every user, once per month. */
export async function runMonthlyReports(bot: Bot<BotContext>, deps: BotDeps, now: Date = new Date()): Promise<void> {
  const ymd = getZonedParts(now, deps.config.timeZone);
  const prevMonthAnchor = addDays({ year: ymd.year, month: ymd.month, day: 1 }, -1);

  for (const user of usersRepo.listAll(deps.db)) {
    const report = buildPeriodReport(deps.db, user.id, "month", prevMonthAnchor, deps.config.timeZone);
    const periodKey = `${prevMonthAnchor.year}-${pad2(prevMonthAnchor.month)}`;
    if (notificationsSentRepo.hasSent(deps.db, user.id, "monthly_report", "self", periodKey)) continue;

    const budget = buildBudgetProgress(deps.db, user.id, now, deps.config.timeZone);
    const text = buildReportText("month", report, budget, deps.config.timeZone);
    try {
      await bot.api.sendMessage(user.telegramId, text, { parse_mode: "HTML" });
      notificationsSentRepo.markSent(deps.db, user.id, "monthly_report", "self", periodKey);
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "Không gửi được báo cáo tháng");
    }
  }
}

/** Nudges users who enabled reminders and haven't logged anything today yet. */
export async function runDailyReminders(bot: Bot<BotContext>, deps: BotDeps, now: Date = new Date()): Promise<void> {
  const ymd = getZonedParts(now, deps.config.timeZone);
  const range = dayRange(ymd, deps.config.timeZone);
  const periodKey = `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`;

  for (const user of usersRepo.listAll(deps.db)) {
    if (!user.reminderEnabled) continue;
    if (notificationsSentRepo.hasSent(deps.db, user.id, "daily_reminder", "self", periodKey)) continue;

    const rows = transactionsRepo.listRange(deps.db, user.id, { from: range.start.toISOString(), to: range.end.toISOString() });
    if (rows.length > 0) continue;

    try {
      await bot.api.sendMessage(user.telegramId, "🌙 Hôm nay bạn chưa ghi khoản chi tiêu nào. Đừng quên nhé!");
      notificationsSentRepo.markSent(deps.db, user.id, "daily_reminder", "self", periodKey);
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "Không gửi được nhắc nhở");
    }
  }
}

export interface SchedulerHandle {
  stop(): void;
}

/** Wires the three recurring jobs to croner, running in `config.timeZone`. */
export function startScheduler(bot: Bot<BotContext>, deps: BotDeps): SchedulerHandle {
  const jobs = [
    new Cron(deps.config.weeklyReportCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runWeeklyReports(bot, deps)),
    new Cron(deps.config.monthlyReportCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runMonthlyReports(bot, deps)),
    new Cron(deps.config.dailyReminderCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runDailyReminders(bot, deps)),
  ];
  return {
    stop: () => {
      for (const job of jobs) job.stop();
    },
  };
}
