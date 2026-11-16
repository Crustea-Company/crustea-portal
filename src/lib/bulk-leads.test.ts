import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues } from "@/lib/bulk-sheet";
import { leadInputFromValues, leadPeople, leadSheetDef, type LeadSheetCtx } from "@/lib/bulk-leads";
import type { Lead } from "@/lib/sales";

const ctx: LeadSheetCtx = {
  products: [{ code: "AER-1", name: "Aerator Satu" }, { code: "EBI-1", name: "EBII Satu" }],
  employees: [{ id: "e1", full_name: "Budi Santoso" }, { id: "e2", full_name: "Siti Aminah" }],
};
const lead = (id: string, over: Partial<Lead> = {}): Lead =>
  ({
    id, number: `LD-2026-00${id}`, lead_date: "2026-11-01", source: "dm", referral_code: null, referral_id: null, customer: `Cust ${id}`,
    contact: null, location: null, product_code: "AER-1", units: 2, value: 1000, items: [{ product_code: "AER-1", units: 2, value: 1000 }],
    sales_id: "e1", notes: null, stage: "lead", stage_since: "2026-11-01T00:00:00Z", lost_reason: null, so_number: null, closed_on: null,
    paid_on: null, installed_on: null, created_by: "e1", created_at: "2026-11-01T00:00:00Z", sales: { full_name: "Budi Santoso" }, referral: null, ...over,
  }) as Lead;
const rows: Lead[] = [
  lead("1"),
  lead("2", { items: [{ product_code: "AER-1", units: 1, value: 500 }, { product_code: "EBI-1", units: 1, value: 500 }], units: 2, value: 1000 }),
  lead("3", { stage: "won", closed_on: "2026-11-10", referral_code: "CRU-X" }),
];
const def = leadSheetDef(ctx);
const META = { exportedAt: "x", exportedBy: "y" };
const current = new Map(rows.map((r) => [r.id, rowValues(def, r)]));
const col = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);
async function run(edit: (ws: import("exceljs").Worksheet) => void) {
  const wb = await buildWorkbook(def, rows, META);
  edit(wb.getWorksheet("Data")!);
  const parsed = await parseWorkbook(def, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return diffRows(def, parsed, current, { people: leadPeople(ctx) });
}

describe("file Excel Lead", () => {
  it("tanpa perubahan = 0 aksi, tidak ada kolom Hapus", async () => {
    expect((await run(() => {})).map((i) => i.action)).toEqual(["none", "none", "none"]);
    const wb = await buildWorkbook(def, rows, META);
    expect((wb.getWorksheet("Data")!.getRow(1).values as unknown[]).slice(1)).not.toContain("Hapus");
  });

  it("ubah customer & PIC sales pada lead biasa", async () => {
    const items = await run((ws) => {
      ws.getCell(2, col("Customer")).value = "Baru";
      ws.getCell(2, col("PIC sales")).value = "Siti Aminah";
    });
    expect(items[0].changes).toEqual(
      expect.arrayContaining([{ col: "Customer", from: "Cust 1", to: "Baru" }, expect.objectContaining({ col: "PIC sales", ids: ["e2"] })]),
    );
  });

  it("tahap tidak bisa diubah lewat file (kolom bacaan-saja)", async () => {
    const items = await run((ws) => (ws.getCell(2, col("Tahap")).value = "Lunas"));
    expect(items[0].action).toBe("none");
  });

  it("lead banyak produk: Produk/Unit/Nilai dikunci, kolom lain tetap bisa diubah", async () => {
    const locked = await run((ws) => (ws.getCell(3, col("Nilai")).value = 9999));
    expect(locked[1].action).toBe("error");
    expect(locked[1].problems[0]).toContain("dikunci");
    const mixed = await run((ws) => {
      ws.getCell(3, col("Nilai")).value = 9999;
      ws.getCell(3, col("Lokasi")).value = "Jakarta";
    });
    expect(mixed[1].action).toBe("update");
    expect(mixed[1].changes.map((c) => c.col)).toEqual(["Lokasi"]);
    expect(mixed[1].problems[0]).toContain("dikunci");
  });

  it("setelah closing: produk/unit/nilai/kode referral dikunci", async () => {
    const items = await run((ws) => (ws.getCell(4, col("Kode referral")).value = "CRU-Y"));
    expect(items[2].action).toBe("error");
    const ok = await run((ws) => (ws.getCell(4, col("Kontak")).value = "0812"));
    expect(ok[2].action).toBe("update");
  });

  it("baris baru butuh Tanggal, Sumber, Customer; lainnya diisi", async () => {
    const items = await run((ws) => {
      ws.getCell(5, col("Customer")).value = "Tanpa tanggal";
      ws.getCell(6, col("Tanggal lead")).value = "05-11-2026";
      ws.getCell(6, col("Sumber")).value = "Referral";
      ws.getCell(6, col("Customer")).value = "Lengkap";
      ws.getCell(6, col("Produk")).value = "EBII Satu";
      ws.getCell(6, col("Unit")).value = 3;
    });
    expect(items[3].action).toBe("error");
    expect(items[4].action).toBe("add");
  });

  it("nilai kanonik -> isian lead; lead banyak produk memakai baris produk lama", () => {
    const v = rowValues(def, rows[0]);
    expect(leadInputFromValues(v, ctx, null)).toMatchObject({ input: { source: "dm", sales_id: "e1", items: [{ product_code: "AER-1", units: 2, value: 1000 }] } });
    const res = leadInputFromValues({ ...rowValues(def, rows[1]) }, ctx, rows[1].items);
    expect(res).toMatchObject({ input: { items: rows[1].items } });
    const bad = leadInputFromValues({ ...v, Produk: "Tidak Ada" }, ctx, null);
    expect("problems" in bad).toBe(true);
  });
});
