import { describe, expect, it } from "vitest";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, summarize, type Person, type RowValues, type SheetDef } from "@/lib/bulk-sheet";
import type { Workbook } from "@/lib/xlsx-core";

// Contoh data tugas sederhana; aturan yang dites adalah aturan rencana (bentrok, hapus, ID, nama orang), bukan keluaran kode.
type Row = { id: string; code: string; title: string; status: string; deadline: string; pic: string[]; urgent: boolean; hours: number | null };

const def: SheetDef<Row> = {
  kind: "contoh",
  title: "Contoh",
  id: (r) => r.id,
  allowDelete: true,
  columns: [
    { header: "Kode", kind: "text", get: (r) => r.code, readOnly: true },
    { header: "Judul", kind: "text", get: (r) => r.title, required: true },
    { header: "Status", kind: "choice", get: (r) => r.status, choices: ["Belum Mulai", "Berjalan", "Pending", "Selesai"] },
    { header: "Deadline", kind: "date", get: (r) => r.deadline },
    { header: "PIC", kind: "people", get: (r) => r.pic },
    { header: "Prioritas", kind: "bool", get: (r) => r.urgent },
    { header: "Jam", kind: "number", get: (r) => r.hours },
  ],
};

const people: Person[] = [
  { id: "p1", name: "Budi Santoso" },
  { id: "p2", name: "Siti Aminah" },
  { id: "p3", name: "Andi Wijaya" },
  { id: "p4", name: "Andi Wijaya" }, // nama kembar
];

const rows: Row[] = [
  { id: "a1", code: "T-1", title: "Susun laporan", status: "Berjalan", deadline: "2026-12-01", pic: ["Budi Santoso"], urgent: false, hours: 4 },
  { id: "a2", code: "T-2", title: "Kirim proposal", status: "Belum Mulai", deadline: "2026-12-10", pic: ["Siti Aminah", "Budi Santoso"], urgent: true, hours: null },
  { id: "a3", code: "T-3", title: "Rapat mingguan", status: "Pending", deadline: "", pic: [], urgent: false, hours: 1.5 },
];
const META = { exportedAt: "2026-11-16 09:00", exportedBy: "Athar" };

const currentOf = (data: Row[]) => new Map<string, RowValues>(data.map((r) => [r.id, rowValues(def, r)]));

async function exported(data: Row[] = rows): Promise<Workbook> {
  return buildWorkbook(def, data, META);
}
async function parse(wb: Workbook) {
  const buf = await wb.xlsx.writeBuffer();
  return parseWorkbook(def, buf as ArrayBuffer);
}
// Nomor kolom di lembar Data: A = ID, lalu kolom def berurutan, terakhir Hapus.
const colOf = (h: string) => 2 + def.columns.findIndex((c) => c.header === h);
const HAPUS_COL = 2 + def.columns.length;
function setCell(wb: Workbook, line: number, header: string, value: unknown) {
  wb.getWorksheet("Data")!.getCell(line, header === "Hapus" ? HAPUS_COL : header === "ID" ? 1 : colOf(header)).value = value as never;
}
async function diff(wb: Workbook, current = currentOf(rows)) {
  const parsed = await parse(wb);
  return { parsed, items: diffRows(def, parsed, current, { people }) };
}

describe("ekspor lalu impor tanpa perubahan", () => {
  it("tidak ada aksi sama sekali", async () => {
    const { items } = await diff(await exported());
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.action === "none")).toBe(true);
  });

  it("lembar _asal tersembunyi & membawa jenis file", async () => {
    const wb = await exported();
    expect(wb.getWorksheet("_asal")!.state).toBe("hidden");
    const parsed = await parse(wb);
    expect(parsed.meta).toMatchObject({ kind: "contoh", exportedBy: "Athar" });
  });
});

describe("mengubah sel", () => {
  it("ubah satu sel = satu aksi ubah dengan sebelum -> sesudah", async () => {
    const wb = await exported();
    setCell(wb, 3, "Status", "Selesai"); // baris 3 = a2
    const { items } = await diff(wb);
    const changed = items.filter((i) => i.action !== "none");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ action: "update", id: "a2", changes: [{ col: "Status", from: "Belum Mulai", to: "Selesai" }] });
    expect(changed[0].target?.Judul).toBe("Kirim proposal"); // kolom lain tetap
  });

  it("tanggal teks 15-12-2026 dan tanggal Excel asli sama-sama dibaca", async () => {
    const wb = await exported();
    setCell(wb, 2, "Deadline", "15-12-2026");
    setCell(wb, 3, "Deadline", new Date("2026-12-20T00:00:00Z"));
    const { items } = await diff(wb);
    expect(items[0].changes).toEqual([{ col: "Deadline", from: "2026-12-01", to: "2026-12-15" }]);
    expect(items[1].changes).toEqual([{ col: "Deadline", from: "2026-12-10", to: "2026-12-20" }]);
  });

  it("tanggal ngawur = error, bukan menebak", async () => {
    const wb = await exported();
    setCell(wb, 2, "Deadline", "besok");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
    expect(items[0].problems[0]).toContain("Deadline");
  });

  it("pilihan di luar daftar = error; huruf besar/kecil diabaikan", async () => {
    const wb = await exported();
    setCell(wb, 2, "Status", "selesai");
    setCell(wb, 3, "Status", "Hampir beres");
    const { items } = await diff(wb);
    expect(items[0].changes[0].to).toBe("Selesai");
    expect(items[1].action).toBe("error");
  });

  it("kolom wajib dikosongkan = error", async () => {
    const wb = await exported();
    setCell(wb, 2, "Judul", "");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
  });

  it("kolom bacaan-saja diabaikan", async () => {
    const wb = await exported();
    setCell(wb, 2, "Kode", "T-999");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("none");
  });

  it("angka format Indonesia dan Ya/Tidak dibaca", async () => {
    const wb = await exported();
    setCell(wb, 2, "Jam", "2,5");
    setCell(wb, 2, "Prioritas", "ya");
    const { items } = await diff(wb);
    expect(items[0].changes).toEqual(
      expect.arrayContaining([
        { col: "Jam", from: "4", to: "2.5" },
        { col: "Prioritas", from: "Tidak", to: "Ya" },
      ]),
    );
  });
});

describe("orang (PIC)", () => {
  it("urutan nama tidak dianggap perubahan", async () => {
    const wb = await exported();
    setCell(wb, 3, "PIC", "Budi Santoso; Siti Aminah");
    const { items } = await diff(wb);
    expect(items[1].action).toBe("none");
  });

  it("nama dikenal -> id ikut terbawa", async () => {
    const wb = await exported();
    setCell(wb, 2, "PIC", "Budi Santoso; Siti Aminah");
    const { items } = await diff(wb);
    expect(items[0].changes[0]).toMatchObject({ col: "PIC", ids: ["p1", "p2"] });
  });

  it("nama tak dikenal = error", async () => {
    const wb = await exported();
    setCell(wb, 2, "PIC", "Orang Asing");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
    expect(items[0].problems[0]).toContain("Orang Asing");
  });

  it("nama kembar = error, tidak menebak", async () => {
    const wb = await exported();
    setCell(wb, 2, "PIC", "Andi Wijaya");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
    expect(items[0].problems[0]).toContain("lebih dari satu");
  });
});

describe("baris baru", () => {
  it("ID kosong = tambah, dengan nilai lengkap", async () => {
    const wb = await exported();
    setCell(wb, 5, "Judul", "Tugas baru");
    setCell(wb, 5, "Status", "Berjalan");
    const { items } = await diff(wb);
    const add = items.find((i) => i.action === "add")!;
    expect(add.id).toBe("");
    expect(add.target).toMatchObject({ Judul: "Tugas baru", Status: "Berjalan" });
    expect(summarize(items).add).toBe(1);
  });

  it("baris baru tanpa judul = error", async () => {
    const wb = await exported();
    setCell(wb, 5, "Status", "Berjalan");
    const { items } = await diff(wb);
    expect(items.find((i) => i.line === 5)!.action).toBe("error");
  });

  it("baris kosong sama sekali diabaikan", async () => {
    const parsed = await parse(await exported());
    expect(parsed.rows).toHaveLength(3);
  });
});

describe("hapus", () => {
  it("hanya kata HAPUS yang menghapus", async () => {
    const wb = await exported();
    setCell(wb, 2, "Hapus", "hapus");
    setCell(wb, 3, "Hapus", "ya");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("delete");
    expect(items[1].action).toBe("error");
  });

  it("baris yang dibuang dari Excel tidak dihapus", async () => {
    const wb = await exported();
    wb.getWorksheet("Data")!.spliceRows(2, 1);
    const { items } = await diff(wb);
    expect(items.map((i) => i.id)).toEqual(["a2", "a3"]);
    expect(items.every((i) => i.action === "none")).toBe(true);
  });

  it("jenis file tanpa hapus: tidak ada kolom Hapus", async () => {
    const noDel: SheetDef<Row> = { ...def, allowDelete: false };
    const wb = await buildWorkbook(noDel, rows, META);
    const headers = (wb.getWorksheet("Data")!.getRow(1).values as unknown[]).slice(1);
    expect(headers).not.toContain("Hapus");
  });

  it("hapus baris yang diubah orang lain sejak ekspor = bentrok", async () => {
    const wb = await exported();
    setCell(wb, 2, "Hapus", "HAPUS");
    const now = structuredClone(rows);
    now[0].title = "Judul diubah orang lain";
    const { items } = await diff(wb, currentOf(now));
    expect(items[0].action).toBe("conflict");
  });
});

describe("bentrok dengan perubahan orang lain", () => {
  it("sel yang sama diubah di portal & di file = bentrok", async () => {
    const wb = await exported();
    setCell(wb, 2, "Status", "Selesai");
    const now = structuredClone(rows);
    now[0].status = "Pending"; // orang lain mengubah status
    const { items } = await diff(wb, currentOf(now));
    expect(items[0].action).toBe("conflict");
    expect(items[0].problems[0]).toContain("Status");
  });

  it("sel berbeda diubah orang lain = tidak bentrok, perubahan orang lain tidak ditimpa", async () => {
    const wb = await exported();
    setCell(wb, 2, "Status", "Selesai");
    const now = structuredClone(rows);
    now[0].title = "Judul baru dari orang lain";
    const { items } = await diff(wb, currentOf(now));
    expect(items[0].action).toBe("update");
    expect(items[0].target?.Judul).toBe("Judul baru dari orang lain");
    expect(items[0].target?.Status).toBe("Selesai");
  });

  it("portal sudah bernilai sama seperti keinginan file = tidak perlu diubah", async () => {
    const wb = await exported();
    setCell(wb, 2, "Status", "Selesai");
    const now = structuredClone(rows);
    now[0].status = "Selesai";
    const { items } = await diff(wb, currentOf(now));
    expect(items[0].action).toBe("none");
  });

  it("data sudah dihapus orang lain = bentrok", async () => {
    const wb = await exported();
    setCell(wb, 2, "Status", "Selesai");
    const { items } = await diff(wb, currentOf(rows.slice(1)));
    expect(items[0].action).toBe("conflict");
  });
});

describe("ID bermasalah", () => {
  it("ID tak dikenal = error", async () => {
    const wb = await exported();
    setCell(wb, 2, "ID", "zzz");
    setCell(wb, 2, "Status", "Selesai");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
    expect(items[0].problems[0]).toContain("ID tidak dikenal");
  });

  it("ID ganda = error di kedua baris", async () => {
    const wb = await exported();
    setCell(wb, 3, "ID", "a1");
    const { items } = await diff(wb);
    expect(items[0].action).toBe("error");
    expect(items[1].action).toBe("error");
    expect(items[0].problems[0]).toContain("2, 3");
  });
});

describe("lembar _asal hilang", () => {
  it("tetap bisa dibaca, ada peringatan, dibandingkan langsung dengan portal", async () => {
    const wb = await exported();
    wb.removeWorksheet("_asal");
    setCell(wb, 2, "Status", "Selesai");
    const { parsed, items } = await diff(wb);
    expect(parsed.original).toBeNull();
    expect(parsed.warnings.join(" ")).toContain("_asal");
    expect(items[0]).toMatchObject({ action: "update", changes: [{ col: "Status", from: "Berjalan", to: "Selesai" }] });
    expect(items[1].action).toBe("none");
  });
});

describe("file salah", () => {
  it("file jenis lain ditolak", async () => {
    const other: SheetDef<Row> = { ...def, kind: "lain" };
    const wb = await buildWorkbook(other, rows, META);
    await expect(parse(wb)).rejects.toThrow("bukan untuk");
  });

  it("tanpa lembar Data ditolak", async () => {
    const wb = await exported();
    wb.removeWorksheet("Data");
    await expect(parse(wb)).rejects.toThrow("Data");
  });

  it("terlalu banyak baris ditolak saat ekspor", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...rows[0], id: `x${i}` }));
    await expect(buildWorkbook(def, many, META)).rejects.toThrow("maksimal");
  });
});
