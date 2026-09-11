import { getZonedParts } from "@chitieu/core";
import type { Db } from "../db/index.js";
import * as categoriesRepo from "../db/repos/categories.js";
import * as transactionsRepo from "../db/repos/transactions.js";

const BOM = String.fromCharCode(0xfeff);

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatDate(iso: string, timeZone: string): string {
  const p = getZonedParts(new Date(iso), timeZone);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}

/** Builds a CSV (UTF-8 BOM, comma-separated) of every transaction in [from, to) for /xuat and GET /api/export.csv. */
export function buildCsv(db: Db, userId: number, from: string, to: string, timeZone: string): string {
  const rows = transactionsRepo.listRange(db, userId, { from, to });
  const categories = categoriesRepo.listByUser(db, userId, { includeHidden: true });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const lines = [["Ngày", "Loại", "Danh mục", "Số tiền", "Ghi chú"].join(",")];
  for (const row of rows) {
    const category = categoryById.get(row.categoryId);
    const categoryLabel = category ? `${category.emoji} ${category.name}` : "";
    lines.push(
      [
        formatDate(row.occurredAt, timeZone),
        row.type === "expense" ? "Chi" : "Thu",
        csvEscape(categoryLabel),
        String(row.amount),
        csvEscape(row.note),
      ].join(","),
    );
  }

  return BOM + lines.join("\r\n");
}
