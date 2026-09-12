import { addDays, dayRange, getZonedParts } from "@chitieu/core";
import { Cron } from "croner";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { buildFixedCostPostedText, buildReportText } from "../bot/format.js";
import type { BotContext } from "../bot/context.js";
import type { BotDeps } from "../bot/deps.js";
import * as notificationsSentRepo from "../db/repos/notificationsSent.js";
import * as transactionsRepo from "../db/repos/transactions.js";
import * as usersRepo from "../db/repos/users.js";
import { runActualSync } from "../domain/actualSync.js";
import { createBackup, gzipFile } from "../domain/backup.js";
import { postDueFixedCosts } from "../domain/fixedCosts.js";
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

/** Writes this month's due fixed costs into the ledger, then tells each user what was added. */
export async function runFixedCostsJob(bot: Bot<BotContext>, deps: BotDeps, now: Date = new Date()): Promise<void> {
  for (const { user, posted } of postDueFixedCosts(deps.db, now, deps.config.timeZone)) {
    try {
      await bot.api.sendMessage(user.telegramId, buildFixedCostPostedText(posted), { parse_mode: "HTML" });
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "Không gửi được thông báo chi phí cố định");
    }
  }
}

/** Daily SQLite backup, pruned to the last N. Optionally gzips and sends a copy to a Telegram chat. */
export async function runBackupJob(bot: Bot<BotContext>, deps: BotDeps): Promise<void> {
  try {
    const file = await createBackup(deps.db, deps.config.backup.dir, deps.config.backup.keep);
    deps.logger.info({ file }, "Đã sao lưu database");

    if (deps.config.backup.telegramChatId) {
      const gzPath = `${file}.gz`;
      try {
        await gzipFile(file, gzPath);
        await bot.api.sendDocument(deps.config.backup.telegramChatId, new InputFile(gzPath));
      } catch (err) {
        deps.logger.error({ err }, "Không gửi được bản sao lưu qua Telegram");
      }
    }
  } catch (err) {
    deps.logger.error({ err }, "Sao lưu database thất bại");
  }
}

export interface SchedulerHandle {
  stop(): void;
}

/** Wires every recurring job: cron-based reports/reminders/backup, plus a fixed-interval Actual Budget sync. */
export function startScheduler(bot: Bot<BotContext>, deps: BotDeps): SchedulerHandle {
  const jobs = [
    new Cron(deps.config.weeklyReportCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runWeeklyReports(bot, deps)),
    new Cron(deps.config.monthlyReportCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runMonthlyReports(bot, deps)),
    new Cron(deps.config.dailyReminderCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runDailyReminders(bot, deps)),
    new Cron(deps.config.backup.cron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runBackupJob(bot, deps)),
    new Cron(deps.config.fixedCostCron, { timezone: deps.config.timeZone, protect: true, catch: true }, () => runFixedCostsJob(bot, deps)),
  ];

  // Catch up right away: a server that was down at the cron time — or a cost
  // added while it was off — still gets written as soon as it comes back.
  void runFixedCostsJob(bot, deps);

  let actualSyncTimer: NodeJS.Timeout | undefined;
  if (deps.config.actual.enabled) {
    const intervalMs = deps.config.actual.syncIntervalMin * 60_000;
    const tick = () => {
      void runActualSync(deps.db, deps.config, deps.logger);
    };
    tick(); // sync once on startup instead of waiting a full interval
    actualSyncTimer = setInterval(tick, intervalMs);
  }

  return {
    stop: () => {
      for (const job of jobs) job.stop();
      if (actualSyncTimer) clearInterval(actualSyncTimer);
    },
  };
}
