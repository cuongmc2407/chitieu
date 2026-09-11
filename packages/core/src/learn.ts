import { extractWords } from "./normalize.js";

const MAX_OVERRIDE_KEY_LENGTH = 60;

/**
 * Normalizes a transaction note into the key used to store/look up a
 * `keyword_overrides` row: lowercase, standalone numbers dropped, extra
 * whitespace collapsed, capped length. Returns null when there's nothing
 * meaningful to learn from (empty note).
 *
 * Diacritics are deliberately KEPT (only case is folded): `wordMatches`
 * (see normalize.ts) already treats an ascii-typed word as matching its
 * accented form, but not the other way around — an accented word only
 * matches another accented word with the same letters. If we stripped
 * diacritics here, a keyword learned from an accented note (e.g. "bún")
 * would be stored as "bun" and could then never match the user typing
 * "bún" again later.
 */
export function overrideKey(note: string): string | null {
  const words = extractWords(note).filter((w) => !/^\d+$/.test(w));
  if (words.length === 0) return null;
  const key = words.join(" ").toLowerCase();
  return key.length > MAX_OVERRIDE_KEY_LENGTH ? key.slice(0, MAX_OVERRIDE_KEY_LENGTH).trim() : key;
}
