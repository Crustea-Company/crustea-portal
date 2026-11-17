// Definisi file Excel untuk Aset (ekspor–ubah–impor massal). Fungsi murni.
// Status aset TIDAK bisa diubah lewat file (punya alur & persetujuan sendiri) dan aset tidak bisa dihapus lewat file.
import { normalizeText } from "./search";
import type { RowValues, SheetDef } from "./bulk-sheet";
import { ASSET_CATEGORIES, ASSET_STATUS_LABEL, type Asset, type AssetCategory } from "./sales";
import type { AssetInput } from "@/app/(app)/aset/actions";

export const AH = {
  code: "Kode",
  status: "Status",
  name: "Nama",
  category: "Kategori",
  received: "Tanggal serah terima",
  location: "Lokasi",
  holder: "Pemegang",
  value: "Nilai perolehan",
  life: "Umur manfaat (bulan)",
  reference: "Referensi",
  notes: "Catatan",
} as const;

export function assetSheetDef(): SheetDef<Asset> {
  return {
    kind: "aset",
    title: "Aset",
    id: (a) => a.id,
    allowDelete: false,
    labelHeader: AH.name,
    instructions: [
      "Status aset TIDAK bisa diubah lewat file (ada alur dan persetujuan sendiri); ubah status di halaman aset. Aset juga tidak bisa dihapus lewat file.",
      "Baris baru = serah terima aset baru: Nama, Kategori, dan Tanggal serah terima wajib (tidak boleh tanggal masa depan). Kode aset dibuat otomatis saat didaftarkan.",
      "Nilai perolehan dan Umur manfaat dalam angka; kosong atau 0 = belum diisi.",
      "Hanya TechOps, Finance, dan admin yang boleh mengubah data aset; yang lain dilewati saat impor.",
    ],
    columns: [
      { header: AH.code, kind: "text", get: (a) => a.code, readOnly: true, width: 14 },
      { header: AH.status, kind: "text", get: (a) => ASSET_STATUS_LABEL[a.status], readOnly: true, width: 24 },
      { header: AH.name, kind: "text", get: (a) => a.name, required: true, width: 34 },
      { header: AH.category, kind: "choice", get: (a) => ASSET_CATEGORIES[a.category], choices: Object.values(ASSET_CATEGORIES), required: true, width: 16 },
      { header: AH.received, kind: "date", get: (a) => a.received_on, required: true, width: 16 },
      { header: AH.location, kind: "text", get: (a) => a.location, width: 24 },
      { header: AH.holder, kind: "text", get: (a) => a.holder, width: 22 },
      { header: AH.value, kind: "number", get: (a) => a.value, width: 18 },
      { header: AH.life, kind: "number", get: (a) => a.useful_life_months, width: 14 },
      { header: AH.reference, kind: "text", get: (a) => a.reference, width: 24 },
      { header: AH.notes, kind: "text", get: (a) => a.notes, width: 34 },
    ],
  };
}

export function assetInputFromValues(v: RowValues): { input: AssetInput } | { problems: string[] } {
  const category = (Object.entries(ASSET_CATEGORIES).find(([, l]) => normalizeText(l) === normalizeText(v[AH.category] ?? ""))?.[0] ?? null) as AssetCategory | null;
  if (!category) return { problems: [`Kategori "${v[AH.category] ?? ""}" tidak dikenal.`] };
  return {
    input: {
      name: v[AH.name] ?? "",
      category,
      received_on: v[AH.received] ?? "",
      location: v[AH.location] ?? "",
      holder: v[AH.holder] ?? "",
      value: Number(v[AH.value] || 0),
      useful_life_months: Number(v[AH.life] || 0),
      reference: v[AH.reference] ?? "",
      notes: v[AH.notes] ?? "",
    },
  };
}

export type AssetSheetOp = {
  op: "add" | "update";
  id: string; // "" untuk baris baru
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
};
