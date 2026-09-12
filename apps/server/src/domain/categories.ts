import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import type { CategoryRow } from "../db/repos/categories.js";
import * as fixedCostsRepo from "../db/repos/fixedCosts.js";
import * as transactionsRepo from "../db/repos/transactions.js";

export type DeleteCategoryResult = { ok: true; reassignedCount: number } | { ok: false; reason: "NOT_FOUND" | "IS_FALLBACK" };

/**
 * Deletes a category, first reassigning every transaction that referenced
 * it to that type's fallback category ("Khác" / "Thu khác") so no
 * transaction is ever left pointing at a category that no longer exists.
 * The fallback categories themselves can't be deleted.
 */
export function deleteCategory(db: Db, userId: number, categoryId: string): DeleteCategoryResult {
  const category = categoriesRepo.getById(db, userId, categoryId);
  if (!category) return { ok: false, reason: "NOT_FOUND" };
  if (category.isFallback) return { ok: false, reason: "IS_FALLBACK" };

  const fallback = categoriesRepo.findFallback(db, userId, category.type);

  const run = db.transaction((): number => {
    const reassignedCount = fallback ? transactionsRepo.reassignCategory(db, userId, category.id, fallback.id) : 0;
    // fixed_costs.category_id is a foreign key too — any row left pointing
    // here would make the DELETE below fail outright.
    if (fallback) fixedCostsRepo.reassignCategory(db, userId, category.id, fallback.id);
    categoriesRepo.remove(db, userId, category.id);
    return reassignedCount;
  });

  return { ok: true, reassignedCount: run() };
}

export function toPublic(c: CategoryRow) {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    emoji: c.emoji,
    type: c.type,
    keywords: c.keywords,
    monthlyBudget: c.monthlyBudget,
    sortOrder: c.sortOrder,
    isFallback: c.isFallback,
    hidden: c.hidden,
  };
}
