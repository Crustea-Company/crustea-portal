// Definisi file Excel untuk Realisasi KPI satu kuartal (ekspor–ubah–impor massal). Fungsi murni.
// Hanya angka realisasi, keterangannya, centang selesai, dan catatan yang bisa diubah; item KPI tidak bisa ditambah/dihapus lewat file.
import type { SheetDef } from "./bulk-sheet";
import { quarterParam, type KpiItem, type KpiRealization, type Quarter } from "./kpi";

export type KpiSheetRow = { item: KpiItem; real: KpiRealization | null };

export const kpiSheetKind = (q: Quarter) => `kpi-${quarterParam(q)}`;

export const KH = {
  dept: "Departemen",
  objective: "Objective",
  item: "Item",
  pic: "PIC",
  target: "Target",
  value: "Realisasi",
  valueNote: "Keterangan realisasi",
  done: "Selesai",
  note: "Catatan",
} as const;

export function kpiSheetDef(q: Quarter): SheetDef<KpiSheetRow> {
  return {
    kind: kpiSheetKind(q),
    title: `Realisasi KPI ${q.year} Q${q.quarter}`,
    id: (r) => String(r.item.id),
    allowDelete: false,
    allowAdd: false,
    labelHeader: KH.item,
    instructions: [
      `Realisasi di file ini untuk kuartal Q${q.quarter} ${q.year}. Isi angka saja (mis. 12 atau 2,5). Mengosongkan Realisasi = menghapus realisasi kuartal itu.`,
      "Keterangan realisasi hanya bisa diisi bila Realisasi terisi. Selesai: Ya / Tidak. Catatan = catatan realisasi item.",
      "Item KPI tidak bisa ditambah atau dihapus lewat file; itu tetap lewat form di halaman KPI.",
      "Hak mengisi tetap mengikuti aturan aplikasi (PIC, head departemen, admin, CEO): baris yang tidak boleh Anda ubah akan dilewati saat impor.",
    ],
    columns: [
      { header: KH.dept, kind: "text", get: (r) => r.item.dept_code, readOnly: true, width: 12 },
      { header: KH.objective, kind: "text", get: (r) => `${r.item.objective_code} ${r.item.objective}`, readOnly: true, width: 36 },
      { header: KH.item, kind: "text", get: (r) => r.item.item, readOnly: true, width: 50 },
      { header: KH.pic, kind: "text", get: (r) => (r.item.pic_type === "department" ? `Departemen ${r.item.dept_code}` : (r.item.pic?.full_name ?? "")), readOnly: true, width: 22 },
      {
        header: KH.target,
        kind: "text",
        get: (r) => (r.item.target_value == null ? "" : `${r.item.target_value}${r.item.target_unit ? ` ${r.item.target_unit}` : ""}`),
        readOnly: true,
        width: 16,
      },
      { header: KH.value, kind: "number", get: (r) => r.real?.value ?? null, width: 14 },
      { header: KH.valueNote, kind: "text", get: (r) => r.real?.note ?? "", width: 36 },
      { header: KH.done, kind: "bool", get: (r) => r.item.is_done, width: 10 },
      { header: KH.note, kind: "text", get: (r) => r.item.realization_note ?? "", width: 40 },
    ],
  };
}

export type KpiSheetOp = {
  id: number;
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
};
