import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "public", "icons");
const src = path.join(root, "assets", "app-icon.png");
const bg = { r: 0, g: 0, b: 0, alpha: 1 };

await mkdir(out, { recursive: true });

for (const size of [192, 512]) {
  await sharp(src)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(path.join(out, `icon-${size}.png`));
}

await sharp(src)
  .resize(384, 384, { fit: "cover" })
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background: bg })
  .png()
  .toFile(path.join(out, "icon-512-maskable.png"));

console.log("PWA icons written to public/icons/ from assets/app-icon.png");
