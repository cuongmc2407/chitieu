export type TxType = "expense" | "income";

export interface CategoryDef {
  id: string;
  name: string;
  emoji: string;
  type: TxType;
  /** Keyword phrases used to auto-detect this category. Longest phrase match wins. */
  keywords: string[];
  /** Fallback category used when nothing else matches (one per TxType). */
  isFallback?: boolean;
}

export interface KeywordOverride {
  /** Free-text keyword the user taught the bot (arbitrary casing/diacritics). */
  keyword: string;
  categoryId: string;
}

export interface ParseOptions {
  categories: CategoryDef[];
  overrides?: KeywordOverride[];
  /** Bare numbers below this are treated as thousands. Default 1000. */
  bareNumberThreshold?: number;
  /** IANA timezone used to resolve relative dates. Default 'Asia/Ho_Chi_Minh'. */
  timeZone?: string;
}

export type MatchedBy = "override" | "keyword" | "fallback";

export interface ParsedItem {
  /** Original raw text of this item (one segment of a possibly multi-item message). */
  raw: string;
  /** Amount in whole đồng (integer, always positive). */
  amount: number;
  type: TxType;
  categoryId: string;
  matchedBy: MatchedBy;
  matchedKeyword?: string;
  /** Free-text note, original casing/diacritics preserved, amount & date tokens removed. */
  note: string;
  occurredAt: Date;
  /** True when the item (or the message) carried an explicit date token. */
  dateExplicit: boolean;
}

export type ParseIssueCode = "NO_AMOUNT" | "AMOUNT_TOO_LARGE" | "INVALID_DATE" | "EMPTY";

export interface ParseIssue {
  raw: string;
  code: ParseIssueCode;
  message: string;
}

export interface ParseResult {
  ok: boolean;
  items: ParsedItem[];
  errors: ParseIssue[];
}
