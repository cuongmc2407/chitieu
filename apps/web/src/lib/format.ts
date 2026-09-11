import { getZonedParts } from "@chitieu/core";

export { formatCompact, formatVnd, parseAmount } from "@chitieu/core";

export const TIME_ZONE = "Asia/Ho_Chi_Minh";

const WEEKDAY_SHORT = ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"];

export function formatShortDate(iso: string): string {
  const p = getZonedParts(new Date(iso), TIME_ZONE);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`;
}

export function formatDayHeading(iso: string): string {
  const now = new Date();
  const today = getZonedParts(now, TIME_ZONE);
  const p = getZonedParts(new Date(iso), TIME_ZONE);
  if (p.year === today.year && p.month === today.month && p.day === today.day) return "Hôm nay";

  const yesterday = getZonedParts(new Date(now.getTime() - 86_400_000), TIME_ZONE);
  if (p.year === yesterday.year && p.month === yesterday.month && p.day === yesterday.day) return "Hôm qua";

  const d = new Date(iso);
  const weekday = getZonedParts(d, TIME_ZONE);
  const weekdayIndex = new Date(Date.UTC(weekday.year, weekday.month - 1, weekday.day)).getUTCDay();
  return `${WEEKDAY_SHORT[weekdayIndex]}, ${formatShortDate(iso)}`;
}

export function dateKey(iso: string): string {
  const p = getZonedParts(new Date(iso), TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
