import { DEFAULT_CATEGORIES, DEFAULT_TIME_ZONE, parseMessage } from "@chitieu/core";
import { describe, expect, it } from "vitest";

// Sanity check that @chitieu/core (a workspace package) resolves and runs
// correctly inside the Vite/browser test environment — this is the exact
// function Quick Entry calls on every keystroke for its live preview.
describe("live preview via @chitieu/core", () => {
  const NOW = new Date("2025-09-15T02:00:00.000Z");

  it("parses a simple expense the same way the bot/server do", () => {
    const result = parseMessage("phở 45k", NOW, { categories: DEFAULT_CATEGORIES, timeZone: DEFAULT_TIME_ZONE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]?.amount).toBe(45_000);
    expect(result.items[0]?.categoryId).toBe("food");
  });

  it("reports an error for a message with no amount, without throwing", () => {
    const result = parseMessage("phở", NOW, { categories: DEFAULT_CATEGORIES, timeZone: DEFAULT_TIME_ZONE });
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("NO_AMOUNT");
  });

  it("respects a learned keyword override, same as the bot/server", () => {
    const result = parseMessage("bún 30k", NOW, {
      categories: DEFAULT_CATEGORIES,
      overrides: [{ keyword: "bún", categoryId: "shopping" }],
      timeZone: DEFAULT_TIME_ZONE,
    });
    expect(result.ok && result.items[0]?.categoryId).toBe("shopping");
  });
});
