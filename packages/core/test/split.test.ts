import { describe, expect, it } from "vitest";
import { splitItems } from "../src/index.js";

describe("splitItems", () => {
  it("splits on comma", () => {
    expect(splitItems("phở 45k, trà đá 5k")).toEqual(["phở 45k", "trà đá 5k"]);
  });

  it("splits on semicolon and newline", () => {
    expect(splitItems("phở 45k; trà đá 5k\ncf 20k")).toEqual(["phở 45k", "trà đá 5k", "cf 20k"]);
  });

  it("does NOT split a comma used as a decimal separator", () => {
    expect(splitItems("tiền điện 1,2tr")).toEqual(["tiền điện 1,2tr"]);
  });

  it("does NOT split a comma used as a thousands separator", () => {
    expect(splitItems("grab 150,000")).toEqual(["grab 150,000"]);
  });

  it("mixes protected and separator commas correctly", () => {
    expect(splitItems("shopee 1,5tr, grab 30k")).toEqual(["shopee 1,5tr", "grab 30k"]);
  });

  it("drops empty segments and trims whitespace", () => {
    expect(splitItems("  phở 45k , , trà đá 5k ")).toEqual(["phở 45k", "trà đá 5k"]);
  });
});
