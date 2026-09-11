/**
 * Text normalization helpers shared by amount parsing, date parsing and
 * category matching. No I/O, no Node/DOM dependency — only Intl/String.
 */

/** All Unicode combining diacritical marks (NFD range) — tone marks and vowel modifiers alike. */
const ALL_COMBINING_MARKS_RE = /[̀-ͯ]/g;

/** Combining marks (NFD) used for Vietnamese tone marks (dấu thanh): grave, acute, tilde, hook above, dot below. */
const TONE_MARKS = new Set([
  "̀", // grave (huyền)
  "́", // acute (sắc)
  "̃", // tilde (ngã)
  "̉", // hook above (hỏi)
  "̣", // dot below (nặng)
]);

export function toNFC(input: string): string {
  return input.normalize("NFC");
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Removes ALL Vietnamese diacritics (tone marks and vowel modifiers) and
 * converts đ/Đ to d/D. Used to compare a word typed without any diacritics
 * against a (possibly accented) dictionary keyword.
 */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(ALL_COMBINING_MARKS_RE, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * A signature that identifies a word regardless of WHERE its tone mark is
 * placed within a vowel cluster (so "hoà" and "hòa" compare equal), while
 * still distinguishing real letters like ă/â/ê/ô/ơ/ư from their plain form.
 */
export function diacriticSignature(input: string): string {
  const nfd = input.normalize("NFD");
  let base = "";
  const tones: string[] = [];
  for (const ch of nfd) {
    if (TONE_MARKS.has(ch)) {
      tones.push(ch);
    } else {
      base += ch;
    }
  }
  tones.sort();
  return `${base.normalize("NFC").toLowerCase()}|${tones.join("")}`;
}

/** True when a word consists only of plain ASCII letters/digits (no Vietnamese diacritics at all). */
export function isAsciiWord(word: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(word);
}

/**
 * Compares a word as typed by the user against a dictionary/keyword word.
 * - If the typed word is plain ASCII, comparison is fully diacritic-insensitive.
 * - Otherwise, the typed word must carry the same letters (ă/â/ê/ô/ơ/ư kept)
 *   and the same set of tone marks, but not necessarily on the same vowel.
 */
export function wordMatches(inputWord: string, keywordWord: string): boolean {
  if (isAsciiWord(inputWord)) {
    return stripDiacritics(inputWord).toLowerCase() === stripDiacritics(keywordWord).toLowerCase();
  }
  return diacriticSignature(inputWord) === diacriticSignature(keywordWord);
}

export interface WordToken {
  text: string;
  start: number;
  end: number;
}

/** Splits text into runs of letters/digits, keeping character offsets into the input. */
export function extractWordsWithOffsets(input: string): WordToken[] {
  const result: WordToken[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    result.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return result;
}

export function extractWords(input: string): string[] {
  return extractWordsWithOffsets(input).map((w) => w.text);
}

/** True when a contiguous run of noteWords starting somewhere contains keywordWords in order. */
export function occursAsSubsequence(noteWords: string[], keywordWords: string[]): boolean {
  if (keywordWords.length === 0) return false;
  for (let i = 0; i + keywordWords.length <= noteWords.length; i++) {
    let ok = true;
    for (let j = 0; j < keywordWords.length; j++) {
      const noteWord = noteWords[i + j];
      const kwWord = keywordWords[j];
      if (noteWord === undefined || kwWord === undefined || !wordMatches(noteWord, kwWord)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
