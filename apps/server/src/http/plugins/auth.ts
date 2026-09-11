import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BotDeps } from "../../bot/deps.js";
import type { SessionRow } from "../../db/repos/sessions.js";
import type { UserRow } from "../../db/repos/users.js";
import { resolveSession } from "../../domain/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    deps: BotDeps;
    botUsername: string | null;
  }
  interface FastifyRequest {
    user?: UserRow;
    session?: SessionRow;
    authVia?: "bearer" | "cookie";
  }
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
export const SESSION_COOKIE_NAME = "ct_session";

/**
 * Resolves `req.user` from either an `Authorization: Bearer <token>` header
 * (app iOS) or the `ct_session` cookie (web). Cookie-authenticated mutating
 * requests are also checked against `Origin` as a CSRF guard — Bearer
 * requests are exempt (a stolen cookie is silently usable cross-site;
 * a stolen header is not).
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user", undefined);
  app.decorateRequest("session", undefined);
  app.decorateRequest("authVia", undefined);

  app.addHook("preHandler", async (req, reply) => {
    const authHeader = req.headers.authorization;
    let token: string | null = null;
    let via: "bearer" | "cookie" | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
      via = "bearer";
    } else {
      const cookieToken = req.cookies[SESSION_COOKIE_NAME];
      if (cookieToken) {
        token = cookieToken;
        via = "cookie";
      }
    }
    if (!token || !via) return;

    const result = resolveSession(app.deps.db, app.deps.config, token);
    if (!result) return;

    if (via === "cookie" && MUTATING_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && app.deps.config.publicUrl && origin !== app.deps.config.publicUrl) {
        await reply.code(403).send({ error: "Yêu cầu không hợp lệ (CSRF)" });
        return;
      }
    }

    req.user = result.user;
    req.session = result.session;
    req.authVia = via;
  });
});

/** Sends 401 and returns null when there's no authenticated user; otherwise returns it. Call at the top of every protected handler. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): UserRow | null {
  if (!req.user) {
    reply.code(401).send({ error: "Chưa đăng nhập" });
    return null;
  }
  return req.user;
}
