import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApi, loginAs, type TestApiContext } from "../httpSetup.js";

let ctx: TestApiContext;
beforeEach(async () => {
  ctx = await createTestApi();
});
afterEach(async () => {
  await ctx.app.close();
});

describe("GET /api/health and /api/public-config", () => {
  it("health is public and ok", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("public-config is public (no auth needed)", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/public-config" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty("botUsername");
  });
});

describe("GET /api/stats", () => {
  it("reflects created transactions and stays isolated per user", async () => {
    const { token: aliceToken } = loginAs(ctx, 300);
    const { token: bobToken } = loginAs(ctx, 301);
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "phở 45k", clientId: "stat:1" },
    });

    const alice = await ctx.app.inject({ method: "GET", url: "/api/stats?period=month", headers: { authorization: `Bearer ${aliceToken}` } });
    expect(JSON.parse(alice.body).totalExpense).toBe(45_000);

    const bob = await ctx.app.inject({ method: "GET", url: "/api/stats?period=month", headers: { authorization: `Bearer ${bobToken}` } });
    expect(JSON.parse(bob.body).totalExpense).toBe(0);
  });

  it("rejects an invalid period", async () => {
    const { token } = loginAs(ctx, 302);
    const res = await ctx.app.inject({ method: "GET", url: "/api/stats?period=decade", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/export.csv", () => {
  it("returns a UTF-8 CSV containing the user's own transactions only", async () => {
    const { token: aliceToken } = loginAs(ctx, 303);
    const { token: bobToken } = loginAs(ctx, 304);
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "phở 45k", clientId: "csv:1" },
    });

    const res = await ctx.app.inject({ method: "GET", url: "/api/export.csv", headers: { authorization: `Bearer ${aliceToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("45000");
    expect(res.body).toContain("phở");

    const bobCsv = await ctx.app.inject({ method: "GET", url: "/api/export.csv", headers: { authorization: `Bearer ${bobToken}` } });
    expect(bobCsv.body).not.toContain("phở");
  });
});

describe("keyword overrides isolation", () => {
  it("user B cannot delete user A's learned keyword", async () => {
    const { token: aliceToken } = loginAs(ctx, 305);
    const { token: bobToken } = loginAs(ctx, 306);
    const cats = await ctx.app.inject({ method: "GET", url: "/api/categories", headers: { authorization: `Bearer ${aliceToken}` } });
    const shopping = (JSON.parse(cats.body) as Array<{ id: string; key: string }>).find((c) => c.key === "shopping")!;
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { amount: 10_000, type: "expense", categoryId: shopping.id, note: "abc", clientId: "kw:1", learn: true },
    });

    const list = await ctx.app.inject({ method: "GET", url: "/api/keyword-overrides", headers: { authorization: `Bearer ${aliceToken}` } });
    const overrideId = JSON.parse(list.body)[0].id;

    const bobDelete = await ctx.app.inject({
      method: "DELETE",
      url: `/api/keyword-overrides/${overrideId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobDelete.statusCode).toBe(404);

    const bobList = await ctx.app.inject({ method: "GET", url: "/api/keyword-overrides", headers: { authorization: `Bearer ${bobToken}` } });
    expect(JSON.parse(bobList.body)).toHaveLength(0);
  });
});

describe("CSRF protection on cookie-authenticated mutations", () => {
  it("rejects a cross-origin cookie POST, accepts a same-origin one, and never checks Bearer requests", async () => {
    const csrfCtx = await createTestApi({ publicUrl: "https://chitieu.example.com" });
    const { token } = loginAs(csrfCtx, 400, "web");

    const crossOrigin = await csrfCtx.app.inject({
      method: "POST",
      url: "/api/transactions",
      cookies: { ct_session: token },
      headers: { origin: "https://evil.example.com" },
      payload: { text: "phở 45k", clientId: "csrf:1" },
    });
    expect(crossOrigin.statusCode).toBe(403);

    const sameOrigin = await csrfCtx.app.inject({
      method: "POST",
      url: "/api/transactions",
      cookies: { ct_session: token },
      headers: { origin: "https://chitieu.example.com" },
      payload: { text: "phở 45k", clientId: "csrf:2" },
    });
    expect(sameOrigin.statusCode).toBe(201);

    const bearerCrossOrigin = await csrfCtx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}`, origin: "https://evil.example.com" },
      payload: { text: "phở 45k", clientId: "csrf:3" },
    });
    expect(bearerCrossOrigin.statusCode).toBe(201);

    await csrfCtx.app.close();
  });
});
