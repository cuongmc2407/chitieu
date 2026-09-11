import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as categoriesRepo from "../../db/repos/categories.js";
import { deleteCategory, toPublic } from "../../domain/categories.js";
import { requireUser } from "../plugins/auth.js";

const CreateSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8),
  type: z.enum(["expense", "income"]),
  keywords: z.array(z.string().min(1).max(60)).max(200).optional(),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  emoji: z.string().min(1).max(8).optional(),
  keywords: z.array(z.string().min(1).max(60)).max(200).optional(),
  sortOrder: z.number().int().optional(),
  hidden: z.boolean().optional(),
  monthlyBudget: z.number().int().min(0).nullable().optional(),
});

export default async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/categories", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const includeHidden = (req.query as { includeHidden?: string }).includeHidden === "true";
    return categoriesRepo.listByUser(app.deps.db, user.id, { includeHidden }).map(toPublic);
  });

  app.post("/api/categories", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });

    try {
      const category = categoriesRepo.create(app.deps.db, user.id, parsed.data);
      reply.code(201);
      return toPublic(category);
    } catch {
      return reply.code(409).send({ error: "Đã có danh mục trùng tên" });
    }
  });

  app.patch("/api/categories/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });

    const { id } = req.params as { id: string };
    if (parsed.data.monthlyBudget !== undefined) {
      categoriesRepo.setMonthlyBudget(app.deps.db, user.id, id, parsed.data.monthlyBudget);
    }
    const { monthlyBudget: _ignored, ...rest } = parsed.data;
    void _ignored;
    const updated = Object.keys(rest).length > 0 ? categoriesRepo.update(app.deps.db, user.id, id, rest) : categoriesRepo.getById(app.deps.db, user.id, id);
    if (!updated) return reply.code(404).send({ error: "Không tìm thấy danh mục" });
    return toPublic(updated);
  });

  app.delete("/api/categories/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const result = deleteCategory(app.deps.db, user.id, id);
    if (!result.ok) {
      const status = result.reason === "NOT_FOUND" ? 404 : 400;
      const message = result.reason === "NOT_FOUND" ? "Không tìm thấy danh mục" : "Không thể xóa danh mục mặc định";
      return reply.code(status).send({ error: message });
    }
    return { ok: true, reassignedCount: result.reassignedCount };
  });
}
