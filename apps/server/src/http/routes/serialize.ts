import type { CategoryDef, ParseResult } from "@chitieu/core";

/** Shared JSON shape for a parsed (not-yet-saved) item, used by POST /api/parse. */
export function serializeParseResult(result: ParseResult, categories: CategoryDef[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    ok: result.ok,
    items: result.items.map((item) => {
      const category = byId.get(item.categoryId);
      return {
        amount: item.amount,
        type: item.type,
        categoryId: item.categoryId,
        categoryName: category?.name ?? null,
        categoryEmoji: category?.emoji ?? null,
        matchedBy: item.matchedBy,
        note: item.note,
        occurredAt: item.occurredAt.toISOString(),
        dateExplicit: item.dateExplicit,
      };
    }),
    errors: result.errors,
  };
}
