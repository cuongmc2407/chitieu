import { describe, expect, it } from "vitest";
import { dayRange, monthRange, previousPeriod, weekRange, yearRange, type YMD } from "../src/index.js";
import { TZ } from "./helpers.js";

const MON_SEP_15: YMD = { year: 2025, month: 9, day: 15 };

describe("weekRange", () => {
  it("Monday-start week for a Monday starts on that same day", () => {
    const r = weekRange(MON_SEP_15, TZ);
    expect(r.start.toISOString()).toBe("2025-09-14T17:00:00.000Z"); // Mon 15/09 00:00 +07
    expect(r.end.toISOString()).toBe("2025-09-21T17:00:00.000Z"); // Mon 22/09 00:00 +07 (exclusive)
  });

  it("a mid-week date resolves to the same Monday-start week", () => {
    const wed: YMD = { year: 2025, month: 9, day: 17 };
    const r = weekRange(wed, TZ);
    expect(r.start.toISOString()).toBe("2025-09-14T17:00:00.000Z");
  });

  it("Sunday belongs to the week that started the preceding Monday", () => {
    const sun: YMD = { year: 2025, month: 9, day: 21 };
    const r = weekRange(sun, TZ);
    expect(r.start.toISOString()).toBe("2025-09-14T17:00:00.000Z");
  });
});

describe("dayRange / monthRange / yearRange", () => {
  it("dayRange spans exactly 24h in the zone", () => {
    const r = dayRange(MON_SEP_15, TZ);
    expect(r.start.toISOString()).toBe("2025-09-14T17:00:00.000Z");
    expect(r.end.toISOString()).toBe("2025-09-15T17:00:00.000Z");
  });

  it("monthRange covers the whole calendar month", () => {
    const r = monthRange(MON_SEP_15, TZ);
    expect(r.start.toISOString()).toBe("2025-08-31T17:00:00.000Z"); // Sep 1 00:00 +07
    expect(r.end.toISOString()).toBe("2025-09-30T17:00:00.000Z"); // Oct 1 00:00 +07
  });

  it("yearRange covers the whole calendar year", () => {
    const r = yearRange(MON_SEP_15, TZ);
    expect(r.start.toISOString()).toBe("2024-12-31T17:00:00.000Z");
    expect(r.end.toISOString()).toBe("2025-12-31T17:00:00.000Z");
  });
});

describe("previousPeriod", () => {
  it("previous week is 7 days earlier", () => {
    const week = weekRange(MON_SEP_15, TZ); // Mon 15/09 - Mon 22/09
    const prev = previousPeriod(week, "week", TZ); // Mon 08/09 - Mon 15/09
    expect(prev.start.toISOString()).toBe("2025-09-07T17:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2025-09-14T17:00:00.000Z");
  });

  it("previous month handles year rollover", () => {
    const jan: YMD = { year: 2025, month: 1, day: 15 };
    const month = monthRange(jan, TZ);
    const prev = previousPeriod(month, "month", TZ);
    expect(prev.start.toISOString()).toBe("2024-11-30T17:00:00.000Z"); // Dec 1 2024 00:00 +07
    expect(prev.end.toISOString()).toBe("2024-12-31T17:00:00.000Z");
  });

  it("previous year", () => {
    const year = yearRange(MON_SEP_15, TZ);
    const prev = previousPeriod(year, "year", TZ);
    expect(prev.start.toISOString()).toBe("2023-12-31T17:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2024-12-31T17:00:00.000Z");
  });
});
