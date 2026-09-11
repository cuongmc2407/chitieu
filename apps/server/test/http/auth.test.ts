import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as pairingCodesRepo from "../../src/db/repos/pairingCodes.js";
import { redeemPairingCode } from "../../src/domain/auth.js";
import { getOrCreateUser } from "../../src/domain/users.js";
import { createTestApi, loginAs, type TestApiContext } from "../httpSetup.js";

const BOT_TOKEN = "TEST:TOKEN";

function signTelegramLogin(fields: Record<string, string | number>, botToken = BOT_TOKEN): Record<string, string | number> {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(checkString).digest("hex");
  return { ...fields, hash };
}

let ctx: TestApiContext;
beforeEach(async () => {
  ctx = await createTestApi({ telegramBotToken: BOT_TOKEN });
});
afterEach(async () => {
  await ctx.app.close();
});

describe("POST /api/auth/telegram", () => {
  it("accepts a correctly signed, allow-listed, recent login", async () => {
    ctx.config.allowedTelegramIds.add(555);
    const payload = signTelegramLogin({ id: 555, first_name: "Alice", auth_date: Math.floor(Date.now() / 1000) });

    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/telegram", payload });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name === "ct_session")).toBe(true);
    expect(JSON.parse(res.body).user.name).toBe("Alice");
  });

  it("rejects a tampered/wrong hash", async () => {
    ctx.config.allowedTelegramIds.add(556);
    const payload = signTelegramLogin({ id: 556, first_name: "Bob", auth_date: Math.floor(Date.now() / 1000) });
    payload.hash = "0".repeat(64);

    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/telegram", payload });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a login older than 1 hour", async () => {
    ctx.config.allowedTelegramIds.add(557);
    const payload = signTelegramLogin({ id: 557, first_name: "Cara", auth_date: Math.floor(Date.now() / 1000) - 2 * 3600 });

    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/telegram", payload });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a correctly signed login for an id not in ALLOWED_TELEGRAM_IDS", async () => {
    const payload = signTelegramLogin({ id: 999999, first_name: "Stranger", auth_date: Math.floor(Date.now() / 1000) });
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/telegram", payload });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /api/auth/pair", () => {
  it("redeems a fresh code once, then rejects reuse", async () => {
    const user = getOrCreateUser(ctx.db, 600);
    ctx.config.allowedTelegramIds.add(600);
    const code = "111222";
    pairingCodesRepo.create(ctx.db, user.id, code, new Date(Date.now() + 5 * 60 * 1000).toISOString());

    const first = await ctx.app.inject({ method: "POST", url: "/api/auth/pair", payload: { code, client: "ios" } });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).token).toBeTruthy();

    const second = await ctx.app.inject({ method: "POST", url: "/api/auth/pair", payload: { code, client: "ios" } });
    expect(second.statusCode).toBe(400);
  });

  it("rejects an expired code", async () => {
    const user = getOrCreateUser(ctx.db, 601);
    ctx.config.allowedTelegramIds.add(601);
    const code = "222333";
    pairingCodesRepo.create(ctx.db, user.id, code, new Date(Date.now() - 1000).toISOString());

    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/pair", payload: { code, client: "ios" } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/hết hạn/);
  });

  it("locks every active code after 5 wrong attempts (global, not per-code)", async () => {
    // Drive the 5 wrong guesses through the domain function directly, not
    // HTTP — /api/auth/pair is itself rate-limited to 5/min, which would
    // otherwise mask the pairing-lockout behavior this test targets.
    const user = getOrCreateUser(ctx.db, 602);
    ctx.config.allowedTelegramIds.add(602);
    const goodCode = "333444";
    pairingCodesRepo.create(ctx.db, user.id, goodCode, new Date(Date.now() + 5 * 60 * 1000).toISOString());

    for (let i = 0; i < 5; i++) {
      expect(redeemPairingCode(ctx.db, "000000").ok).toBe(false);
    }

    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/pair", payload: { code: goodCode, client: "ios" } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/vô hiệu/);
  });

  it("web client gets a cookie, ios client gets a bearer token in the body", async () => {
    const webUser = getOrCreateUser(ctx.db, 603);
    ctx.config.allowedTelegramIds.add(603);
    pairingCodesRepo.create(ctx.db, webUser.id, "444555", new Date(Date.now() + 5 * 60 * 1000).toISOString());
    const webRes = await ctx.app.inject({ method: "POST", url: "/api/auth/pair", payload: { code: "444555", client: "web" } });
    expect(webRes.cookies.some((c) => c.name === "ct_session")).toBe(true);
    expect(JSON.parse(webRes.body).token).toBeUndefined();
  });
});

describe("GET/DELETE /api/auth/sessions", () => {
  it("lists sessions and can revoke one", async () => {
    const { token } = loginAs(ctx, 610);
    const list = await ctx.app.inject({ method: "GET", url: "/api/auth/sessions", headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(200);
    const sessions = JSON.parse(list.body) as Array<{ id: string; current: boolean }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.current).toBe(true);

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/api/auth/sessions/${sessions[0]!.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);

    const afterList = await ctx.app.inject({ method: "GET", url: "/api/auth/sessions", headers: { authorization: `Bearer ${token}` } });
    expect(afterList.statusCode).toBe(401); // the token used to list was itself just revoked
  });

  it("rejects unauthenticated requests", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/sessions" });
    expect(res.statusCode).toBe(401);
  });
});
