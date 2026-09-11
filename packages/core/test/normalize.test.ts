import { describe, expect, it } from "vitest";
import { diacriticSignature, extractWords, isAsciiWord, stripDiacritics, wordMatches } from "../src/index.js";

describe("stripDiacritics", () => {
  it("removes tone marks and vowel modifiers", () => {
    expect(stripDiacritics("Phở")).toBe("Pho");
    expect(stripDiacritics("tiền điện")).toBe("tien dien");
  });

  it("converts đ/Đ to d/D", () => {
    expect(stripDiacritics("đám cưới")).toBe("dam cuoi");
    expect(stripDiacritics("Đà Nẵng")).toBe("Da Nang");
  });
});

describe("diacriticSignature", () => {
  it("treats hoà and hòa (tone mark on different vowel) as equal", () => {
    expect(diacriticSignature("hoà")).toBe(diacriticSignature("hòa"));
  });

  it("still distinguishes different tone marks", () => {
    expect(diacriticSignature("bé")).not.toBe(diacriticSignature("be"));
    expect(diacriticSignature("bé")).not.toBe(diacriticSignature("bè"));
  });

  it("keeps letter-identity marks (ă/â/ê/ô/ơ/ư) significant", () => {
    expect(diacriticSignature("ga")).not.toBe(diacriticSignature("gà"));
    expect(diacriticSignature("banh")).not.toBe(diacriticSignature("bánh"));
  });
});

describe("wordMatches", () => {
  it("ascii-typed word matches an accented keyword", () => {
    expect(wordMatches("pho", "phở")).toBe(true);
    expect(wordMatches("PHO", "phở")).toBe(true);
  });

  it("accented word must match the accented keyword exactly (tone-position independent)", () => {
    expect(wordMatches("phở", "phở")).toBe(true);
    expect(wordMatches("phơ", "phở")).toBe(false);
  });

  it("does not let an accented word match a bare-letter keyword of the same base", () => {
    // "bé" (with dấu) must NOT match keyword "be" (xe Be) just because stripping diacritics coincides.
    expect(wordMatches("bé", "be")).toBe(false);
  });
});

describe("extractWords", () => {
  it("splits on non letter/digit boundaries and keeps Vietnamese letters intact", () => {
    expect(extractWords("phở 45k, trà đá!")).toEqual(["phở", "45k", "trà", "đá"]);
  });
});

describe("isAsciiWord", () => {
  it("flags plain ascii vs accented words correctly", () => {
    expect(isAsciiWord("pho")).toBe(true);
    expect(isAsciiWord("phở")).toBe(false);
    expect(isAsciiWord("be")).toBe(true);
  });
});
