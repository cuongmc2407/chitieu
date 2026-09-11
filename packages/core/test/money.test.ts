import { describe, expect, it } from "vitest";
import { formatCompact, formatVnd, parseAmount } from "../src/index.js";

describe("formatVnd", () => {
  it.each([
    [45_000, "45.000 ₫"],
    [180_000, "180.000 ₫"],
    [1_245_000, "1.245.000 ₫"],
    [0, "0 ₫"],
    [-5000, "-5.000 ₫"],
  ])("%d -> %s", (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected);
  });
});

describe("formatCompact", () => {
  it.each([
    [3_200_000, "3,2tr"],
    [180_000, "180k"],
    [1_300_000, "1,3tr"],
    [500, "500"],
    [5_000_000, "5tr"],
  ])("%d -> %s", (amount, expected) => {
    expect(formatCompact(amount)).toBe(expected);
  });
});

describe("parseAmount", () => {
  it.each([
    ["3tr", 3_000_000],
    ["5tr", 5_000_000],
    ["500", 500_000],
    ["5000000", 5_000_000],
    ["1.5tr", 1_500_000],
  ])("%s -> %d", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it("returns null when there's no number", () => {
    expect(parseAmount("không có gì")).toBeNull();
  });
});
