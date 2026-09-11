/**
 * Amount (money) token detection. Works purely with integer arithmetic —
 * never floating point — so results are always exact đồng amounts.
 */

/** Absolute safety cap: 1,000 tỷ đồng. Anything above is rejected as AMOUNT_TOO_LARGE. */
export const MAX_AMOUNT = 1_000_000_000_000;

/** Multiplier ×1.000 units. Spelled-out/word forms — space before them is allowed. */
const THOUSAND_UNITS: Record<string, number> = {
  "nghìn": 1000,
  "nghin": 1000,
  "ngàn": 1000,
  "ngan": 1000,
  "cành": 1000,
  "canh": 1000,
  "k": 1000,
};

/** Multiplier ×1.000.000 units — space before them is allowed. */
const MILLION_UNITS: Record<string, number> = {
  "triệu": 1_000_000,
  "trieu": 1_000_000,
  "tr": 1_000_000,
  "củ": 1_000_000,
  "cu": 1_000_000,
};

/** Multiplier ×1 (already đồng) units — space before them is allowed. */
const ONE_UNITS: Record<string, number> = {
  "đ": 1,
  "₫": 1,
  "vnd": 1,
};

const UNIT_MAP: Record<string, number> = { ...THOUSAND_UNITS, ...MILLION_UNITS, ...ONE_UNITS };
/** Longest-first so e.g. "triệu" is tried before "tr" wins by accident on a partial match. */
const UNIT_ALT = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

/** Units allowed in the compact combined form (1tr2, 2k5, 1tr250) — short slang only. */
const COMPACT_UNIT_MAP: Record<string, number> = {
  "triệu": 1_000_000,
  "trieu": 1_000_000,
  "tr": 1_000_000,
  "củ": 1_000_000,
  "cu": 1_000_000,
  "k": 1000,
};
const COMPACT_UNIT_ALT = Object.keys(COMPACT_UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const AMOUNT_RE = new RegExp(
  [
    // 1) Compact combined: 1tr2, 2k5, 1tr250 — no space allowed anywhere.
    `(?<compactNum>\\d+)(?<compactUnit>${COMPACT_UNIT_ALT})(?<compactFrac>\\d{1,3})(?!\\d)`,
    // 2) Decimal + unit, 1-2 digit fraction (3-digit groups are thousand separators, see #3): 1.5tr, 1,25tr
    `(?<decNum>\\d+)[.,](?<decFrac>\\d{1,2})\\s*(?<decUnit>${UNIT_ALT})(?!\\p{L})`,
    // 3) Grouped thousands: 150.000 / 1,500,000 — optional trailing unit.
    `(?<grpFirst>\\d{1,3})(?<grpRest>(?:[.,]\\d{3})+)(?:\\s*(?<grpUnit>${UNIT_ALT})(?!\\p{L}))?`,
    // 4) Plain integer + unit (space allowed): 45k, 45 k, 2 triệu, 45.000đ handled by #3 already.
    `(?<intNum>\\d+)\\s*(?<intUnit>${UNIT_ALT})(?!\\p{L})`,
    // 5) Plain integer + "ng" — no space allowed (avoids "2 ng" = "2 người").
    `(?<ngNum>\\d+)ng(?!\\p{L})`,
    // 6) Bare integer, no unit.
    `(?<bareNum>\\d+)`,
  ].join("|"),
  "gu",
);

export interface AmountCandidate {
  start: number;
  end: number;
  value: number;
  hasUnit: boolean;
  raw: string;
}

/** Finds every amount-shaped token in `text`. `text` should already be lowercased. */
export function findAmountCandidates(text: string, bareNumberThreshold: number): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const g = m.groups ?? {};
    const start = m.index ?? 0;
    const end = start + m[0].length;
    let value: number | null = null;
    let hasUnit = false;

    if (g.compactNum !== undefined && g.compactUnit !== undefined && g.compactFrac !== undefined) {
      const mult = COMPACT_UNIT_MAP[g.compactUnit];
      if (mult !== undefined) {
        const fracLen = g.compactFrac.length;
        const scale = 10 ** fracLen;
        value = Math.round((Number(g.compactNum) * scale + Number(g.compactFrac)) * (mult / scale));
        hasUnit = true;
      }
    } else if (g.decNum !== undefined && g.decFrac !== undefined && g.decUnit !== undefined) {
      const mult = UNIT_MAP[g.decUnit];
      if (mult !== undefined) {
        const fracLen = g.decFrac.length;
        const scale = 10 ** fracLen;
        value = Math.round((Number(g.decNum) * scale + Number(g.decFrac)) * (mult / scale));
        hasUnit = true;
      }
    } else if (g.grpFirst !== undefined && g.grpRest !== undefined) {
      const digits = g.grpFirst + g.grpRest.replace(/[.,]/g, "");
      const base = Number(digits);
      if (g.grpUnit !== undefined) {
        const mult = UNIT_MAP[g.grpUnit];
        if (mult !== undefined) {
          value = base * mult;
          hasUnit = true;
        }
      } else {
        value = base;
        hasUnit = false;
      }
    } else if (g.intNum !== undefined && g.intUnit !== undefined) {
      const mult = UNIT_MAP[g.intUnit];
      if (mult !== undefined) {
        value = Number(g.intNum) * mult;
        hasUnit = true;
      }
    } else if (g.ngNum !== undefined) {
      value = Number(g.ngNum) * 1000;
      hasUnit = true;
    } else if (g.bareNum !== undefined) {
      const n = Number(g.bareNum);
      value = n < bareNumberThreshold ? n * 1000 : n;
      hasUnit = false;
    }

    if (value !== null && Number.isFinite(value) && value > 0) {
      candidates.push({ start, end, value, hasUnit, raw: m[0] });
    }
  }
  return candidates;
}

export type AmountResult =
  | { ok: true; start: number; end: number; value: number; hasUnit: boolean }
  | { ok: false; error: "NO_AMOUNT" | "AMOUNT_TOO_LARGE" };

/**
 * Picks the amount to use for one transaction item, per the priority rules:
 * a candidate with a currency unit wins over one without; among ties, the
 * last (rightmost) candidate wins; with no unit anywhere, the last bare
 * number wins.
 */
export function pickAmount(text: string, bareNumberThreshold: number): AmountResult {
  const lower = text.toLowerCase();
  const all = findAmountCandidates(lower, bareNumberThreshold);
  if (all.length === 0) return { ok: false, error: "NO_AMOUNT" };

  const valid = all.filter((c) => c.value <= MAX_AMOUNT);
  if (valid.length === 0) return { ok: false, error: "AMOUNT_TOO_LARGE" };

  const withUnit = valid.filter((c) => c.hasUnit);
  const pool = withUnit.length > 0 ? withUnit : valid;
  const chosen = pool[pool.length - 1];
  if (!chosen) return { ok: false, error: "NO_AMOUNT" };

  return { ok: true, start: chosen.start, end: chosen.end, value: chosen.value, hasUnit: chosen.hasUnit };
}

/** Parses a single standalone amount string (e.g. for /ngansach or a budget form). Returns null if none found. */
export function parseAmount(text: string, bareNumberThreshold = 1000): number | null {
  const result = pickAmount(text, bareNumberThreshold);
  return result.ok ? result.value : null;
}
