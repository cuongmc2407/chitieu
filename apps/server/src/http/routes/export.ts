import { getZonedParts, monthRange } from "@chitieu/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildCsv } from "../../domain/csv.js";
import { requireUser } from "../plugins/auth.js";

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** GET /api/export.csv?from&to — defaults to the current month when no range is given. */
export default async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/export.csv", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Tham số không hợp lệ" });

    let from = parsed.data.from;
    let to = parsed.data.to;
    if (!from || !to) {
      const period = monthRange(getZonedParts(new Date(), app.deps.config.timeZone), app.deps.config.timeZone);
      from ??= period.start.toISOString();
      to ??= period.end.toISOString();
    }

    const csv = buildCsv(app.deps.db, user.id, from, to, app.deps.config.timeZone);
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="chitieu.csv"')
      .send(csv);
  });
}
