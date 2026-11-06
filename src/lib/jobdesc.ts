// Jobdesc per karyawan (migrasi 030) + pengecekan penugasan di luar jobdesc (hanya ditampilkan ke admin & CEO).
import { normalizeText } from "./search";

export type JobdescItem = { id: number; item: string; keywords: string | null; sort: number };

const STOP = new Set(["untuk", "dengan", "dalam", "kepada", "terhadap", "secara", "setiap", "seluruh", "semua", "antara", "sesuai", "proses", "kegiatan"]);

// Kata kunci pencocokan: isian "kata kunci" (dipisah koma); bila kosong, kata >= 5 huruf dari uraian jobdesc.
export function jobdescTerms(items: Pick<JobdescItem, "item" | "keywords">[]): string[] {
  const terms = items.flatMap((j) =>
    j.keywords?.trim()
      ? j.keywords.split(",").map((k) => normalizeText(k.trim()))
      : normalizeText(j.item)
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 5 && !STOP.has(w)),
  );
  return [...new Set(terms.filter(Boolean))];
}

export const matchesJobdesc = (text: string, terms: string[]) => {
  const t = normalizeText(text);
  return terms.some((k) => t.includes(k));
};
