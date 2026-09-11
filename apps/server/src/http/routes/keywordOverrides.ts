import type { FastifyInstance } from "fastify";
import * as categoriesRepo from "../../db/repos/categories.js";
import * as keywordOverridesRepo from "../../db/repos/keywordOverrides.js";
import { requireUser } from "../plugins/auth.js";

export default async function keywordOverridesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/keyword-overrides", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const overrides = keywordOverridesRepo.listByUser(app.deps.db, user.id);
    const categories = categoriesRepo.listByUser(app.deps.db, user.id, { includeHidden: true });
    const byId = new Map(categories.map((c) => [c.id, c]));
    return overrides.map((o) => {
      const category = byId.get(o.categoryId);
      return {
        id: o.id,
        keyword: o.keyword,
        categoryId: o.categoryId,
        categoryName: category?.name ?? null,
        categoryEmoji: category?.emoji ?? null,
        createdAt: o.createdAt,
      };
    });
  });

  app.delete("/api/keyword-overrides/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const removed = keywordOverridesRepo.deleteById(app.deps.db, user.id, Number(id));
    if (!removed) return reply.code(404).send({ error: "Không tìm thấy từ khóa" });
    return { ok: true };
  });
}
