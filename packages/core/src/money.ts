export { parseAmount } from "./amount.js";

/** "45000" -> "45.000 ₫" */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped} ₫`;
}

/** "3200000" -> "3,2tr"; "180000" -> "180k"; "500" -> "500" */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${trimDecimal(abs / 1_000_000)}tr`;
  if (abs >= 1000) return `${sign}${trimDecimal(abs / 1000)}k`;
  return `${sign}${abs}`;
}

function trimDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return str.replace(".", ",");
}
