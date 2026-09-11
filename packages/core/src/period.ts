/**
 * Reporting period boundaries (day/week/month/year), computed in a given
 * IANA timezone and returned as UTC instants — [start, end) half-open.
 * Weeks start on Monday.
 */
import { addDays, getZonedParts, weekdayOf, zonedToUtc, type YMD } from "./date.js";

export interface Period {
  start: Date;
  end: Date;
}

export type PeriodKind = "day" | "week" | "month" | "year";

function startOfDayUtc(ymd: YMD, timeZone: string): Date {
  return zonedToUtc({ ...ymd, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function dayRange(ymd: YMD, timeZone: string): Period {
  return { start: startOfDayUtc(ymd, timeZone), end: startOfDayUtc(addDays(ymd, 1), timeZone) };
}

/** Monday-start week containing `ymd`. */
export function weekRange(ymd: YMD, timeZone: string): Period {
  const weekday = weekdayOf(ymd); // 0=Sun..6=Sat
  const mondayOffset = weekday === 0 ? -6 : -(weekday - 1);
  const monday = addDays(ymd, mondayOffset);
  return { start: startOfDayUtc(monday, timeZone), end: startOfDayUtc(addDays(monday, 7), timeZone) };
}

export function monthRange(ymd: YMD, timeZone: string): Period {
  const start: YMD = { year: ymd.year, month: ymd.month, day: 1 };
  const next: YMD = ymd.month === 12 ? { year: ymd.year + 1, month: 1, day: 1 } : { year: ymd.year, month: ymd.month + 1, day: 1 };
  return { start: startOfDayUtc(start, timeZone), end: startOfDayUtc(next, timeZone) };
}

export function yearRange(ymd: YMD, timeZone: string): Period {
  const start: YMD = { year: ymd.year, month: 1, day: 1 };
  const next: YMD = { year: ymd.year + 1, month: 1, day: 1 };
  return { start: startOfDayUtc(start, timeZone), end: startOfDayUtc(next, timeZone) };
}

export function rangeFor(kind: PeriodKind, ymd: YMD, timeZone: string): Period {
  switch (kind) {
    case "day":
      return dayRange(ymd, timeZone);
    case "week":
      return weekRange(ymd, timeZone);
    case "month":
      return monthRange(ymd, timeZone);
    case "year":
      return yearRange(ymd, timeZone);
  }
}

/** The immediately preceding period of the same kind and length as `period`. */
export function previousPeriod(period: Period, kind: PeriodKind, timeZone: string): Period {
  const startYmd = getZonedParts(period.start, timeZone);
  switch (kind) {
    case "day":
      return dayRange(addDays(startYmd, -1), timeZone);
    case "week":
      return weekRange(addDays(startYmd, -7), timeZone);
    case "month": {
      const prev: YMD =
        startYmd.month === 1
          ? { year: startYmd.year - 1, month: 12, day: 1 }
          : { year: startYmd.year, month: startYmd.month - 1, day: 1 };
      return monthRange(prev, timeZone);
    }
    case "year":
      return yearRange({ year: startYmd.year - 1, month: 1, day: 1 }, timeZone);
  }
}
