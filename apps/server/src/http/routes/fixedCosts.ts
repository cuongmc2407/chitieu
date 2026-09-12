import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as categoriesRepo from "../../db/repos/categories.js";
import * as fixedCostsRepo from "../../db/repos/fixedCosts.js";
import { initialPostedPeriod, listWithStatus, type FixedCostStatus } from "../../domain/fixedCosts.js";
import { requireUser } from "../plugins/auth.js";

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  amount: z.number().int().positive(),
  categoryId: z.string().min(1),
  dayOfMonth: z.number().int().min(1).max(31),
  note: z.string().max(200).optional(),
  autoPost: z.boolean().optional(),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  amount: z.number().int().positive().optional(),
  categoryId: z.string().min(1).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  note: z.string().max(200).optional(),
  autoPost: z.boolean().optional(),
  active: z.boolean().optional(),
});

function toPublic(status: FixedCostStatus) {
  const { cost, category } = status;
  return {
    id: cost.id,
    name: cost.name,
    amount: cost.amount,
    categoryId: cost.categoryId,
    categoryName: category?.name ?? null,
    categoryEmoji: category?.emoji ?? null,
    dayOfMonth: cost.dayOfMonth,
    dueDay: status.dueDay,
    note: cost.note,
    autoPost: cost.autoPost,
    active: cost.active,
    postedThisMonth: status.postedThisMonth,
  };
}

export default async function fixedCostsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/fixed-costs", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return listWithStatus(app.deps.db, user.id, new Date(), app.deps.config.timeZone).map(toPublic);
  });

  app.post("/api/fixed-costs", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });

    if (!categoriesRepo.getById(app.deps.db, user.id, parsed.data.categoryId)) {
      return reply.code(400).send({ error: "Danh mục không tồn tại" });
    }

    const now = new Date();
    try {
      const created = fixedCostsRepo.create(app.deps.db, user.id, {
        ...parsed.data,
        lastPostedPeriod: initialPostedPeriod(parsed.data.dayOfMonth, now, app.deps.config.timeZone),
      });
      reply.code(201);
      const [status] = listWithStatus(app.deps.db, user.id, now, app.deps.config.timeZone).filter((s) => s.cost.id === created.id);
      return status ? toPublic(status) : reply.code(500).send({ error: "Không đọc lại được chi phí vừa tạo" });
    } catch {
      return reply.code(409).send({ error: "Đã có chi phí cố định trùng tên" });
    }
  });

  app.patch("/api/fixed-costs/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });

    const { id } = req.params as { id: string };
    if (parsed.data.categoryId && !categoriesRepo.getById(app.deps.db, user.id, parsed.data.categoryId)) {
      return reply.code(400).send({ error: "Danh mục không tồn tại" });
    }

    const updated = fixedCostsRepo.update(app.deps.db, user.id, id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "Không tìm thấy chi phí cố định" });

    const [status] = listWithStatus(app.deps.db, user.id, new Date(), app.deps.config.timeZone).filter((s) => s.cost.id === id);
    return status ? toPublic(status) : reply.code(404).send({ error: "Không tìm thấy chi phí cố định" });
  });

  app.delete("/api/fixed-costs/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const removed = fixedCostsRepo.remove(app.deps.db, user.id, id);
    if (!removed) return reply.code(404).send({ error: "Không tìm thấy chi phí cố định" });
    return { ok: true };
  });
}
