import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadParseOptions } from "../../domain/ledger.js";
import { requireUser } from "../plugins/auth.js";
import { serializeParseResult } from "./serialize.js";
import { parseMessage } from "@chitieu/core";

const ParseBodySchema = z.object({ text: z.string().min(1).max(2000) });

/** POST /api/parse — live preview for the Quick Entry screen, using the user's own learned keywords. */
export default async function parseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/parse", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = ParseBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Thiếu nội dung tin nhắn" });

    const { categories, overrides } = loadParseOptions(app.deps.db, user.id);
    const result = parseMessage(parsed.data.text, new Date(), {
      categories,
      overrides,
      timeZone: app.deps.config.timeZone,
      bareNumberThreshold: app.deps.config.bareNumberThreshold,
    });

    return serializeParseResult(result, categories);
  });
}
