// Membuat ikon aplikasi (PWA) di public/icons dari gambar SVG sederhana:
// huruf "C" putih di atas warna teal Crustea.
// Jalankan ulang kalau desain ikon diubah:  node scripts/generate-icons.mjs

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(import.meta.dirname, "..", "public", "icons");
const TEAL = "#0f766e";

// rounded: sudut membulat (ikon biasa). scale: ukuran huruf C relatif (maskable lebih kecil
// supaya tetap utuh saat Android memotong ikon menjadi lingkaran).
function svg({ rounded, scale }) {
  const r = 120 * scale;
  const d = r * Math.SQRT1_2;
  const c = 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${TEAL}"/>
  <path d="M ${c + d} ${c - d} A ${r} ${r} 0 1 0 ${c + d} ${c + d}"
        fill="none" stroke="#ffffff" stroke-width="${56 * scale}" stroke-linecap="round"/>
  <circle cx="${c + d + 10 * scale}" cy="${c}" r="${18 * scale}" fill="#5eead4"/>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, rounded: true, scale: 1 },
  { file: "icon-512.png", size: 512, rounded: true, scale: 1 },
  { file: "maskable-512.png", size: 512, rounded: false, scale: 0.75 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, scale: 0.9 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const t of targets) {
  await sharp(Buffer.from(svg(t))).resize(t.size, t.size).png().toFile(path.join(OUT, t.file));
  console.log("dibuat", t.file);
}
