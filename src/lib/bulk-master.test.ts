import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type SheetDef } from "@/lib/bulk-sheet";
import { productInputFromValues, productSheetDef } from "@/lib/bulk-products";
import { assetInputFromValues, assetSheetDef } from "@/lib/bulk-assets";
import { stockInputFromValues, stockSheetDef, type StockSheetCtx, type StockSheetRow } from "@/lib/bulk-stock";
import type { Product } from "@/lib/commission";
import type { Asset } from "@/lib/sales";

const META = { exportedAt: "x", exportedBy: "y" };

async function run<T>(def: SheetDef<T>, rows: T[], edit: (ws: import("exceljs").Worksheet, col: (h: string) => number) => void) {
  const wb = await buildWorkbook(def, rows, META);
  const col = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);
  edit(wb.getWorksheet("Data")!, col);
  const parsed = await parseWorkbook(def, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const current = new Map(rows.map((r) => [def.id(r), rowValues(def, r)]));
  return { items: diffRows(def, parsed, current), parsed };
}

// ---------- Produk ----------
const prod = (id: string, over: Partial<Product> = {}): Product => ({
  id, code: "aerator-mini", name: "Aerator Mini", type: "unit", price: 7_000_000, hpp: 2_750_000, commission_pct: 0.025, max_discount: 0.05,
  bundle_items: null, promo_price: null, notes: null, valid_from: "2026-01-01", valid_to: null, ...over,
});

describe("file Excel Produk", () => {
  const def = productSheetDef();
  const rows = [prod("p1"), prod("p2", { code: "ebii", name: "EBII", price: 1000, commission_pct: 0.1 })];

  it("persen ditulis sebagai persen & tanpa perubahan = 0 aksi", async () => {
    const wb = await buildWorkbook(def, rows, META);
    expect(wb.getWorksheet("Data")!.getCell(2, 2 + def.columns.findIndex((c) => c.header === "% komisi")).value).toBe(2.5);
    expect((await run(def, rows, () => {})).items.map((i) => i.action)).toEqual(["none", "none"]);
  });

  it("ubah harga & komisi; kolom Kode versi lama tidak bisa diubah", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(2, col("Harga jual")).value = 7_500_000;
      ws.getCell(2, col("% komisi")).value = "3";
      ws.getCell(2, col("Kode")).value = "kode-lain";
    });
    expect(items[0].changes).toEqual([
      { col: "Harga jual", from: "7000000", to: "7500000" },
      { col: "% komisi", from: "2.5", to: "3" },
    ]);
  });

  it("baris baru: versi baru (Kode terisi) atau produk baru (Kode kosong); Tipe di luar daftar = error", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(4, col("Kode")).value = "aerator-mini";
      ws.getCell(4, col("Nama")).value = "Aerator Mini";
      ws.getCell(4, col("Tipe")).value = "Satuan";
      ws.getCell(4, col("Harga jual")).value = 8_000_000;
      ws.getCell(4, col("Berlaku mulai")).value = "01-07-2026";
      ws.getCell(5, col("Nama")).value = "Produk X";
      ws.getCell(5, col("Tipe")).value = "Paket";
      ws.getCell(5, col("Harga jual")).value = 1;
      ws.getCell(5, col("Berlaku mulai")).value = "01-07-2026";
    });
    expect(items[2].action).toBe("add");
    expect(items[3].action).toBe("error");
  });

  it("nilai -> isian produk", () => {
    const res = productInputFromValues(rowValues(def, rows[0]));
    expect(res).toMatchObject({ input: { name: "Aerator Mini", type: "unit", price: 7_000_000, commission_pct: 2.5, max_discount: 5, valid_from: "2026-01-01" } });
  });
});

// ---------- Aset ----------
const asset = (id: string, over: Partial<Asset> = {}): Asset =>
  ({
    id, code: `AS-${id}`, name: `Aset ${id}`, category: "aerator", status: "placed", status_since: "2026-10-01T00:00:00Z", received_on: "2026-10-01",
    location: "Jepara", holder: null, value: 5_000_000, useful_life_months: 48, reference: null, lead_id: null, notes: null, registered_on: null,
    disposal_ceo_at: null, disposal_fa_at: null, created_at: "2026-10-01T00:00:00Z", ...over,
  }) as Asset;

describe("file Excel Aset", () => {
  const def = assetSheetDef();
  const rows = [asset("1"), asset("2", { value: null, useful_life_months: null })];

  it("tanpa perubahan = 0 aksi; tidak ada kolom Hapus", async () => {
    const wb = await buildWorkbook(def, rows, META);
    expect((wb.getWorksheet("Data")!.getRow(1).values as unknown[]).slice(1)).not.toContain("Hapus");
    expect((await run(def, rows, () => {})).items.map((i) => i.action)).toEqual(["none", "none"]);
  });

  it("status & kode tidak bisa diubah lewat file; lokasi dan nilai bisa", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(2, col("Status")).value = "Rusak";
      ws.getCell(2, col("Kode")).value = "XX";
      ws.getCell(2, col("Lokasi")).value = "Surabaya";
      ws.getCell(3, col("Nilai perolehan")).value = "Rp1.500.000";
    });
    expect(items[0].changes).toEqual([{ col: "Lokasi", from: "Jepara", to: "Surabaya" }]);
    expect(items[1].changes).toEqual([{ col: "Nilai perolehan", from: "", to: "1500000" }]);
  });

  it("aset baru wajib Nama, Kategori, Tanggal serah terima", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(4, col("Nama")).value = "Tanpa kategori";
      ws.getCell(5, col("Nama")).value = "Lengkap";
      ws.getCell(5, col("Kategori")).value = "Panel surya";
      ws.getCell(5, col("Tanggal serah terima")).value = "10-11-2026";
    });
    expect(items[2].action).toBe("error");
    expect(items[3].action).toBe("add");
  });

  it("nilai -> isian aset; kategori tak dikenal ditolak", () => {
    expect(assetInputFromValues(rowValues(def, rows[0]))).toMatchObject({ input: { category: "aerator", value: 5_000_000, useful_life_months: 48 } });
    expect("problems" in assetInputFromValues({ ...rowValues(def, rows[0]), Kategori: "Mobil" })).toBe(true);
  });
});

// ---------- Stok ----------
describe("file Excel Stok", () => {
  const ctx: StockSheetCtx = { products: [{ code: "AER-1", name: "Aerator Satu" }] };
  const def = stockSheetDef(ctx);
  const item = (id: string, over = {}) => ({ id, code: `BRG-${id}`, name: `Barang ${id}`, product_code: "AER-1", unit: "unit", min_qty: 2, notes: null, is_active: true, ...over });
  const rows: StockSheetRow[] = [
    { item: item("1"), onHand: 17 },
    { item: item("2", { is_active: false, product_code: null }), onHand: 0 },
  ];

  it("tanpa perubahan = 0 aksi; Hitung fisik kosong saat ekspor; Nonaktif = kebalikan Aktif", async () => {
    const wb = await buildWorkbook(def, rows, META);
    const ws = wb.getWorksheet("Data")!;
    const col = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);
    expect(ws.getCell(2, col("Hitung fisik")).value ?? "").toBe("");
    expect(ws.getCell(2, col("Nonaktif")).value).toBe("Tidak");
    expect(ws.getCell(3, col("Nonaktif")).value).toBe("Ya");
    expect((await run(def, rows, () => {})).items.map((i) => i.action)).toEqual(["none", "none"]);
  });

  it("isi Hitung fisik = perubahan opname; Stok tercatat bacaan-saja", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(2, col("Hitung fisik")).value = 20;
      ws.getCell(3, col("Stok tercatat")).value = 999;
    });
    expect(items[0]).toMatchObject({ action: "update", changes: [{ col: "Hitung fisik", from: "", to: "20" }] });
    expect(items[1].action).toBe("none");
  });

  it("barang baru: Kode dan Nama wajib; nilai -> isian barang", async () => {
    const { items } = await run(def, rows, (ws, col) => {
      ws.getCell(4, col("Nama")).value = "Tanpa kode";
      ws.getCell(5, col("Kode")).value = "NEW-1";
      ws.getCell(5, col("Nama")).value = "Baru";
      ws.getCell(5, col("Produk")).value = "Aerator Satu";
    });
    expect(items[2].action).toBe("error");
    expect(items[3].action).toBe("add");
    expect(stockInputFromValues(rowValues(def, rows[0]), ctx)).toMatchObject({ input: { code: "BRG-1", product_code: "AER-1", min_qty: 2, is_active: true } });
    expect(stockInputFromValues(rowValues(def, rows[1]), ctx)).toMatchObject({ input: { product_code: "", is_active: false } });
  });
});
