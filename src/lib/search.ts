// Pencarian teks sederhana di sisi browser: huruf besar/kecil dan aksen diabaikan
// ("é" = "e"), dan semua kata yang diketik harus ada (urutan bebas).

const stripChar = (c: string) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// "Komisi  Lunas" -> ["komisi", "lunas"]
export function searchTerms(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

// Posisi [awal, akhir) setiap kata yang cocok di teks asli (untuk diberi warna), sudah digabung bila bertumpuk.
export function findRanges(text: string, terms: string[]): [number, number][] {
  if (terms.length === 0) return [];
  // Teks yang dinormalkan + peta posisi setiap hurufnya ke posisi di teks asli.
  let norm = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    for (const n of stripChar(ch)) {
      norm += n;
      origin.push(i);
    }
    i += ch.length;
  }
  origin.push(text.length);

  const ranges: [number, number][] = [];
  for (const t of terms) {
    for (let at = norm.indexOf(t); at !== -1; at = norm.indexOf(t, at + t.length)) {
      ranges.push([origin[at], origin[at + t.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
