import { describe, expect, it } from "vitest";
import { categorize, DEFAULT_CATEGORIES } from "../src/index.js";

describe("categorize — dictionary, longest match wins", () => {
  it("'tiền nước' matches Hóa đơn, not Đồ uống", () => {
    const r = categorize("tiền nước", "expense", DEFAULT_CATEGORIES);
    expect(r.categoryId).toBe("bills");
  });

  it("'nước' alone matches Đồ uống", () => {
    const r = categorize("nước", "expense", DEFAULT_CATEGORIES);
    expect(r.categoryId).toBe("drinks");
  });

  it("'nước mắm' matches Mua sắm, not Đồ uống", () => {
    const r = categorize("nước mắm", "expense", DEFAULT_CATEGORIES);
    expect(r.categoryId).toBe("shopping");
  });

  it("'sữa cho bé' does not spuriously match 'be' (Đi lại)", () => {
    const r = categorize("sữa cho bé", "expense", DEFAULT_CATEGORIES);
    expect(r.categoryId).not.toBe("transport");
  });

  it("ascii typing still matches accented keywords", () => {
    expect(categorize("pho bo", "expense", DEFAULT_CATEGORIES).categoryId).toBe("food");
    expect(categorize("xang", "expense", DEFAULT_CATEGORIES).categoryId).toBe("transport");
  });
});

describe("categorize — fallback", () => {
  it("empty note falls back to Khác for expense", () => {
    const r = categorize("", "expense", DEFAULT_CATEGORIES);
    expect(r).toMatchObject({ categoryId: "other", type: "expense", matchedBy: "fallback" });
  });

  it("empty note falls back to Thu khác for income", () => {
    const r = categorize("", "income", DEFAULT_CATEGORIES);
    expect(r).toMatchObject({ categoryId: "other_income", type: "income", matchedBy: "fallback" });
  });
});

describe("categorize — keyword overrides win over the dictionary", () => {
  it("a learned override beats a dictionary match, even a shorter one", () => {
    // "bún" would normally hit the food dictionary; teach the bot to file it under Mua sắm instead.
    const r = categorize("bún", "expense", DEFAULT_CATEGORIES, [{ keyword: "bún", categoryId: "shopping" }]);
    expect(r).toMatchObject({ categoryId: "shopping", matchedBy: "override" });
  });

  it("override's own category type is authoritative", () => {
    const r = categorize("tiền lãi ngân hàng", "income", DEFAULT_CATEGORIES, [
      { keyword: "tiền lãi ngân hàng", categoryId: "food" },
    ]);
    expect(r.type).toBe("expense"); // "food" category is type=expense
  });
});
