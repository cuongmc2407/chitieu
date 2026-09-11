import { describe, expect, it } from "vitest";
import { categorize, DEFAULT_CATEGORIES, overrideKey } from "../src/index.js";

describe("overrideKey", () => {
  it("lowercases, drops standalone numbers, collapses whitespace", () => {
    // overrideKey runs on an already-parsed `note` (amount already stripped by
    // parseMessage), so it only needs to drop leftover bare numbers like a
    // stray table/quantity, not amount-shaped tokens such as "30k".
    expect(overrideKey("Bún   Chả 2")).toBe("bún chả");
  });

  it("keeps diacritics", () => {
    expect(overrideKey("bún")).toBe("bún");
  });

  it("returns null for a note with nothing but numbers", () => {
    expect(overrideKey("30 5")).toBeNull();
  });

  it("caps length", () => {
    const long = Array.from({ length: 20 }, () => "abcd").join(" ");
    expect(overrideKey(long)!.length).toBeLessThanOrEqual(60);
  });
});

describe("overrideKey + categorize round-trip", () => {
  it("a keyword learned from an accented note still matches when typed accented again later", () => {
    const key = overrideKey("bún")!;
    const overrides = [{ keyword: key, categoryId: "shopping" }];
    expect(categorize("bún", "expense", DEFAULT_CATEGORIES, overrides).categoryId).toBe("shopping");
  });

  it("...and also matches when typed without diacritics later", () => {
    const key = overrideKey("bún")!;
    const overrides = [{ keyword: key, categoryId: "shopping" }];
    expect(categorize("bun", "expense", DEFAULT_CATEGORIES, overrides).categoryId).toBe("shopping");
  });

  it("a keyword learned from an unaccented note still matches unaccented input later", () => {
    const key = overrideKey("bun rieu")!;
    const overrides = [{ keyword: key, categoryId: "shopping" }];
    expect(categorize("bun rieu", "expense", DEFAULT_CATEGORIES, overrides).categoryId).toBe("shopping");
  });
});
