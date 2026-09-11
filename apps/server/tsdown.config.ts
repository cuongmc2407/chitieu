import { defineConfig } from "tsdown";

export default defineConfig({
  // backup-now/restore are bundled too so `pnpm backup:now`/`pnpm restore`
  // work against the deployed artifact — the CLI scripts import loadConfig
  // etc. from src/, and production installs (pnpm --prod deploy) don't
  // include tsx, which the scripts otherwise run under during dev.
  entry: {
    index: "src/index.ts",
    "backup-now": "scripts/backup-now.ts",
    restore: "scripts/restore.ts",
  },
  // @chitieu/core ships raw TypeScript source (exports -> ./src/index.ts) —
  // fine for tsx/vitest, which resolve .ts directly, but a plain `node
  // dist/index.mjs` can't load it if left external. Bundle it in; every
  // other dependency (fastify, better-sqlite3, grammy, ...) stays external.
  deps: {
    alwaysBundle: ["@chitieu/core"],
  },
});
