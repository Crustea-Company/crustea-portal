// Membaca jurnal transaksi proyek dari Excel (di browser; file tidak diunggah/disimpan):
// 1. Template "Laporan Budidaya Ikan" (sheet DATA_BIAYA_OPERASIONAL; file .xlsb disimpan ulang sebagai .xlsx).
// 2. File hasil "Export ke Excel" jurnal di dashboard.
import type { Worksheet } from "exceljs";
import { cellValue, isoDate, key, text } from "./xlsx-core";
import { TX_KIND_SHORT, type TxKind } from "./project-ledger";
import type { TxInput } from "@/app/(app)/projects/dashboard/actions";

function num(v: unknown): number | null {
  const x = cellValue(v);
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string" || !x.trim()) return null;
  const s = x.replace(/[^\d,.-]/g, "");
  const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Kategori template budidaya -> kategori dashboard.
const TEMPLATE_CATEGORY: Record<string, string> = {
  belibenih: "Benih",
  benih: "Benih",
  pakan: "Pakan",
  obat: "Obat",
  jasa: "Jasa",
  lainlain: "Lain-lain",
  jual: "Penjualan panen",
  panen: "Penjualan panen",
};

type Cols = Partial<Record<
  "date" | "cycle" | "status" | "direction" | "kind" | "category" | "desc" | "qty" | "uom" | "kgsack" | "fishkg" | "price" | "in" | "out" | "pond" | "proof" | "note",
  number
>>;

function findHeader(ws: Worksheet): { row: number; cols: Cols } | null {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const cols: Cols = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      const k = key(text(cell.value));
      if (!k) return;
      if (k === "tanggal") cols.date = c;
      else if (k === "siklus") cols.cycle = c;
      else if (k === "status") cols.status = c;
      else if (k === "jenistransaksi") cols.direction = c;
      else if (k === "jenis") cols.kind = c;
      else if (k === "kategori") cols.category = c;
      else if (k === "uraian") cols.desc = c;
      else if (k === "volume") cols.qty = c;
      else if (k === "satuan") cols.uom = c;
      else if (k.includes("kgtiapsak") || k.includes("kgpersak")) cols.kgsack = c;
      else if (k.includes("ekorperkg")) cols.fishkg = c;
      else if (k === "hargasatuan") cols.price = c;
      else if (k === "masuk") cols.in = c;
      else if (k === "keluar") cols.out = c;
      else if (k === "idkolam") cols.pond = c;
      else if (k === "bukti") cols.proof = c;
      else if (k === "catatan") cols.note = c;
    });
    if (cols.date && cols.desc && (cols.in || cols.out)) return { row: r, cols };
  }
  return null;
}

const KIND_BY_LABEL = new Map((Object.entries(TX_KIND_SHORT) as [TxKind, string][]).map(([k, v]) => [key(v), k]));

export async function readJournalWorkbook(file: File): Promise<{ rows: TxInput[]; warnings: string[] }> {
  if (file.size > 10_000_000) throw new Error("File terlalu besar (maks. 10 MB).");
  if (/\.xlsb$/i.test(file.name)) throw new Error("File .xlsb belum bisa dibaca. Buka di Excel lalu Save As .xlsx.");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("File tidak bisa dibaca. Pastikan formatnya .xlsx.");
  }
  const sheets = [...wb.worksheets].sort((a, b) => {
    const score = (w: Worksheet) => (key(w.name).includes("databiaya") ? 0 : key(w.name) === "jurnal" ? 1 : 2);
    return score(a) - score(b);
  });
  let ws: Worksheet | null = null;
  let header: ReturnType<typeof findHeader> = null;
  for (const w of sheets) {
    header = findHeader(w);
    if (header) {
      ws = w;
      break;
    }
  }
  if (!ws || !header) throw new Error("Kolom TANGGAL, URAIAN, MASUK/KELUAR tidak ditemukan. Pakai sheet DATA_BIAYA_OPERASIONAL dari template budidaya.");
  const c = header.cols;
  const exportFormat = !!c.category; // file Export jurnal: STATUS = Lunas/Belum
  const get = (row: { getCell: (n: number) => { value: unknown } }, col: number | undefined) => (col ? row.getCell(col).value : null);

  const rows: TxInput[] = [];
  const warnings: string[] = [];
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = isoDate(get(row, c.date));
    const desc = text(get(row, c.desc));
    const amountIn = num(get(row, c.in)) ?? 0;
    const amountOut = num(get(row, c.out)) ?? 0;
    if (!date && !desc) continue;
    if (!date || !desc) {
      if (amountIn || amountOut) warnings.push(`Baris ${r} dilewati: tanggal/uraian kosong.`);
      continue;
    }
    if (amountIn <= 0 && amountOut <= 0) {
      warnings.push(`Baris ${r} dilewati: nilai masuk/keluar kosong.`);
      continue;
    }
    let kind: TxKind;
    let category: string;
    let paid = true;
    if (exportFormat) {
      kind = KIND_BY_LABEL.get(key(text(get(row, c.kind)))) ?? (amountIn > 0 ? "income" : "expense");
      category = text(get(row, c.category)) || "Lain-lain";
      paid = key(text(get(row, c.status))) !== "belum";
    } else {
      const raw = text(get(row, c.status));
      category = TEMPLATE_CATEGORY[key(raw)] ?? (raw || "Lain-lain");
      const dir = key(text(get(row, c.direction)));
      kind = dir === "masuk" || (!dir && amountIn > 0) ? (key(raw).includes("modal") ? "capital_in" : "income") : "expense";
    }
    const amount = kind === "income" || kind === "capital_in" ? amountIn || amountOut : amountOut || amountIn;
    const qty = num(get(row, c.qty));
    const price = num(get(row, c.price));
    const pond = text(get(row, c.pond));
    rows.push({
      tx_date: date,
      kind,
      category,
      budget_line_id: "",
      description: desc,
      qty: qty && qty > 0 ? qty : null,
      uom: text(get(row, c.uom)),
      unit_price: qty && qty > 0 && price !== null && price >= 0 ? price : null,
      amount: Math.round(amount),
      cycle: num(get(row, c.cycle)),
      pond: pond === "0" ? "" : pond,
      kg_per_sack: num(get(row, c.kgsack)),
      fish_per_kg: num(get(row, c.fishkg)),
      status: paid ? "paid" : "unpaid",
      proof: text(get(row, c.proof)),
      note: text(get(row, c.note)),
    });
  }
  return { rows, warnings };
}
