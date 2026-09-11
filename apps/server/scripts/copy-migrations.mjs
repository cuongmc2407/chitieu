// tsdown bundles everything under src/ into a single dist/index.mjs, so the
// migration .sql files (loaded from disk at runtime, not imported as JS)
// never make it into dist/ on their own. db/migrate.ts resolves them
// relative to its own file — which, once bundled, means relative to
// dist/index.mjs — so they need to land at dist/migrations to match.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = path.join(root, "src", "db", "migrations");
const dest = path.join(root, "dist", "migrations");

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Đã copy migrations: ${src} -> ${dest}`);
