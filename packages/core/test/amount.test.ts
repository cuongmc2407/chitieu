import { describe, expect, it } from "vitest";
import { pickAmount } from "../src/index.js";

function amountOf(text: string, threshold = 1000): number | null {
  const r = pickAmount(text, threshold);
  return r.ok ? r.value : null;
}

describe("pickAmount — units", () => {
  it.each([
    ["45k", 45_000],
    ["45 k", 45_000],
    ["2 triệu", 2_000_000],
    ["2 trieu", 2_000_000],
    ["80k", 80_000],
    ["25k", 25_000],
    ["45ng", 45_000],
    ["45.000đ", 45_000],
    ["45000₫", 45_000],
    ["10000vnd", 10_000],
  ])("%s -> %d", (text, expected) => {
    expect(amountOf(text)).toBe(expected);
  });
});

describe("pickAmount — compact combined forms", () => {
  it.each([
    ["1tr2", 1_200_000],
    ["3tr5", 3_500_000],
    ["2k5", 2500],
    ["1tr250", 1_250_000],
  ])("%s -> %d", (text, expected) => {
    expect(amountOf(text)).toBe(expected);
  });
});

describe("pickAmount — decimals with unit", () => {
  it.each([
    ["1.5tr", 1_500_000],
    ["1,5tr", 1_500_000],
    ["1,2tr", 1_200_000],
    ["1,25tr", 1_250_000],
  ])("%s -> %d", (text, expected) => {
    expect(amountOf(text)).toBe(expected);
  });
});

describe("pickAmount — grouped thousand separators", () => {
  it.each([
    ["150.000", 150_000],
    ["150,000", 150_000],
    ["150000", 150_000],
    ["32.000", 32_000],
    ["1,500,000", 1_500_000],
  ])("%s -> %d", (text, expected) => {
    expect(amountOf(text)).toBe(expected);
  });
});

describe("pickAmount — bare number threshold", () => {
  it("below threshold is multiplied by 1000", () => {
    expect(amountOf("20")).toBe(20_000);
  });
  it("at/above threshold is kept as-is", () => {
    expect(amountOf("1000")).toBe(1000);
    expect(amountOf("150000")).toBe(150_000);
  });
  it("threshold is configurable", () => {
    expect(amountOf("500", 100)).toBe(500);
    expect(amountOf("50", 100)).toBe(50_000);
  });
});

describe("pickAmount — multiple numbers in one item", () => {
  it("prefers the number with a currency unit", () => {
    const r = pickAmount("xăng 95 60k", 1000);
    expect(r.ok && r.value).toBe(60_000);
  });
  it("falls back to the last number when none has a unit", () => {
    expect(amountOf("mua 3 cái 25")).toBe(25_000);
  });
  it("'2 ng' (người) without a unit suffix is NOT parsed as 2.000", () => {
    // "ng" only counts as a unit when written with no space (compact form).
    const r = pickAmount("cơm 2 ng 50k", 1000);
    expect(r.ok && r.value).toBe(50_000);
  });
});

describe("pickAmount — errors", () => {
  it("no digits at all -> NO_AMOUNT", () => {
    const r = pickAmount("phở", 1000);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("NO_AMOUNT");
  });
  it("above the safety cap -> AMOUNT_TOO_LARGE", () => {
    const r = pickAmount("2000000000000", 1000); // 2,000 tỷ > cap (1,000 tỷ)
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("AMOUNT_TOO_LARGE");
  });
});
