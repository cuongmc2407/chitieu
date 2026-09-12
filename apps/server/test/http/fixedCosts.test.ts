import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApi, loginAs, type TestApiContext } from "../httpSetup.js";

interface PublicFixedCost {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  categoryName: string | null;
  dayOfMonth: number;
  dueDay: number;
  autoPost: boolean;
  active: boolean;
  postedThisMonth: boolean;
}

let ctx: TestApiContext;
beforeEach(async () => {
  ctx = await createTestApi();
});
afterEach(async () => {
  await ctx.app.close();
});

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

async function housingIdFor(token: string): Promise<string> {
  const res = await ctx.app.inject({ method: "GET", url: "/api/categories", headers: auth(token) });
  const cats = JSON.parse(res.body) as Array<{ id: string; key: string | null }>;
  const housing = cats.find((c) => c.key === "housing");
  if (!housing) throw new Error("missing seeded housing category");
  return housing.id;
}

async function createCost(token: string, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: "POST", url: "/api/fixed-costs", headers: auth(token), payload });
}

async function listCosts(token: string): Promise<PublicFixedCost[]> {
  const res = await ctx.app.inject({ method: "GET", url: "/api/fixed-costs", headers: auth(token) });
  return JSON.parse(res.body) as PublicFixedCost[];
}

describe("/api/fixed-costs", () => {
  it("creates and lists a fixed cost", async () => {
    const { token } = loginAs(ctx, 300);
    const categoryId = await housingIdFor(token);

    const res = await createCost(token, { name: "Tiền nhà", amount: 4_000_000, categoryId, dayOfMonth: 5 });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body) as PublicFixedCost;
    expect(created.amount).toBe(4_000_000);
    expect(created.categoryName).toBe("Nhà cửa");
    expect(created.active).toBe(true);

    const list = await listCosts(token);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Tiền nhà");
  });

  it("patches amount and pauses a cost", async () => {
    const { token } = loginAs(ctx, 301);
    const categoryId = await housingIdFor(token);
    const created = JSON.parse((await createCost(token, { name: "Internet", amount: 250_000, categoryId, dayOfMonth: 10 })).body) as PublicFixedCost;

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/fixed-costs/${created.id}`,
      headers: auth(token),
      payload: { amount: 300_000, active: false },
    });
    expect(res.statusCode).toBe(200);
    const patched = JSON.parse(res.body) as PublicFixedCost;
    expect(patched.amount).toBe(300_000);
    expect(patched.active).toBe(false);
  });

  it("deletes a cost", async () => {
    const { token } = loginAs(ctx, 302);
    const categoryId = await housingIdFor(token);
    const created = JSON.parse((await createCost(token, { name: "Netflix", amount: 260_000, categoryId, dayOfMonth: 12 })).body) as PublicFixedCost;

    const res = await ctx.app.inject({ method: "DELETE", url: `/api/fixed-costs/${created.id}`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(await listCosts(token)).toHaveLength(0);
  });

  it("rejects a duplicate name and an unknown category", async () => {
    const { token } = loginAs(ctx, 303);
    const categoryId = await housingIdFor(token);
    await createCost(token, { name: "Tiền nhà", amount: 4_000_000, categoryId, dayOfMonth: 5 });

    const duplicate = await createCost(token, { name: "Tiền nhà", amount: 1_000_000, categoryId, dayOfMonth: 6 });
    expect(duplicate.statusCode).toBe(409);

    const badCategory = await createCost(token, { name: "Khác hẳn", amount: 1_000_000, categoryId: "khong-ton-tai", dayOfMonth: 6 });
    expect(badCategory.statusCode).toBe(400);
  });

  it("user B can neither see, patch, nor delete user A's fixed cost", async () => {
    const { token: aliceToken } = loginAs(ctx, 304);
    const { token: bobToken } = loginAs(ctx, 305);
    const categoryId = await housingIdFor(aliceToken);
    const alice = JSON.parse((await createCost(aliceToken, { name: "Tiền nhà", amount: 4_000_000, categoryId, dayOfMonth: 5 })).body) as PublicFixedCost;

    expect(await listCosts(bobToken)).toHaveLength(0);

    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/fixed-costs/${alice.id}`,
      headers: auth(bobToken),
      payload: { amount: 1 },
    });
    expect(patch.statusCode).toBe(404);

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/fixed-costs/${alice.id}`, headers: auth(bobToken) });
    expect(del.statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/fixed-costs" });
    expect(res.statusCode).toBe(401);
  });
});
