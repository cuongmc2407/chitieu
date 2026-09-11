import type { FastifyInstance } from "fastify";

/** GET /api/public-config — non-secret info the web login page needs before any auth exists. */
export default async function publicConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/public-config", async () => ({
    botUsername: app.botUsername,
    publicUrl: app.deps.config.publicUrl ?? null,
  }));
}
