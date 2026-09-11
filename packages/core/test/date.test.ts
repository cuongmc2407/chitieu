import { describe, expect, it } from "vitest";
import { addDays, extractDateToken, getZonedParts, isValidYMD, weekdayOf, zonedToUtc, type YMD } from "../src/index.js";
import { NOW, TZ } from "./helpers.js";

const TODAY: YMD = { year: 2025, month: 9, day: 15 }; // Monday

describe("zonedToUtc / getZonedParts round-trip", () => {
  it("09:00 +07:00 on 2025-09-15 is 02:00 UTC", () => {
    const utc = zonedToUtc({ year: 2025, month: 9, day: 15, hour: 9, minute: 0, second: 0 }, TZ);
    expect(utc.toISOString()).toBe("2025-09-15T02:00:00.000Z");
  });

  it("round-trips through getZonedParts", () => {
    const parts = getZonedParts(NOW, TZ);
    expect(parts).toEqual({ year: 2025, month: 9, day: 15, hour: 9, minute: 0, second: 0 });
  });
});

describe("addDays / weekdayOf", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDays({ year: 2025, month: 9, day: 30 }, 1)).toEqual({ year: 2025, month: 10, day: 1 });
    expect(addDays({ year: 2025, month: 9, day: 1 }, -1)).toEqual({ year: 2025, month: 8, day: 31 });
  });

  it("2025-09-15 is a Monday", () => {
    expect(weekdayOf(TODAY)).toBe(1);
  });
});

describe("isValidYMD", () => {
  it("accepts real dates", () => {
    expect(isValidYMD({ year: 2025, month: 9, day: 12 })).toBe(true);
  });
  it("rejects 31/2 and other impossible dates", () => {
    expect(isValidYMD({ year: 2025, month: 2, day: 31 })).toBe(false);
    expect(isValidYMD({ year: 2025, month: 13, day: 1 })).toBe(false);
  });
});

describe("extractDateToken — relative prefixes", () => {
  it("hôm qua / hqua -> yesterday", () => {
    expect(extractDateToken("hôm qua lẩu 350k", TODAY)).toMatchObject({
      matched: true,
      ymd: { year: 2025, month: 9, day: 14 },
      remaining: "lẩu 350k",
    });
    expect(extractDateToken("hqua lẩu 350k", TODAY)).toMatchObject({
      matched: true,
      ymd: { year: 2025, month: 9, day: 14 },
    });
  });

  it("hôm kia -> 2 days ago", () => {
    expect(extractDateToken("hôm kia ăn phở 40k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 13 },
      remaining: "ăn phở 40k",
    });
  });
});

describe("extractDateToken — weekday names", () => {
  it("thứ 7 resolves to the most recent past Saturday", () => {
    expect(extractDateToken("thứ 7 đi chơi 200k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 13 },
    });
  });

  it("CN resolves to the most recent past Sunday", () => {
    expect(extractDateToken("CN ăn lẩu 300k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 14 },
    });
  });

  it("a weekday equal to today resolves to today", () => {
    expect(extractDateToken("thứ 2 cf 20k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 15 },
    });
  });
});

describe("extractDateToken — explicit dd/mm", () => {
  it("parses dd/mm at the start of the text", () => {
    expect(extractDateToken("12/9 xăng 70k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 12 },
      remaining: "xăng 70k",
    });
  });

  it("also parses dd/mm at the end of the text", () => {
    expect(extractDateToken("xăng 70k 12/9", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 12 },
      remaining: "xăng 70k",
    });
  });

  it("dd/mm in the future rolls back one year", () => {
    // 20/9 (this year) is after today (15/9) -> should resolve to 2024.
    expect(extractDateToken("20/9 xăng 70k", TODAY)).toMatchObject({
      ymd: { year: 2024, month: 9, day: 20 },
    });
  });

  it("dd/mm/yyyy keeps the explicit year even if in the future", () => {
    expect(extractDateToken("20/9/2025 xăng 70k", TODAY)).toMatchObject({
      ymd: { year: 2025, month: 9, day: 20 },
    });
  });

  it("an impossible date is reported invalid", () => {
    expect(extractDateToken("31/2 gì đó 20k", TODAY)).toMatchObject({ matched: true, invalid: true });
  });
});

describe("extractDateToken — no date present", () => {
  it("leaves text untouched", () => {
    expect(extractDateToken("phở 45k", TODAY)).toMatchObject({ matched: false, remaining: "phở 45k" });
  });

  it("a bare weekday-like word in the middle is not mistaken for a date", () => {
    // "t2" only counts as a date token when it IS the first/last word.
    expect(extractDateToken("mua vé t2 người 100k", TODAY)).toMatchObject({ matched: false });
  });
});
