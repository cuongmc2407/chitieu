import { getZonedParts } from "../src/index.js";

/** Monday 2025-09-15, 09:00 +07:00 — matches the week-report example (08/09–14/09/2025). */
export const NOW = new Date("2025-09-15T02:00:00.000Z");

export const TZ = "Asia/Ho_Chi_Minh";

/** "yyyy-mm-dd" of `date`, read in Asia/Ho_Chi_Minh, for asserting occurredAt. */
export function ymd(date: Date): string {
  const p = getZonedParts(date, TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
