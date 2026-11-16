import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues } from "@/lib/bulk-sheet";
import { milestoneFromValues, milestonePeople, milestoneSheetDef, type MilestoneSheetCtx, type MilestoneSheetRow } from "@/lib/bulk-milestones";

const ctx: MilestoneSheetCtx = {
  programs: [{ id: "p1", name: "Program A" }, { id: "p2", name: "Program B" }],
  employees: [{ id: "e1", full_name: "Budi Santoso" }, { id: "e2", full_name: "Siti Aminah" }],
};
const rows: MilestoneSheetRow[] = [
  { m: { id: 1, title: "Kick-off", due_date: "2026-12-01", pic_id: "e1", done_at: null, pic: { full_name: "Budi Santoso" } }, programId: "p1", programName: "Program A" },
  { m: { id: 2, title: "Review", due_date: null, pic_id: null, done_at: "2026-11-01T00:00:00Z", pic: null }, programId: "p2", programName: "Program B" },
];
const def = milestoneSheetDef(ctx);
const META = { exportedAt: "x", exportedBy: "y" };
const current = new Map(rows.map((r) => [String(r.m.id), rowValues(def, r)]));
const col = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);
async function run(edit: (ws: import("exceljs").Worksheet) => void) {
  const wb = await buildWorkbook(def, rows, META);
  edit(wb.getWorksheet("Data")!);
  const parsed = await parseWorkbook(def, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return diffRows(def, parsed, current, { people: milestonePeople(ctx) });
}

describe("file Excel Milestone", () => {
  it("tanpa perubahan = 0 aksi", async () => {
    expect((await run(() => {})).map((i) => i.action)).toEqual(["none", "none"]);
  });

  it("ubah tenggat & tandai selesai", async () => {
    const items = await run((ws) => {
      ws.getCell(2, col("Tenggat")).value = "20-12-2026";
      ws.getCell(2, col("Selesai")).value = "Ya";
    });
    expect(items[0].changes).toEqual([
      { col: "Tenggat", from: "2026-12-01", to: "2026-12-20" },
      { col: "Selesai", from: "Tidak", to: "Ya" },
    ]);
  });

  it("Program milestone yang sudah ada tidak bisa dipindah (diabaikan)", async () => {
    const items = await run((ws) => (ws.getCell(2, col("Program")).value = "Program B"));
    expect(items[0].action).toBe("none");
  });

  it("baris baru wajib memilih Program; Program di luar daftar = error", async () => {
    const items = await run((ws) => {
      ws.getCell(4, col("Judul")).value = "Baru tanpa program";
      ws.getCell(5, col("Judul")).value = "Baru salah program";
      ws.getCell(5, col("Program")).value = "Program Z";
      ws.getCell(6, col("Judul")).value = "Baru benar";
      ws.getCell(6, col("Program")).value = "program a";
    });
    expect(items.slice(2).map((i) => i.action)).toEqual(["error", "error", "add"]);
  });

  it("hapus hanya dengan kata HAPUS", async () => {
    const items = await run((ws) => (ws.getCell(3, 2 + def.columns.length).value = "HAPUS"));
    expect(items[1].action).toBe("delete");
  });

  it("lebih dari satu PIC ditolak saat diterapkan", () => {
    const v = { ...rowValues(def, rows[0]), PIC: "Budi Santoso; Siti Aminah" };
    const res = milestoneFromValues(v, ctx, false);
    expect("problems" in res && res.problems[0]).toContain("satu orang");
  });
});
