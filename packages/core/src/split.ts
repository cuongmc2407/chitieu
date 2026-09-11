/**
 * Splits a multi-item message into individual item strings. Items are
 * separated by ";", newlines, or ",". A "," directly between two digits
 * (e.g. the "," in "1,5tr" or "150,000") is NOT treated as a separator.
 */
export function splitItems(text: string): string[] {
  const chars = Array.from(text);
  const items: string[] = [];
  let current = "";

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ";" || ch === "\n" || ch === "\r") {
      items.push(current);
      current = "";
      continue;
    }
    if (ch === ",") {
      const prev = chars[i - 1];
      const next = chars[i + 1];
      const isDigitBoundary = prev !== undefined && next !== undefined && /\d/.test(prev) && /\d/.test(next);
      if (!isDigitBoundary) {
        items.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  items.push(current);

  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}
