import { extractWords, occursAsSubsequence } from "./normalize.js";
import type { CategoryDef, KeywordOverride, MatchedBy, TxType } from "./types.js";

export interface CategorizeResult {
  categoryId: string;
  type: TxType;
  matchedBy: MatchedBy;
  matchedKeyword?: string;
}

interface KeywordEntry<T> {
  keyword: string;
  ref: T;
}

interface BestMatch<T> {
  keyword: string;
  ref: T;
  wordCount: number;
  charLength: number;
}

/** Longest keyword phrase (by word count, then character length) that occurs in `note`. */
function findLongestMatch<T>(note: string, entries: KeywordEntry<T>[]): BestMatch<T> | null {
  const noteWords = extractWords(note);
  let best: BestMatch<T> | null = null;
  for (const entry of entries) {
    const kwWords = extractWords(entry.keyword);
    if (kwWords.length === 0) continue;
    if (!occursAsSubsequence(noteWords, kwWords)) continue;
    const charLength = entry.keyword.length;
    if (!best || kwWords.length > best.wordCount || (kwWords.length === best.wordCount && charLength > best.charLength)) {
      best = { keyword: entry.keyword, ref: entry.ref, wordCount: kwWords.length, charLength };
    }
  }
  return best;
}

/**
 * Guesses a category for `note`, in priority order: learned keyword
 * overrides, then the (possibly customized) category dictionary, then a
 * type-appropriate fallback category. The matched category's own `type`
 * is authoritative when an override or keyword matches; `preferredType`
 * (derived from "+" prefix / income keywords) only decides which fallback
 * category to use when nothing matches at all.
 */
export function categorize(
  note: string,
  preferredType: TxType,
  categories: CategoryDef[],
  overrides: KeywordOverride[] = [],
): CategorizeResult {
  const overrideEntries: KeywordEntry<KeywordOverride>[] = overrides.map((o) => ({ keyword: o.keyword, ref: o }));
  const overrideMatch = findLongestMatch(note, overrideEntries);
  if (overrideMatch) {
    const cat = categories.find((c) => c.id === overrideMatch.ref.categoryId);
    if (cat) {
      return { categoryId: cat.id, type: cat.type, matchedBy: "override", matchedKeyword: overrideMatch.keyword };
    }
  }

  const dictEntries: KeywordEntry<CategoryDef>[] = [];
  for (const cat of categories) {
    for (const kw of cat.keywords) dictEntries.push({ keyword: kw, ref: cat });
  }
  const dictMatch = findLongestMatch(note, dictEntries);
  if (dictMatch) {
    return { categoryId: dictMatch.ref.id, type: dictMatch.ref.type, matchedBy: "keyword", matchedKeyword: dictMatch.keyword };
  }

  const fallback = categories.find((c) => c.isFallback && c.type === preferredType) ?? categories.find((c) => c.isFallback);
  return { categoryId: fallback?.id ?? "other", type: preferredType, matchedBy: "fallback" };
}
