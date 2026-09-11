import { extractWords, stripDiacritics } from "./normalize.js";

const MAX_OVERRIDE_KEY_LENGTH = 60;

/**
 * Normalizes a transaction note into the key used to store/look up a
 * `keyword_overrides` row: diacritics stripped, lowercase, standalone
 * numbers dropped, capped length. Returns null when there's nothing
 * meaningful to learn from (empty note).
 */
export function overrideKey(note: string): string | null {
  const words = extractWords(note).filter((w) => !/^\d+$/.test(w));
  if (words.length === 0) return null;
  const key = stripDiacritics(words.join(" ")).toLowerCase();
  return key.length > MAX_OVERRIDE_KEY_LENGTH ? key.slice(0, MAX_OVERRIDE_KEY_LENGTH).trim() : key;
}
