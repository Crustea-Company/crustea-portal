// Membuat ikon aplikasi (PWA + tab browser) dari logo Crustea di public/brand/crustea-logo.png.
// Jalankan ulang kalau logo diganti:  node scripts/generate-icons.mjs

import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const LOGO = path.join(ROOT, "public", "brand", "crustea-logo.png");
const ICONS = path.join(ROOT, "public", "icons");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Logo diletakkan di tengah kotak persegi. fill = tinggi logo relatif terhadap kotak
// (maskable lebih kecil supaya tetap utuh saat Android memotong ikon menjadi lingkaran).
async function makeIcon({ file, size, fill, background, out = ICONS }) {
  const logoHeight = Math.round(size * fill);
  const logo = await sharp(LOGO).trim().resize({ height: logoHeight }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(out, file));
  console.log("dibuat", path.relative(ROOT, path.join(out, file)));
}

fs.mkdirSync(ICONS, { recursive: true });
await makeIcon({ file: "icon-192.png", size: 192, fill: 0.78, background: WHITE });
await makeIcon({ file: "icon-512.png", size: 512, fill: 0.78, background: WHITE });
await makeIcon({ file: "maskable-512.png", size: 512, fill: 0.6, background: WHITE });
await makeIcon({ file: "apple-touch-icon.png", size: 180, fill: 0.72, background: WHITE });
// Ikon tab browser: latar transparan, logo hampir penuh.
await makeIcon({ file: "tab-icon.png", size: 96, fill: 0.94, background: CLEAR });
