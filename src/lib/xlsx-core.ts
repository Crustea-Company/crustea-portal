// Pembantu bersama untuk membaca & membuat file Excel (.xlsx) di browser.
// Dipakai project-xlsx.ts, project-ledger-xlsx.ts, dan bulk-sheet.ts. File tidak pernah dikirim/disimpan di server.
// exceljs dimuat hanya saat dipakai (supaya halaman tetap ringan).
import type { Workbook, Worksheet } from "exceljs";
import { normalizeText } from "./search";

export type { Workbook, Worksheet };

export async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

export async function download(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Memuat workbook dari isi file (ArrayBuffer/Uint8Array). Dipisah dari readWorkbook agar bisa dites tanpa browser.
export async function loadWorkbook(data: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const wb = await newWorkbook();
  try {
    await wb.xlsx.load(data as ArrayBuffer);
  } catch {
    throw new Error("File tidak bisa dibaca. Pastikan formatnya .xlsx (bukan .xls/.csv).");
  }
  return wb;
}

export async function readWorkbook(file: File): Promise<Workbook> {
  if (file.size > 5_000_000) throw new Error("File terlalu besar (maks. 5 MB).");
  return loadWorkbook(await file.arrayBuffer());
}

// Nilai sel apa pun (teks kaya, rumus, link, tanggal) -> teks / angka / tanggal.
export function cellValue(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return v ? "ya" : "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) return cellValue(o.result);
    if (o.text !== undefined) return cellValue(o.text);
  }
  return null; // termasuk sel error (#N/A)
}

export const text = (v: unknown) => {
  const x = cellValue(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  return x == null ? "" : String(x).trim();
};

// Angka; teks "Rp1.500.000" atau "2,5" juga diterima (format Indonesia).
export function num(v: unknown): number {
  const x = cellValue(v);
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x !== "string") return 0;
  const s = x.replace(/[^\d,.-]/g, "");
  // "1.500.000" / "1.500.000,5" = format Indonesia; selain itu koma dianggap desimal ("2,5").
  const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Tanggal Excel asli, teks 2026-12-15, atau 15-12-2026 / 15/12/2026 / 15.12.2026 -> "YYYY-MM-DD"; tidak dikenal -> "".
export function isoDate(v: unknown): string {
  const x = cellValue(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === "number" && x > 20000 && x < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(x) * 86_400_000).toISOString().slice(0, 10);
  const s = typeof x === "string" ? x.trim() : "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

// Judul kolom -> kunci pembanding (abaikan huruf besar, aksen, spasi, tanda baca).
export const key = (s: string) => normalizeText(s).replace(/[^a-z0-9]/g, "");

export function styleHeader(ws: Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// Sheet tabel dengan judul kolom di baris 1; dibaca berdasarkan judul kolom (urutan bebas).
export function readTableSheet(ws: Worksheet | undefined): Map<string, unknown>[] {
  if (!ws) return [];
  const headers = new Map<number, string>();
  ws.getRow(1).eachCell((c, i) => headers.set(i, key(text(c.value))));
  const out: Map<string, unknown>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const m = new Map<string, unknown>();
    row.eachCell((c, j) => {
      const h = headers.get(j);
      if (h && !(typeof c.value === "object" && c.value && "formula" in c.value)) m.set(h, c.value);
    });
    if ([...m.values()].some((v) => text(v) !== "")) out.push(m);
  });
  return out;
}
