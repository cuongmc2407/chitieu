export type TxType = "expense" | "income";

export interface Category {
  id: string;
  key: string | null;
  name: string;
  emoji: string;
  type: TxType;
  keywords: string[];
  monthlyBudget: number | null;
  sortOrder: number;
  isFallback: boolean;
  hidden: boolean;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  categoryId: string;
  categoryName: string | null;
  categoryEmoji: string | null;
  note: string;
  rawText: string;
  occurredAt: string;
  source: "telegram" | "web" | "ios";
  clientId: string;
  /** Set when the row was written automatically from a monthly fixed cost. */
  fixedCostId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FixedCost {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  categoryName: string | null;
  categoryEmoji: string | null;
  /** What the user picked (1–31). */
  dayOfMonth: number;
  /** Where that lands this month — 31 becomes 28/29/30 in shorter months. */
  dueDay: number;
  note: string;
  autoPost: boolean;
  active: boolean;
  postedThisMonth: boolean;
}

export interface ParsedPreviewItem {
  amount: number;
  type: TxType;
  categoryId: string;
  categoryName: string | null;
  categoryEmoji: string | null;
  matchedBy: "override" | "keyword" | "fallback";
  note: string;
  occurredAt: string;
  dateExplicit: boolean;
}

export interface ParsePreviewResult {
  ok: boolean;
  items: ParsedPreviewItem[];
  errors: Array<{ raw: string; code: string; message: string }>;
}

export interface CategoryShare {
  categoryId: string;
  name: string;
  emoji: string;
  total: number;
  pct: number;
}

export interface StatsResponse {
  period: { start: string; end: string };
  totalExpense: number;
  totalIncome: number;
  changePct: number | null;
  byCategory: CategoryShare[];
  topExpense: {
    id: string;
    amount: number;
    note: string;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    occurredAt: string;
  } | null;
  busiestDay: { date: string; total: number; weekdayLabel: string } | null;
  dailyAverage: number;
  dailyTotals: Array<{ date: string; total: number }>;
}

export interface KeywordOverride {
  id: number;
  keyword: string;
  categoryId: string;
  categoryName: string | null;
  categoryEmoji: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  client: "web" | "ios";
  device: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export interface CurrentUser {
  id: number;
  name: string | null;
  username: string | null;
  reminderEnabled: boolean;
  monthlyBudget: number | null;
}
