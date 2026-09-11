import { pickAmount } from "./amount.js";
import { categorize } from "./categorize.js";
import { INCOME_SIGNAL_KEYWORDS } from "./categories.js";
import { DEFAULT_TIME_ZONE, getZonedParts, zonedToUtc, type YMD } from "./date.js";
import { extractDateToken } from "./date-token.js";
import { collapseWhitespace, extractWords, occursAsSubsequence } from "./normalize.js";
import { splitItems } from "./split.js";
import type { ParseIssue, ParseOptions, ParseResult, ParsedItem, TxType } from "./types.js";

const TRAILING_PUNCT_RE = /^[-–,;.\s]+|[-–,;.\s]+$/g;

function detectType(text: string): { type: TxType; textAfterType: string } {
  const leadTrimmed = text.replace(/^\s+/, "");
  if (leadTrimmed.startsWith("+")) {
    return { type: "income", textAfterType: leadTrimmed.slice(1).replace(/^\s+/, "") };
  }
  const words = extractWords(text);
  for (const kw of INCOME_SIGNAL_KEYWORDS) {
    if (occursAsSubsequence(words, extractWords(kw))) {
      return { type: "income", textAfterType: text };
    }
  }
  return { type: "expense", textAfterType: text };
}

/**
 * Parses a raw Telegram/web message into one or more transaction items.
 * Pure function — no I/O. `now` and `options.timeZone` control every
 * relative-date and "bare number" decision, so tests can pin `now`.
 */
export function parseMessage(text: string, now: Date, options: ParseOptions): ParseResult {
  const categories = options.categories;
  const overrides = options.overrides ?? [];
  const bareNumberThreshold = options.bareNumberThreshold ?? 1000;
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;

  const trimmedText = text.trim();
  if (trimmedText === "") {
    return { ok: false, items: [], errors: [{ raw: text, code: "EMPTY", message: "Tin nhắn trống" }] };
  }

  const nowZoned = getZonedParts(now, timeZone);
  const today: YMD = { year: nowZoned.year, month: nowZoned.month, day: nowZoned.day };
  const nowHms = { hour: nowZoned.hour, minute: nowZoned.minute, second: nowZoned.second };

  const segments = splitItems(trimmedText);

  // Pass 1: a segment that is nothing BUT a date token (e.g. a line with just
  // "12/9") sets the default date for the other items in this message instead
  // of becoming a transaction itself.
  let messageYmd: YMD | null = null;
  const contentSegments: string[] = [];
  for (const seg of segments) {
    const dt = extractDateToken(seg, today);
    if (dt.matched && !dt.invalid && dt.remaining === "") {
      if (!messageYmd) messageYmd = dt.ymd;
      continue;
    }
    contentSegments.push(seg);
  }

  if (contentSegments.length === 0) {
    return { ok: false, items: [], errors: [{ raw: text, code: "NO_AMOUNT", message: "Không tìm thấy số tiền" }] };
  }

  const items: ParsedItem[] = [];
  const errors: ParseIssue[] = [];

  for (const seg of contentSegments) {
    const dt = extractDateToken(seg, today);
    if (dt.matched && dt.invalid) {
      errors.push({ raw: seg, code: "INVALID_DATE", message: "Ngày tháng không hợp lệ" });
      continue;
    }

    const textAfterDate = dt.matched ? dt.remaining : seg;
    const itemYmd = dt.matched ? dt.ymd : (messageYmd ?? today);
    const dateExplicit = dt.matched || messageYmd !== null;

    if (textAfterDate === "") {
      errors.push({ raw: seg, code: "NO_AMOUNT", message: "Không tìm thấy số tiền" });
      continue;
    }

    const { type: preferredType, textAfterType } = detectType(textAfterDate);

    const amountResult = pickAmount(textAfterType, bareNumberThreshold);
    if (!amountResult.ok) {
      errors.push({
        raw: seg,
        code: amountResult.error,
        message: amountResult.error === "AMOUNT_TOO_LARGE" ? "Số tiền quá lớn" : "Không tìm thấy số tiền",
      });
      continue;
    }

    const noteRaw = textAfterType.slice(0, amountResult.start) + textAfterType.slice(amountResult.end);
    const note = collapseWhitespace(noteRaw).replace(TRAILING_PUNCT_RE, "");

    const occurredAt = zonedToUtc({ ...itemYmd, ...nowHms }, timeZone);
    const cat = categorize(note, preferredType, categories, overrides);

    items.push({
      raw: seg,
      amount: amountResult.value,
      type: cat.type,
      categoryId: cat.categoryId,
      matchedBy: cat.matchedBy,
      matchedKeyword: cat.matchedKeyword,
      note,
      occurredAt,
      dateExplicit,
    });
  }

  if (errors.length > 0) {
    return { ok: false, items: [], errors };
  }
  return { ok: true, items, errors: [] };
}
