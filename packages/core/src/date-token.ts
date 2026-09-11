/**
 * Recognizes a date prefix/suffix inside one transaction item's raw text:
 * "hôm qua"/"hqua", "hôm kia", "dd/mm[/yyyy]", "thứ 2".."CN". Only matches
 * at the very start or the very end of the (trimmed) text, so numbers in
 * the middle of a note are never mistaken for dates.
 */
import { addDays, isAfterYMD, isValidYMD, weekdayOf, type YMD } from "./date.js";
import { collapseWhitespace, extractWordsWithOffsets, stripDiacritics } from "./normalize.js";

const RELATIVE_SINGLE = new Map<string, number>([
  ["hqua", -1],
  ["homqua", -1],
  ["homkia", -2],
]);
const RELATIVE_DOUBLE = new Map<string, number>([
  ["hom qua", -1],
  ["hom kia", -2],
]);
/** 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay(). */
const WEEKDAY_SINGLE = new Map<string, number>([
  ["cn", 0],
  ["chunhat", 0],
  ["t2", 1],
  ["t3", 2],
  ["t4", 3],
  ["t5", 4],
  ["t6", 5],
  ["t7", 6],
  ["thu2", 1],
  ["thu3", 2],
  ["thu4", 3],
  ["thu5", 4],
  ["thu6", 5],
  ["thu7", 6],
]);
const WEEKDAY_DOUBLE = new Map<string, number>([
  ["chu nhat", 0],
  ["thu 2", 1],
  ["thu 3", 2],
  ["thu 4", 3],
  ["thu 5", 4],
  ["thu 6", 5],
  ["thu 7", 6],
]);

interface WordTokenMatch {
  consumed: 1 | 2;
  offsetDays?: number;
  weekday?: number;
}

function matchWordToken(w0raw: string, w1raw: string | undefined): WordTokenMatch | null {
  const w0 = stripDiacritics(w0raw).toLowerCase();
  if (w1raw !== undefined) {
    const w1 = stripDiacritics(w1raw).toLowerCase();
    const two = `${w0} ${w1}`;
    const relTwo = RELATIVE_DOUBLE.get(two);
    if (relTwo !== undefined) return { consumed: 2, offsetDays: relTwo };
    const wdTwo = WEEKDAY_DOUBLE.get(two);
    if (wdTwo !== undefined) return { consumed: 2, weekday: wdTwo };
  }
  const relOne = RELATIVE_SINGLE.get(w0);
  if (relOne !== undefined) return { consumed: 1, offsetDays: relOne };
  const wdOne = WEEKDAY_SINGLE.get(w0);
  if (wdOne !== undefined) return { consumed: 1, weekday: wdOne };
  return null;
}

function resolveRelative(tok: WordTokenMatch, today: YMD): YMD {
  if (tok.offsetDays !== undefined) return addDays(today, tok.offsetDays);
  if (tok.weekday !== undefined) {
    const todayWeekday = weekdayOf(today);
    let diff = todayWeekday - tok.weekday;
    if (diff < 0) diff += 7;
    return addDays(today, -diff);
  }
  return today;
}

const SLASH_DATE_START_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const SLASH_DATE_END_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

function resolveExplicitDate(match: RegExpExecArray, today: YMD): YMD | null {
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearGroup = match[3];
  const yearExplicit = yearGroup !== undefined;
  const year = yearExplicit ? (yearGroup.length <= 2 ? 2000 + Number(yearGroup) : Number(yearGroup)) : today.year;

  let ymd: YMD = { year, month, day };
  if (!isValidYMD(ymd)) return null;

  if (!yearExplicit && isAfterYMD(ymd, today)) {
    const prevYear: YMD = { year: year - 1, month, day };
    if (isValidYMD(prevYear)) ymd = prevYear;
  }
  return ymd;
}

export interface DateTokenResult {
  /** True when a date-shaped token was found (even if it turned out invalid). */
  matched: boolean;
  /** True when a date token was found but doesn't form a real calendar date (e.g. 31/2). */
  invalid?: boolean;
  ymd: YMD;
  /** Text with the date token (and surrounding whitespace) removed. */
  remaining: string;
}

export function extractDateToken(rawText: string, today: YMD): DateTokenResult {
  const text = rawText.trim();
  if (text === "") return { matched: false, ymd: today, remaining: text };

  const slashStart = SLASH_DATE_START_RE.exec(text);
  if (slashStart) {
    const resolved = resolveExplicitDate(slashStart, today);
    const remaining = collapseWhitespace(text.slice(slashStart[0].length));
    return resolved
      ? { matched: true, ymd: resolved, remaining }
      : { matched: true, invalid: true, ymd: today, remaining };
  }

  const words = extractWordsWithOffsets(text);
  const w0 = words[0];
  if (w0 && w0.start === 0) {
    const w1 = words[1];
    const tok = matchWordToken(w0.text, w1?.text);
    if (tok) {
      const consumedEnd = tok.consumed === 2 && w1 ? w1.end : w0.end;
      return { matched: true, ymd: resolveRelative(tok, today), remaining: collapseWhitespace(text.slice(consumedEnd)) };
    }
  }

  const slashEnd = SLASH_DATE_END_RE.exec(text);
  if (slashEnd && slashEnd.index !== undefined) {
    const resolved = resolveExplicitDate(slashEnd, today);
    const remaining = collapseWhitespace(text.slice(0, slashEnd.index));
    return resolved
      ? { matched: true, ymd: resolved, remaining }
      : { matched: true, invalid: true, ymd: today, remaining };
  }

  const last = words[words.length - 1];
  if (last && last.end === text.length) {
    const secondLast = words[words.length - 2];
    if (secondLast) {
      const tok2 = matchWordToken(secondLast.text, last.text);
      if (tok2 && tok2.consumed === 2) {
        return {
          matched: true,
          ymd: resolveRelative(tok2, today),
          remaining: collapseWhitespace(text.slice(0, secondLast.start)),
        };
      }
    }
    const tok1 = matchWordToken(last.text, undefined);
    if (tok1) {
      return { matched: true, ymd: resolveRelative(tok1, today), remaining: collapseWhitespace(text.slice(0, last.start)) };
    }
  }

  return { matched: false, ymd: today, remaining: text };
}
