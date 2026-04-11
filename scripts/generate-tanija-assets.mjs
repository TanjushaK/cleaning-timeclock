/**
 * One-off / repeat: generate public brand assets from source JPG.
 * Usage: node scripts/generate-tanija-assets.mjs [path-to-jpg]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const jpgDefault = path.join(publicDir, "tanija-logo-source.jpg");
const pngFallback = path.join(publicDir, "tanija-logo.png");
const src = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.existsSync(jpgDefault)
    ? jpgDefault
    : pngFallback;

if (!fs.existsSync(src)) {
  console.error("Missing source image. Pass a path or add tanija-logo-source.jpg / tanija-logo.png in public/");
  process.exit(1);
}

/** Buffer input avoids sharp "same file for input and output" when src is public/tanija-logo.png */
const input = fs.readFileSync(src);

const bg = { r: 18, g: 8, b: 5, alpha: 1 }; // #120805

function squareIcon(size, paddingRatio) {
  const inner = Math.round(size * (1 - 2 * paddingRatio));
  return sharp(input)
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

const main = await sharp(input)
  .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
  .png()
  .toFile(path.join(publicDir, "tanija-logo.png"));

console.log("tanija-logo.png", main);

await sharp(input)
  .resize(180, 180, { fit: "cover", position: "centre" })
  .png()
  .toFile(path.join(publicDir, "apple-touch-icon.png"));

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

const appDir = path.join(root, "app");
const buf32 = await (await squareIcon(32, 0.12)).toBuffer();
const buf16 = await (await squareIcon(16, 0.12)).toBuffer();
const icoBuf = await pngToIco([buf32, buf16]);
fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuf);
console.log("app/favicon.ico");

fs.copyFileSync(path.join(iconsDir, "icon-192.png"), path.join(appDir, "icon.png"));
console.log("app/icon.png (from icons/icon-192.png)");

fs.copyFileSync(path.join(publicDir, "apple-touch-icon.png"), path.join(appDir, "apple-icon.png"));
console.log("app/apple-icon.png");

console.log("Done.");
