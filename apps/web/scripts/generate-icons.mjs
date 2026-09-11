// One-off icon rasterizer: SVG -> the PNG sizes PWA manifests and iOS need.
// Run with `pnpm --filter @chitieu/web generate:icons` whenever public/favicon.svg
// or public/icon-maskable-source.svg change.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const iconsDir = path.join(publicDir, "icons");
mkdirSync(iconsDir, { recursive: true });

const favicon = path.join(publicDir, "favicon.svg");
const maskableSource = path.join(publicDir, "icon-maskable-source.svg");

async function render(src, size, dest) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(dest);
  console.log("wrote", path.relative(publicDir, dest));
}

await render(favicon, 192, path.join(iconsDir, "icon-192.png"));
await render(favicon, 512, path.join(iconsDir, "icon-512.png"));
await render(favicon, 180, path.join(iconsDir, "apple-touch-icon.png"));
await render(maskableSource, 512, path.join(iconsDir, "icon-maskable-512.png"));
