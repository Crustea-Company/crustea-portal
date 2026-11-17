// Definisi file Excel untuk Master barang stok + stok opname (ekspor–ubah–impor massal). Fungsi murni.
// Kolom "Hitung fisik" (kosong saat ekspor): bila diisi, selisihnya dengan stok tercatat dicatat sebagai penyesuaian (opname).
// Barang tidak bisa dihapus lewat file (aplikasi memang tidak punya hapus barang; pakai "Nonaktif").
import type { RowValues, SheetDef } from "./bulk-sheet";
import { normalizeText } from "./search";
import type { StockItem } from "./sales";
import type { StockItemInput } from "@/app/(app)/stok/actions";

export type StockSheetRow = { item: StockItem; onHand: number };
export type StockSheetCtx = { products: { code: string; name: string }[] };

export const SH = {
  code: "Kode",
  name: "Nama",
  product: "Produk",
  unit: "Satuan",
  min: "Stok minimal",
  inactive: "Nonaktif",
  notes: "Catatan",
  onHand: "Stok tercatat",
  count: "Hitung fisik",
} as const;

export const OPNAME_REF = "Opname Excel";

export function stockSheetDef(ctx: StockSheetCtx): SheetDef<StockSheetRow> {
  const productName = new Map(ctx.products.map((p) => [p.code, p.name]));
  return {
    kind: "stok",
    title: "Barang stok & stok opname",
    id: (r) => r.item.id,
    allowDelete: false,
    labelHeader: SH.name,
    instructions: [
      "Master barang: Kode (huruf besar, angka, tanda minus) dan Nama wajib. Produk kosong = komponen tanpa produk. Nonaktif: Ya = barang tidak dipakai lagi; kosong/Tidak = aktif.",
      "STOK OPNAME: isi kolom Hitung fisik dengan jumlah hasil hitung di gudang (kosongkan bila tidak dihitung). Selisih dengan Stok tercatat dicatat otomatis sebagai penyesuaian (opname) hari ini, tercatat atas nama Anda.",
      "Bila stok tercatat berubah sejak ekspor (ada barang masuk/keluar), hitungan itu DILEWATI: ekspor ulang lalu hitung lagi.",
      "Baris baru = barang baru (stok awal 0; isi stok awal lewat form Catat mutasi). Hitung fisik tidak bisa diisi untuk barang baru. Barang tidak bisa dihapus lewat file.",
      "Hanya TechOps, Finance, dan admin yang boleh mengubah stok; yang lain dilewati saat impor.",
    ],
    columns: [
      { header: SH.code, kind: "text", get: (r) => r.item.code, required: true, width: 16 },
      { header: SH.name, kind: "text", get: (r) => r.item.name, required: true, width: 34 },
      { header: SH.product, kind: "choice", get: (r) => (r.item.product_code ? (productName.get(r.item.product_code) ?? r.item.product_code) : ""), choices: ctx.products.map((p) => p.name), width: 30 },
      { header: SH.unit, kind: "text", get: (r) => r.item.unit, width: 10 },
      { header: SH.min, kind: "number", get: (r) => r.item.min_qty, width: 14 },
      { header: SH.inactive, kind: "bool", get: (r) => !r.item.is_active, width: 10 },
      { header: SH.notes, kind: "text", get: (r) => r.item.notes, width: 30 },
      { header: SH.onHand, kind: "number", get: (r) => r.onHand, readOnly: true, width: 14 },
      { header: SH.count, kind: "number", get: () => null, width: 14 },
    ],
  };
}

// Nilai kanonik -> isian barang (sama dengan form; kode & angka dicek ulang oleh saveStockItem).
export function stockInputFromValues(v: RowValues, ctx: StockSheetCtx): { input: StockItemInput } | { problems: string[] } {
  let product_code = "";
  const name = v[SH.product] ?? "";
  if (name) {
    const k = normalizeText(name);
    const hits = ctx.products.filter((p) => normalizeText(p.name) === k || normalizeText(p.code) === k);
    if (hits.length !== 1) return { problems: [hits.length === 0 ? `Produk "${name}" tidak dikenal.` : `Produk "${name}" ada lebih dari satu.`] };
    product_code = hits[0].code;
  }
  return {
    input: {
      code: v[SH.code] ?? "",
      name: v[SH.name] ?? "",
      product_code,
      unit: v[SH.unit] ?? "",
      min_qty: Number(v[SH.min] || 0),
      notes: v[SH.notes] ?? "",
      is_active: v[SH.inactive] !== "Ya",
    },
  };
}

export type StockSheetOp = {
  op: "add" | "update";
  id: string; // "" untuk baris baru
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
  expectOnHand?: string; // stok tercatat saat ekspor/pratinjau; hitungan fisik dilewati bila stok sekarang berbeda
};
