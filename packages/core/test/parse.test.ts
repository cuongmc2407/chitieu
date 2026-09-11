import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, parseMessage } from "../src/index.js";
import { NOW, ymd } from "./helpers.js";

function parse(text: string, overrides?: { keyword: string; categoryId: string }[]) {
  return parseMessage(text, NOW, { categories: DEFAULT_CATEGORIES, overrides });
}

function firstItem(text: string) {
  const r = parse(text);
  if (!r.ok) throw new Error(`expected ok result for "${text}", got errors: ${JSON.stringify(r.errors)}`);
  const item = r.items[0];
  if (!item) throw new Error(`expected at least one item for "${text}"`);
  return item;
}

describe("parseMessage — required cases from the spec", () => {
  it.each([
    ["phở 45k", 45_000, "expense", "food", "phở"],
    ["45k phở", 45_000, "expense", "food", "phở"],
    ["PHỞ 45K", 45_000, "expense", "food", "PHỞ"],
    ["pho 45k", 45_000, "expense", "food", "pho"],
    ["xăng 80k", 80_000, "expense", "transport", "xăng"],
    ["cf 25k", 25_000, "expense", "drinks", "cf"],
    ["bánh mì 20", 20_000, "expense", "food", "bánh mì"],
    ["grab 32.000", 32_000, "expense", "transport", "grab"],
    ["tiền nhà 3tr5", 3_500_000, "expense", "housing", "tiền nhà"],
    ["tiền điện 1,2tr", 1_200_000, "expense", "bills", "tiền điện"],
    ["tiền nước 150k", 150_000, "expense", "bills", "tiền nước"],
    ["nước 10k", 10_000, "expense", "drinks", "nước"],
    ["gửi xe 2k5", 2_500, "expense", "transport", "gửi xe"],
    ["mừng cưới 1 củ", 1_000_000, "expense", "gifts", "mừng cưới"],
    ["shopee 1.5tr", 1_500_000, "expense", "shopping", "shopee"],
    ["xăng 95 60k", 60_000, "expense", "transport", "xăng 95"],
    ["+lương 15tr", 15_000_000, "income", "salary", "lương"],
    ["150000", 150_000, "expense", "other", ""],
  ] as const)("%s", (text, amount, type, categoryId, note) => {
    const item = firstItem(text);
    expect(item.amount).toBe(amount);
    expect(item.type).toBe(type);
    expect(item.categoryId).toBe(categoryId);
    expect(item.note).toBe(note);
  });

  it("hôm qua lẩu 350k -> date is yesterday", () => {
    const item = firstItem("hôm qua lẩu 350k");
    expect(ymd(item.occurredAt)).toBe("2025-09-14");
    expect(item.dateExplicit).toBe(true);
    expect(item.amount).toBe(350_000);
    expect(item.categoryId).toBe("food");
  });

  it("12/9 xăng 70k -> date is 12/09", () => {
    const item = firstItem("12/9 xăng 70k");
    expect(ymd(item.occurredAt)).toBe("2025-09-12");
    expect(item.amount).toBe(70_000);
  });

  it("phở 45k, trà đá 5k -> two separate items", () => {
    const r = parse("phở 45k, trà đá 5k");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ amount: 45_000, categoryId: "food", note: "phở" });
    expect(r.items[1]).toMatchObject({ amount: 5_000, categoryId: "drinks", note: "trà đá" });
  });

  it("phở -> NO_AMOUNT error, nothing saved", () => {
    const r = parse("phở");
    expect(r.ok).toBe(false);
    expect(r.items).toHaveLength(0);
    expect(r.errors).toEqual([{ raw: "phở", code: "NO_AMOUNT", message: "Không tìm thấy số tiền" }]);
  });
});

describe("parseMessage — additional unit variants", () => {
  it.each([
    ["ăn sáng 45 k", 45_000, "food"],
    ["cf 2 triệu", 2_000_000, "drinks"],
    ["tiền nhà 1tr250", 1_250_000, "housing"],
    ["gửi xe 45ng", 45_000, "transport"],
    ["ăn trưa 45.000đ", 45_000, "food"],
    ["grab 150,000", 150_000, "transport"],
  ] as const)("%s -> %d (%s)", (text, amount, categoryId) => {
    const item = firstItem(text);
    expect(item.amount).toBe(amount);
    expect(item.categoryId).toBe(categoryId);
  });

  it("bare number threshold is configurable", () => {
    const r = parseMessage("bánh mì 20", NOW, { categories: DEFAULT_CATEGORIES, bareNumberThreshold: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items[0]?.amount).toBe(20); // 20 >= threshold(10), kept as-is
  });
});

describe("parseMessage — dates", () => {
  it("hôm kia", () => {
    expect(ymd(firstItem("hôm kia phở 40k").occurredAt)).toBe("2025-09-13");
  });

  it("thứ 7 (most recent past Saturday)", () => {
    expect(ymd(firstItem("thứ 7 đi chơi 200k").occurredAt)).toBe("2025-09-13");
  });

  it("CN (most recent past Sunday)", () => {
    expect(ymd(firstItem("CN ăn lẩu 300k").occurredAt)).toBe("2025-09-14");
  });

  it("a date at the end of the item", () => {
    const item = firstItem("xăng 70k 12/9");
    expect(ymd(item.occurredAt)).toBe("2025-09-12");
    expect(item.note).toBe("xăng");
  });

  it("20/9 without year rolls back to last year (future date)", () => {
    expect(ymd(firstItem("20/9 xăng 70k").occurredAt)).toBe("2024-09-20");
  });

  it("31/2 is an invalid date -> INVALID_DATE error", () => {
    const r = parse("31/2 ăn gì đó 20k");
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe("INVALID_DATE");
  });

  it("a standalone date line applies to every other item in the message", () => {
    const r = parse("12/9\nphở 45k\ntrà đá 5k");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(ymd(r.items[0]!.occurredAt)).toBe("2025-09-12");
    expect(ymd(r.items[1]!.occurredAt)).toBe("2025-09-12");
  });

  it("with no date prefix, occurredAt is `now`", () => {
    const item = firstItem("phở 45k");
    expect(item.occurredAt.getTime()).toBe(NOW.getTime());
    expect(item.dateExplicit).toBe(false);
  });
});

describe("parseMessage — multi-item splitting keeps decimals intact", () => {
  it("comma inside 1,5tr is not treated as a separator", () => {
    const r = parse("shopee 1,5tr, grab 30k");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]?.amount).toBe(1_500_000);
    expect(r.items[1]?.amount).toBe(30_000);
  });
});

describe("parseMessage — category disambiguation", () => {
  it("'nuoc mam' (ascii) does not become Đồ uống", () => {
    expect(firstItem("nuoc mam 30k").categoryId).toBe("shopping");
  });

  it("'sữa cho bé' does not become Đi lại (xe Be)", () => {
    expect(firstItem("sữa cho bé 50k").categoryId).not.toBe("transport");
  });
});

describe("parseMessage — income", () => {
  it("'+' prefix with no keyword falls back to Thu khác", () => {
    const item = firstItem("+ 500k");
    expect(item.type).toBe("income");
    expect(item.categoryId).toBe("other_income");
    expect(item.amount).toBe(500_000);
  });

  it("income keyword without '+' is still detected as income", () => {
    const item = firstItem("thưởng dự án 2tr");
    expect(item.type).toBe("income");
    expect(item.categoryId).toBe("bonus");
  });
});

describe("parseMessage — learned keyword overrides", () => {
  it("an override changes the guessed category on the next message", () => {
    const overrides = [{ keyword: "bún", categoryId: "shopping" }];
    const item = firstItem("bún 30k");
    expect(item.categoryId).toBe("food"); // no override yet
    const withOverride = parseMessage("bún 30k", NOW, { categories: DEFAULT_CATEGORIES, overrides });
    expect(withOverride.ok && withOverride.items[0]?.categoryId).toBe("shopping");
  });
});

describe("parseMessage — errors", () => {
  it("empty message", () => {
    const r = parse("   ");
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe("EMPTY");
  });

  it("one bad item in a multi-item message fails the whole message", () => {
    const r = parse("phở 45k, không có số tiền");
    expect(r.ok).toBe(false);
    expect(r.items).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.code).toBe("NO_AMOUNT");
  });

  it("an amount above the safety cap is rejected", () => {
    const r = parse("trúng số 2000000000000");
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe("AMOUNT_TOO_LARGE");
  });
});
