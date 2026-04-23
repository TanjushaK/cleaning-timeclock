/**
 * One-off / repeat: generate public brand assets from source JPG.
 * Usage: node scripts/generate-tanija-assets.mjs [path-to-jpg]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const defaultSrc = path.join(publicDir, "tanija-logo-source.jpg");
const src = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc;

if (!fs.existsSync(src)) {
  console.error("Missing source image:", src);
  process.exit(1);
}

const bg = { r: 18, g: 8, b: 5, alpha: 1 }; // #120805

function squareIcon(size, paddingRatio) {
  const inner = Math.round(size * (1 - 2 * paddingRatio));
  return sharp(src)
    .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
    .toBuffer()
    .then((buf) =>
      sharp({
        create: { width: size, height: size, channels: 4, background: bg },
      })
        .composite([{ input: buf, gravity: "centre" }])
        .png(),
    );
}

const main = await sharp(src)
  .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
  .png()
  .toFile(path.join(publicDir, "tanija-logo.png"));

console.log("tanija-logo.png", main);

const iconsDir = path.join(publicDir, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

for (const [name, size, pad] of [
  ["icon-192.png", 192, 0.12],
  ["icon-512.png", 512, 0.12],
  ["maskable-192.png", 192, 0.18],
  ["maskable-512.png", 512, 0.18],
]) {
  const pipeline = await squareIcon(size, pad);
  await pipeline.toFile(path.join(iconsDir, name));
  console.log("icons/" + name);
}

console.log("Done.");
