import { getZonedParts } from "@chitieu/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPeriodReport } from "../../domain/reports.js";
import { totalsByDay } from "../../domain/stats.js";
import { requireUser } from "../plugins/auth.js";

const QuerySchema = z.object({
  period: z.enum(["week", "month", "year"]).default("month"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /api/stats?period=week|month|year&date=yyyy-mm-dd — totals by category/day, vs-previous-period comparison, top expense. */
export default async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Tham số không hợp lệ" });

    const timeZone = app.deps.config.timeZone;
    const anchor = parsed.data.date
      ? (() => {
          const [y, m, d] = parsed.data.date!.split("-").map(Number);
          return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
        })()
      : getZonedParts(new Date(), timeZone);

    const report = buildPeriodReport(app.deps.db, user.id, parsed.data.period, anchor, timeZone);
    const dailyTotals = totalsByDay(app.deps.db, user.id, report.period.start.toISOString(), report.period.end.toISOString(), timeZone, "expense");

    return {
      period: { start: report.period.start.toISOString(), end: report.period.end.toISOString() },
      totalExpense: report.totalExpense,
      totalIncome: report.totalIncome,
      changePct: report.changePct,
      byCategory: report.byCategory.map((c) => ({
        categoryId: c.category.id,
        name: c.category.name,
        emoji: c.category.emoji,
        total: c.total,
        pct: c.pct,
      })),
      topExpense: report.topExpense
        ? {
            id: report.topExpense.transaction.id,
            amount: report.topExpense.transaction.amount,
            note: report.topExpense.transaction.note,
            categoryId: report.topExpense.category.id,
            categoryName: report.topExpense.category.name,
            categoryEmoji: report.topExpense.category.emoji,
            occurredAt: report.topExpense.transaction.occurredAt,
          }
        : null,
      busiestDay: report.busiestDay,
      dailyAverage: report.dailyAverage,
      dailyTotals,
    };
  });
}
