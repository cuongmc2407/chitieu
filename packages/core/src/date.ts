/**
 * Timezone-aware calendar helpers built only on Intl.DateTimeFormat — no
 * external tz database dependency. Vietnam (Asia/Ho_Chi_Minh) has a fixed
 * UTC+7 offset with no DST, but these helpers work for any IANA zone.
 */

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface ZonedParts extends YMD {
  hour: number;
  minute: number;
  second: number;
}

export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Returns the wall-clock date/time that a UTC instant corresponds to in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: map.hour === "24" ? 0 : Number(map.hour ?? "0"),
    minute: Number(map.minute ?? "0"),
    second: Number(map.second ?? "0"),
  };
}

/** Converts a wall-clock date/time in `timeZone` back to the corresponding UTC instant. */
export function zonedToUtc(parts: ZonedParts, timeZone: string): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const actual = getZonedParts(new Date(guess), timeZone);
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  const diff = guess - actualAsUtc;
  return new Date(guess + diff);
}

/** Adds (or subtracts) whole calendar days to a Y-M-D, handling month/year rollover. */
export function addDays(ymd: YMD, delta: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(ymd: YMD): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

/** True when a==b (same calendar date). */
export function sameYMD(a: YMD, b: YMD): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** True when a is strictly after b (calendar comparison). */
export function isAfterYMD(a: YMD, b: YMD): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month !== b.month) return a.month > b.month;
  return a.day > b.day;
}

/** Validates that year/month/day form a real calendar date (rejects e.g. 31/2). */
export function isValidYMD(ymd: YMD): boolean {
  if (ymd.month < 1 || ymd.month > 12) return false;
  if (ymd.day < 1 || ymd.day > 31) return false;
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  return d.getUTCFullYear() === ymd.year && d.getUTCMonth() === ymd.month - 1 && d.getUTCDate() === ymd.day;
}
