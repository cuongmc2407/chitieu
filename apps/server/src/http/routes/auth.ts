import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getOrCreateUser } from "../../domain/users.js";
import * as sessionsRepo from "../../db/repos/sessions.js";
import * as usersRepo from "../../db/repos/users.js";
import { createSession, redeemPairingCode, SESSION_TTL_MS, verifyTelegramLogin, type TelegramLoginPayload } from "../../domain/auth.js";
import { requireUser, SESSION_COOKIE_NAME } from "../plugins/auth.js";

const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };
const PAIR_RATE_LIMIT = { rateLimit: { max: 5, timeWindow: "1 minute" } };

const TelegramLoginSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int().positive(),
  hash: z.string(),
});

const PairSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Mã phải gồm 6 chữ số"),
  client: z.enum(["web", "ios"]),
  device: z.string().max(200).optional(),
});

function isSecureRequest(req: { protocol: string; headers: Record<string, unknown> }): boolean {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/telegram", { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    const parsed = TelegramLoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu đăng nhập không hợp lệ" });

    const payload = parsed.data as TelegramLoginPayload;
    if (!verifyTelegramLogin(payload, app.deps.config.telegramBotToken)) {
      return reply.code(401).send({ error: "Chữ ký Telegram không hợp lệ hoặc đã hết hạn" });
    }
    if (!app.deps.config.allowedTelegramIds.has(payload.id)) {
      return reply.code(403).send({ error: "Tài khoản Telegram này chưa được cấp quyền" });
    }

    const user = getOrCreateUser(app.deps.db, payload.id, { username: payload.username ?? null, name: payload.first_name });
    const { token } = createSession(app.deps.db, user.id, "web", req.headers["user-agent"]);

    reply.setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return { user: { id: user.id, name: user.name, username: user.username } };
  });

  app.post("/api/auth/pair", { config: PAIR_RATE_LIMIT }, async (req, reply) => {
    const parsed = PairSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Yêu cầu không hợp lệ" });

    const result = redeemPairingCode(app.deps.db, parsed.data.code);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        invalid: "Mã không đúng hoặc đã dùng.",
        expired: "Mã đã hết hạn, hãy gõ /ketnoi để lấy mã mới.",
        locked: "Mã đã bị vô hiệu do nhập sai quá nhiều lần. Hãy gõ /ketnoi để lấy mã mới.",
      };
      return reply.code(400).send({ error: messages[result.reason] });
    }

    const { user } = result;
    const { token } = createSession(app.deps.db, user.id, parsed.data.client, parsed.data.device ?? req.headers["user-agent"]);

    if (parsed.data.client === "web") {
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      });
      return { user: { id: user.id, name: user.name, username: user.username } };
    }
    return { user: { id: user.id, name: user.name, username: user.username }, token };
  });

  app.post("/api/auth/logout", { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    if (req.session) sessionsRepo.remove(app.deps.db, req.session.id);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return { id: user.id, name: user.name, username: user.username, reminderEnabled: user.reminderEnabled, monthlyBudget: user.monthlyBudget };
  });

  app.patch("/api/auth/me", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = z.object({ reminderEnabled: z.boolean().optional(), monthlyBudget: z.number().int().min(0).nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ" });
    if (parsed.data.reminderEnabled !== undefined) usersRepo.setReminderEnabled(app.deps.db, user.id, parsed.data.reminderEnabled);
    if (parsed.data.monthlyBudget !== undefined) usersRepo.setMonthlyBudget(app.deps.db, user.id, parsed.data.monthlyBudget);
    const updated = usersRepo.findById(app.deps.db, user.id)!;
    return { id: updated.id, name: updated.name, username: updated.username, reminderEnabled: updated.reminderEnabled, monthlyBudget: updated.monthlyBudget };
  });

  app.get("/api/auth/sessions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const sessions = sessionsRepo.listByUser(app.deps.db, user.id);
    return sessions.map((s) => ({
      id: s.id,
      client: s.client,
      device: s.device,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      current: req.session?.id === s.id,
    }));
  });

  app.delete("/api/auth/sessions/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const removed = sessionsRepo.removeByUserAndId(app.deps.db, user.id, id);
    if (!removed) return reply.code(404).send({ error: "Không tìm thấy thiết bị" });
    return { ok: true };
  });
}
