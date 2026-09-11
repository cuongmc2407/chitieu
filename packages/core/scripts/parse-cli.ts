#!/usr/bin/env tsx
import { DEFAULT_CATEGORIES, parseMessage } from "../src/index.js";

const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error('Cách dùng: pnpm parse "phở 45k, trà đá 5k"');
  process.exit(1);
}

const result = parseMessage(text, new Date(), { categories: DEFAULT_CATEGORIES });

console.log(
  JSON.stringify(
    result,
    (_key, value) => (value instanceof Date ? value.toISOString() : value),
    2,
  ),
);

if (!result.ok) process.exitCode = 1;
