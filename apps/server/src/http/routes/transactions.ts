import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CategoryRow } from "../../db/repos/categories.js";
import * as transactionsRepo from "../../db/repos/transactions.js";
import type { TransactionRow } from "../../db/repos/transactions.js";
import { createFromText, createStructured, undo, updateTransaction } from "../../domain/ledger.js";
import { requireUser } from "../plugins/auth.js";
import * as categoriesRepo from "../../db/repos/categories.js";

function toPublic(tx: TransactionRow, category: CategoryRow | undefined) {
  return {
    id: tx.id,
    amount: tx.amount,
    type: tx.type,
    categoryId: tx.categoryId,
    categoryName: category?.name ?? null,
    categoryEmoji: category?.emoji ?? null,
    note: tx.note,
    rawText: tx.rawText,
    occurredAt: tx.occurredAt,
    source: tx.source,
    clientId: tx.clientId,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

const ListQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  type: z.enum(["expense", "income"]).optional(),
});

const TextBodySchema = z.object({
  text: z.string().min(1).max(2000),
  clientId: z.string().min(1).max(200).optional(),
  learn: z.boolean().optional(),
});

const StructuredBodySchema = z.object({
  amount: z.number().int().positive(),
  type: z.enum(["expense", "income"]),
  categoryId: z.string().min(1),
  note: z.string().max(500).optional(),
  occurredAt: z.string().min(1).optional(),
  clientId: z.string().min(1).max(200).optional(),
  learn: z.boolean().optional(),
});

const PatchBodySchema = z.object({
  amount: z.number().int().positive().optional(),
  categoryId: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
  occurredAt: z.string().min(1).optional(),
  learn: z.boolean().optional(),
});

export default async function transactionsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/transactions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Tham số không hợp lệ" });

    const rows = transactionsRepo.search(app.deps.db, user.id, {
      from: parsed.data.from,
      to: parsed.data.to,
      categoryId: parsed.data.category,
      q: parsed.data.q,
      type: parsed.data.type,
    });
    const categories = categoriesRepo.listByUser(app.deps.db, user.id, { includeHidden: true });
    const byId = new Map(categories.map((c) => [c.id, c]));
    return rows.map((tx) => toPublic(tx, byId.get(tx.categoryId)));
  });

  app.post("/api/transactions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const body = req.body as Record<string, unknown> | undefined;
    const source = req.authVia === "bearer" ? "ios" : "web";

    if (body && typeof body.text === "string") {
      const parsed = TextBodySchema.safeParse(body);
      if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });
      const clientId = parsed.data.clientId ?? randomUUID();

      const result = createFromText(
        app.deps.db,
        user.id,
        parsed.data.text,
        { timeZone: app.deps.config.timeZone, bareNumberThreshold: app.deps.config.bareNumberThreshold },
        { source, now: new Date(), clientIdPrefix: clientId },
      );
      if (!result.ok) return reply.code(422).send({ errors: result.errors });
      reply.code(201);
      return { items: result.items.map((i) => toPublic(i.transaction, i.category)) };
    }

    const parsed = StructuredBodySchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });
    const clientId = parsed.data.clientId ?? randomUUID();

    const result = createStructured(
      app.deps.db,
      user.id,
      {
        amount: parsed.data.amount,
        type: parsed.data.type,
        categoryId: parsed.data.categoryId,
        note: parsed.data.note,
        occurredAt: parsed.data.occurredAt ?? new Date().toISOString(),
      },
      { source, clientId, learn: parsed.data.learn },
    );
    if ("error" in result) return reply.code(400).send({ error: "Không tìm thấy danh mục" });
    reply.code(201);
    return toPublic(result.transaction, result.category);
  });

  app.patch("/api/transactions/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = PatchBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });

    const { id } = req.params as { id: string };
    const result = updateTransaction(
      app.deps.db,
      user.id,
      id,
      { amount: parsed.data.amount, categoryId: parsed.data.categoryId, note: parsed.data.note, occurredAt: parsed.data.occurredAt },
      { learn: parsed.data.learn },
    );
    if (!result) return reply.code(404).send({ error: "Không tìm thấy giao dịch" });
    return toPublic(result.transaction, result.category);
  });

  app.delete("/api/transactions/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const result = undo(app.deps.db, user.id, id);
    if (!result) return reply.code(404).send({ error: "Không tìm thấy giao dịch" });
    return { ok: true };
  });
}
