import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues } from "@/lib/bulk-sheet";
import { kpiSheetDef, type KpiSheetRow } from "@/lib/bulk-kpi";
import type { KpiItem } from "@/lib/kpi";

const item = (id: number, over: Partial<KpiItem> = {}): KpiItem => ({
  id, objective_code: "O1", objective: "Naikkan penjualan", dept_code: "BDS", item: `Item ${id}`, pic_type: "person", pic_id: "e1",
  target_value: 10, target_unit: "unit", target_period: null, target_weeks: null, is_done: false, realization_note: null,
  updated_at: null, pic: { full_name: "Budi" }, editor: null, ...over,
});
const rows: KpiSheetRow[] = [
  { item: item(1), real: { kpi_id: 1, year: 2026, quarter: 4, value: 3, note: "awal" } },
  { item: item(2), real: null },
];
const q = { year: 2026, quarter: 4 };
const def = kpiSheetDef(q);
const META = { exportedAt: "x", exportedBy: "y" };
const current = new Map(rows.map((r) => [String(r.item.id), rowValues(def, r)]));

async function parse(wb: Awaited<ReturnType<typeof buildWorkbook<KpiSheetRow>>>, d = def) {
  return parseWorkbook(d, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
const col = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);

describe("file Excel Realisasi KPI", () => {
  it("tanpa perubahan = 0 aksi", async () => {
    const parsed = await parse(await buildWorkbook(def, rows, META));
    expect(diffRows(def, parsed, current).map((i) => i.action)).toEqual(["none", "none"]);
  });

  it("isi realisasi, ubah selesai: hanya kolom itu yang berubah", async () => {
    const wb = await buildWorkbook(def, rows, META);
    const ws = wb.getWorksheet("Data")!;
    ws.getCell(3, col("Realisasi")).value = 7;
    ws.getCell(3, col("Selesai")).value = "Ya";
    const items = diffRows(def, await parse(wb), current);
    expect(items[1]).toMatchObject({ action: "update", label: "Item 2", changes: [{ col: "Realisasi", from: "", to: "7" }, { col: "Selesai", from: "Tidak", to: "Ya" }] });
  });

  it("mengosongkan realisasi = perubahan ke kosong (artinya hapus)", async () => {
    const wb = await buildWorkbook(def, rows, META);
    wb.getWorksheet("Data")!.getCell(2, col("Realisasi")).value = null;
    const items = diffRows(def, await parse(wb), current);
    expect(items[0].changes).toEqual([{ col: "Realisasi", from: "3", to: "" }]);
  });

  it("kolom bacaan-saja (Item, Target) diabaikan", async () => {
    const wb = await buildWorkbook(def, rows, META);
    wb.getWorksheet("Data")!.getCell(2, col("Item")).value = "Diubah";
    expect(diffRows(def, await parse(wb), current)[0].action).toBe("none");
  });

  it("baris baru ditolak; ID tak dikenal = error; tidak ada kolom Hapus", async () => {
    const wb = await buildWorkbook(def, rows, META);
    const ws = wb.getWorksheet("Data")!;
    ws.getCell(4, col("Realisasi")).value = 5; // baris baru, ID kosong
    ws.getCell(3, 1).value = "999";
    ws.getCell(3, col("Realisasi")).value = 1;
    const items = diffRows(def, await parse(wb), current);
    expect(items[2].action).toBe("error");
    expect(items[1].action).toBe("error");
    expect((ws.getRow(1).values as unknown[]).slice(1)).not.toContain("Hapus");
  });

  it("file kuartal lain ditolak", async () => {
    const other = kpiSheetDef({ year: 2026, quarter: 3 });
    const wb = await buildWorkbook(other, rows, META);
    await expect(parse(wb)).rejects.toThrow("bukan untuk");
  });
});
