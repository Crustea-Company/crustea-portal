import { readdir } from "node:fs/promises";
import path from "node:path";

export const GUIDE_IMAGE_DIR = path.join(process.cwd(), "panduan-gambar");

// Nama gambar (tanpa .png) yang sudah ada di folder panduan-gambar/.
export async function availableGuideImages(): Promise<Set<string>> {
  const files = await readdir(GUIDE_IMAGE_DIR).catch(() => [] as string[]);
  return new Set(files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
}
