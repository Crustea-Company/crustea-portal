// Definisi file Excel untuk Master produk (ekspor–ubah–impor massal). Fungsi murni.
// Satu baris = satu VERSI harga produk. Produk tidak bisa dihapus lewat file (aplikasi memang tidak punya hapus produk).
import { normalizeText } from "./search";
import type { RowValues, SheetDef } from "./bulk-sheet";
import { PRODUCT_TYPE_LABEL, type Product, type ProductType } from "./commission";
import type { ProductInput } from "@/app/(app)/produk/actions";

export const PH = {
  code: "Kode",
  name: "Nama",
  type: "Tipe",
  price: "Harga jual",
  hpp: "HPP",
  comm: "% komisi",
  disc: "Diskon maks (%)",
  bundle: "Isi bundle",
  promo: "Harga promo",
  notes: "Catatan",
  from: "Berlaku mulai",
  to: "Berlaku sampai",
} as const;

// 0.025 -> 2.5 (persen, dibulatkan agar tidak muncul 2.4999999)
const pct = (fraction: number) => Math.round(fraction * 10000) / 100;

export function productSheetDef(): SheetDef<Product> {
  return {
    kind: "produk",
    title: "Master produk",
    id: (p) => p.id,
    allowDelete: false,
    labelHeader: PH.name,
    instructions: [
      "Satu baris = satu versi harga produk. Mengubah baris yang sudah ada = mengoreksi versi itu (berlaku juga untuk klaim komisi yang memakai versi tersebut).",
      "Untuk harga BARU mulai tanggal tertentu: tambah baris baru, isi Kode produk yang sama dengan versi lama, dan Berlaku mulai = tanggal baru (harus setelah tanggal mulai versi lama). Versi lama otomatis ditutup sehari sebelumnya.",
      "Untuk produk yang benar-benar baru: tambah baris baru dan kosongkan Kode (kode dibuat otomatis).",
      "% komisi dan Diskon maks ditulis dalam persen (mis. 2,5). Harga promo kosong = tidak ada promo. Tipe: Satuan atau Bundle.",
      "Hanya admin dan Finance & Accounting yang boleh mengubah master produk; yang lain dilewati saat impor. Produk tidak bisa dihapus lewat file.",
    ],
    columns: [
      { header: PH.code, kind: "text", get: (p) => p.code, addOnly: true, width: 30 },
      { header: PH.name, kind: "text", get: (p) => p.name, required: true, width: 32 },
      { header: PH.type, kind: "choice", get: (p) => PRODUCT_TYPE_LABEL[p.type], choices: Object.values(PRODUCT_TYPE_LABEL), required: true, width: 10 },
      { header: PH.price, kind: "number", get: (p) => p.price, required: true, width: 16 },
      { header: PH.hpp, kind: "number", get: (p) => p.hpp, width: 16 },
      { header: PH.comm, kind: "number", get: (p) => pct(p.commission_pct), width: 11 },
      { header: PH.disc, kind: "number", get: (p) => pct(p.max_discount), width: 14 },
      { header: PH.bundle, kind: "text", get: (p) => p.bundle_items, width: 30 },
      { header: PH.promo, kind: "number", get: (p) => p.promo_price, width: 16 },
      { header: PH.notes, kind: "text", get: (p) => p.notes, width: 30 },
      { header: PH.from, kind: "date", get: (p) => p.valid_from, required: true, width: 14 },
      { header: PH.to, kind: "date", get: (p) => p.valid_to, width: 14 },
    ],
  };
}

// Nilai kanonik -> isian produk (sama dengan form; angka dicek ulang oleh saveProduct).
export function productInputFromValues(v: RowValues): { input: ProductInput } | { problems: string[] } {
  const type = (Object.entries(PRODUCT_TYPE_LABEL).find(([, l]) => normalizeText(l) === normalizeText(v[PH.type] ?? ""))?.[0] ?? null) as ProductType | null;
  if (!type) return { problems: [`Tipe "${v[PH.type] ?? ""}" tidak dikenal (Satuan atau Bundle).`] };
  const n = (h: string) => Number(v[h] || 0);
  return {
    input: {
      name: v[PH.name] ?? "",
      type,
      price: n(PH.price),
      hpp: n(PH.hpp),
      commission_pct: n(PH.comm),
      max_discount: n(PH.disc),
      bundle_items: v[PH.bundle] ?? "",
      promo_price: n(PH.promo),
      notes: v[PH.notes] ?? "",
      valid_from: v[PH.from] ?? "",
      valid_to: v[PH.to] ?? "",
    },
  };
}

export type ProductSheetOp = {
  op: "add" | "update";
  id: string; // "" untuk baris baru
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
};
