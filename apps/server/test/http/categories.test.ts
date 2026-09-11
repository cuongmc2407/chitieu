import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApi, loginAs, type TestApiContext } from "../httpSetup.js";

interface PublicCategory {
  id: string;
  key: string | null;
  name: string;
  emoji: string;
  type: "expense" | "income";
  isFallback: boolean;
}

let ctx: TestApiContext;
beforeEach(async () => {
  ctx = await createTestApi();
});
afterEach(async () => {
  await ctx.app.close();
});

async function categoriesFor(token: string): Promise<PublicCategory[]> {
  const res = await ctx.app.inject({ method: "GET", url: "/api/categories", headers: { authorization: `Bearer ${token}` } });
  return JSON.parse(res.body) as PublicCategory[];
}

describe("GET/POST/PATCH/DELETE /api/categories", () => {
  it("lists the seeded defaults for a new user", async () => {
    const { token } = loginAs(ctx, 200);
    const cats = await categoriesFor(token);
    expect(cats.length).toBeGreaterThan(10);
    expect(cats.some((c) => c.key === "food")).toBe(true);
  });

  it("creates a custom category", async () => {
    const { token } = loginAs(ctx, 201);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Thú cưng", emoji: "🐶", type: "expense" },
    });
    expect(res.statusCode).toBe(201);
    expect((await categoriesFor(token)).some((c) => c.name === "Thú cưng")).toBe(true);
  });

  it("patches name/emoji/hidden", async () => {
    const { token } = loginAs(ctx, 202);
    const cats = await categoriesFor(token);
    const food = cats.find((c) => c.key === "food")!;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/categories/${food.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hidden: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).hidden).toBe(true);
    expect((await categoriesFor(token)).some((c) => c.key === "food")).toBe(false); // hidden, excluded by default
  });

  it("deleting a category reassigns its transactions to the type's fallback", async () => {
    const { token } = loginAs(ctx, 203);
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "phở 45k", clientId: "cat:1" },
    });
    const food = (await categoriesFor(token)).find((c) => c.key === "food")!;

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/categories/${food.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body).reassignedCount).toBe(1);

    const list = await ctx.app.inject({ method: "GET", url: "/api/transactions", headers: { authorization: `Bearer ${token}` } });
    const tx = JSON.parse(list.body)[0];
    expect(tx.categoryName).toBe("Khác");
  });

  it("refuses to delete a fallback category", async () => {
    const { token } = loginAs(ctx, 204);
    const other = (await categoriesFor(token)).find((c) => c.isFallback && c.type === "expense")!;
    const res = await ctx.app.inject({ method: "DELETE", url: `/api/categories/${other.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(400);
  });

  it("user B can neither see, patch, nor delete user A's category", async () => {
    const { token: aliceToken } = loginAs(ctx, 205);
    const { token: bobToken } = loginAs(ctx, 206);
    const aliceFood = (await categoriesFor(aliceToken)).find((c) => c.key === "food")!;

    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/categories/${aliceFood.id}`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { hidden: true },
    });
    expect(patch.statusCode).toBe(404);

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/categories/${aliceFood.id}`, headers: { authorization: `Bearer ${bobToken}` } });
    expect(del.statusCode).toBe(404);
  });
});
