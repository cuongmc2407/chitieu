import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApi, loginAs, type TestApiContext } from "../httpSetup.js";

let ctx: TestApiContext;
beforeEach(async () => {
  ctx = await createTestApi();
});
afterEach(async () => {
  await ctx.app.close();
});

describe("POST /api/transactions — free text", () => {
  it("parses and creates, returning category info", async () => {
    const { token } = loginAs(ctx, 100);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "phở 45k", clientId: "web:1" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.items[0].amount).toBe(45_000);
    expect(body.items[0].categoryName).toBe("Ăn uống");
  });

  it("is idempotent on clientId", async () => {
    const { token } = loginAs(ctx, 101);
    const payload = { text: "xăng 80k", clientId: "dup:1" };
    const first = await ctx.app.inject({ method: "POST", url: "/api/transactions", headers: { authorization: `Bearer ${token}` }, payload });
    const second = await ctx.app.inject({ method: "POST", url: "/api/transactions", headers: { authorization: `Bearer ${token}` }, payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(first.body).items[0].id).toBe(JSON.parse(second.body).items[0].id);

    const list = await ctx.app.inject({ method: "GET", url: "/api/transactions", headers: { authorization: `Bearer ${token}` } });
    expect(JSON.parse(list.body)).toHaveLength(1);
  });

  it("returns 422 with parse errors when there's no amount", async () => {
    const { token } = loginAs(ctx, 102);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "phở", clientId: "bad:1" },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("POST /api/transactions — structured", () => {
  it("creates from explicit fields and can learn a keyword override", async () => {
    const { token } = loginAs(ctx, 103);
    const cats = await ctx.app.inject({ method: "GET", url: "/api/categories", headers: { authorization: `Bearer ${token}` } });
    const shopping = (JSON.parse(cats.body) as Array<{ id: string; key: string }>).find((c) => c.key === "shopping")!;

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 30_000, type: "expense", categoryId: shopping.id, note: "bún", clientId: "s:1", learn: true },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).categoryId).toBe(shopping.id);

    const overrides = await ctx.app.inject({ method: "GET", url: "/api/keyword-overrides", headers: { authorization: `Bearer ${token}` } });
    expect(JSON.parse(overrides.body)).toHaveLength(1);
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("updates amount/category/note, deriving type from the new category", async () => {
    const { token } = loginAs(ctx, 104);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "cf 20k", clientId: "p:1" },
    });
    const id = JSON.parse(created.body).items[0].id as string;

    const cats = await ctx.app.inject({ method: "GET", url: "/api/categories", headers: { authorization: `Bearer ${token}` } });
    const salary = (JSON.parse(cats.body) as Array<{ id: string; key: string }>).find((c) => c.key === "salary")!;

    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/api/transactions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { categoryId: salary.id, amount: 5_000_000 },
    });
    expect(patched.statusCode).toBe(200);
    const body = JSON.parse(patched.body);
    expect(body.type).toBe("income");
    expect(body.amount).toBe(5_000_000);
  });

  it("404s for an unknown or someone else's transaction id", async () => {
    const { token: aliceToken } = loginAs(ctx, 105);
    const { token: bobToken } = loginAs(ctx, 106);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "cf 20k", clientId: "iso:1" },
    });
    const id = JSON.parse(created.body).items[0].id as string;

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/transactions/${id}`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { amount: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/transactions/:id", () => {
  it("soft-deletes; user B cannot delete user A's transaction", async () => {
    const { token: aliceToken } = loginAs(ctx, 107);
    const { token: bobToken } = loginAs(ctx, 108);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "cf 20k", clientId: "del:1" },
    });
    const id = JSON.parse(created.body).items[0].id as string;

    const bobDelete = await ctx.app.inject({ method: "DELETE", url: `/api/transactions/${id}`, headers: { authorization: `Bearer ${bobToken}` } });
    expect(bobDelete.statusCode).toBe(404);

    const stillThere = await ctx.app.inject({ method: "GET", url: "/api/transactions", headers: { authorization: `Bearer ${aliceToken}` } });
    expect(JSON.parse(stillThere.body)).toHaveLength(1);

    const aliceDelete = await ctx.app.inject({ method: "DELETE", url: `/api/transactions/${id}`, headers: { authorization: `Bearer ${aliceToken}` } });
    expect(aliceDelete.statusCode).toBe(200);

    const gone = await ctx.app.inject({ method: "GET", url: "/api/transactions", headers: { authorization: `Bearer ${aliceToken}` } });
    expect(JSON.parse(gone.body)).toHaveLength(0);
  });
});

describe("GET /api/transactions — filters and isolation", () => {
  it("filters by type/category/q and never returns another user's rows", async () => {
    const { token: aliceToken } = loginAs(ctx, 109);
    const { token: bobToken } = loginAs(ctx, 110);
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "phở đặc biệt 45k", clientId: "f:1" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { text: "+lương 15tr", clientId: "f:2" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { text: "xăng 80k", clientId: "f:1" }, // same clientId, different user — must not collide
    });

    const incomeOnly = await ctx.app.inject({
      method: "GET",
      url: "/api/transactions?type=income",
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(JSON.parse(incomeOnly.body)).toHaveLength(1);

    const search = await ctx.app.inject({
      method: "GET",
      url: `/api/transactions?q=${encodeURIComponent("đặc biệt")}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(JSON.parse(search.body)).toHaveLength(1);

    const bobList = await ctx.app.inject({ method: "GET", url: "/api/transactions", headers: { authorization: `Bearer ${bobToken}` } });
    expect(JSON.parse(bobList.body)).toHaveLength(1);
  });
});
