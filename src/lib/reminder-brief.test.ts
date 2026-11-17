import { describe, expect, it } from "vitest";
import {
  bucketOf,
  formatDayLong,
  groupFlash,
  toWhatsApp,
  type FlashItem,
} from "@/lib/reminder-brief";

const TODAY = "2026-11-16"; // Senin

function item(over: Partial<FlashItem>): FlashItem {
  return {
    kind: "task",
    id: "x",
    code: "",
    title: "Tugas",
    dept_code: "BDS",
    people: ["Budi"],
    due: TODAY,
    href: "/tugas",
    ...over,
  };
}

describe("bucketOf", () => {
  it("memilah batas tiap kelompok", () => {
    expect(bucketOf("2026-11-16", TODAY)).toBe("today"); // H-0
    expect(bucketOf("2026-11-17", TODAY)).toBe("tomorrow"); // H+1
    expect(bucketOf("2026-11-18", TODAY)).toBe("soon"); // H+2
    expect(bucketOf("2026-11-19", TODAY)).toBe("soon"); // H+3
    expect(bucketOf("2026-11-20", TODAY)).toBeNull(); // H+4
    expect(bucketOf("2026-11-15", TODAY)).toBe("late"); // lewat 1
    expect(bucketOf("2026-11-09", TODAY)).toBe("late"); // lewat 7
    expect(bucketOf("2026-11-08", TODAY)).toBe("old"); // lewat 8
  });

  it("aman melewati pergantian bulan dan tahun", () => {
    expect(bucketOf("2027-01-02", "2026-12-31")).toBe("soon");
    expect(bucketOf("2026-12-25", "2027-01-01")).toBe("late");
  });
});

describe("formatDayLong", () => {
  it("memakai nama hari dan bulan Indonesia", () => {
    expect(formatDayLong("2026-11-16")).toBe("Senin, 16 Nov 2026");
    expect(formatDayLong("2026-08-01")).toBe("Sabtu, 1 Agu 2026");
  });
});

describe("groupFlash", () => {
  it("mengurutkan departemen, kelompok, tenggat, lalu judul", () => {
    const groups = groupFlash(
      [
        item({ id: "1", dept_code: "TO", title: "Z" }),
        item({ id: "2", dept_code: "BDS", title: "B", due: "2026-11-18" }),
        item({ id: "3", dept_code: "BDS", title: "A", due: "2026-11-18" }),
        item({ id: "4", dept_code: "BDS", title: "C", due: "2026-11-17" }),
        item({ id: "5", dept_code: "MGT", title: "M" }),
        item({ id: "6", dept_code: "ZZ", title: "Q" }),
        item({ id: "7", dept_code: "BDS", title: "Di luar", due: "2026-11-25" }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.dept)).toEqual(["MGT", "BDS", "TO", "ZZ"]);
    const bds = groups[1];
    expect(bds.label).toBe("Busdev & Sales");
    expect(bds.buckets.tomorrow.map((i) => i.title)).toEqual(["C"]);
    expect(bds.buckets.soon.map((i) => i.title)).toEqual(["A", "B"]);
    expect(groups[3].label).toBe("ZZ"); // kode tak dikenal
    expect(groups[0].label).toBe("Management");
  });

  it("hanya menghitung yang terlambat lebih dari 7 hari", () => {
    const groups = groupFlash(
      [
        item({ id: "1", due: "2026-11-01" }),
        item({ id: "2", due: "2026-10-01" }),
        item({ id: "3", due: "2026-11-14" }),
      ],
      TODAY,
    );
    expect(groups[0].oldCount).toBe(2);
    expect(groups[0].buckets.late).toHaveLength(1);
  });
});

describe("toWhatsApp", () => {
  it("menulis format WhatsApp tanpa kode tugas", () => {
    const groups = groupFlash(
      [
        item({ title: "Kirim penawaran aerator", due: "2026-11-14" }),
        item({ id: "2", title: "Rapat mingguan", due: TODAY }),
        item({ id: "3", title: "Survei", due: "2026-11-17" }),
        item({ id: "4", title: "Laporan", due: "2026-11-19" }),
        item({ id: "5", due: "2026-10-01" }),
      ],
      TODAY,
    );
    const [msg] = toWhatsApp(groups, TODAY, "", "https://internal.crustea.id");
    expect(msg).toContain("*Reminder Crustea* · Senin, 16 Nov 2026");
    expect(msg).toContain("*Busdev & Sales*");
    expect(msg).toContain("🔴 Terlambat\n• Kirim penawaran aerator — Budi (lewat 2 hari)");
    expect(msg).toContain("🟠 Hari ini\n• Rapat mingguan — Budi");
    expect(msg).toContain("🟡 Besok");
    expect(msg).toContain("🟢 2-3 hari lagi");
    expect(msg).toContain("_+1 pekerjaan terlambat lebih dari 7 hari_");
    expect(msg).toContain("Lead penjualan: https://internal.crustea.id/penjualan");
    expect(msg).toContain("Project: https://internal.crustea.id/projects");
    expect(msg).toContain("Semua tugas: https://internal.crustea.id/tugas");
  });

  it("menulis pengajuan dengan nomor, tanpa judul bebas dan tanpa rupiah", () => {
    const groups = groupFlash(
      [
        item({
          kind: "request",
          code: "PP-0012",
          title: "Permintaan pembayaran",
          dept_code: "FA",
          people: ["Siti"],
          waitingOn: "Review F&A",
          due: TODAY,
        }),
      ],
      TODAY,
    );
    const [msg] = toWhatsApp(groups, TODAY);
    expect(msg).toContain("• PP-0012 Permintaan pembayaran — menunggu: Review F&A (SLA hari ini)");
    expect(msg).not.toContain("Siti");
    expect(msg).not.toMatch(/Rp/);
  });

  it("memotong pesan panjang per departemen, tiap potongan <= 3.500 huruf", () => {
    const many = (dept: string) =>
      Array.from({ length: 40 }, (_, i) =>
        item({
          id: `${dept}${i}`,
          dept_code: dept,
          title: `Pekerjaan nomor ${i} dengan judul yang cukup panjang supaya pesan membesar`,
        }),
      );
    const groups = groupFlash([...many("BDS"), ...many("AQ"), ...many("TO")], TODAY);
    const msgs = toWhatsApp(groups, TODAY);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(3500);
    expect(msgs[0]).toContain("*Reminder Crustea*");
    expect(msgs.at(-1)).toContain("Semua tugas:");
    // tiap departemen tetap lengkap
    const all = msgs.join("\n");
    expect(all.match(/Pekerjaan nomor/g)).toHaveLength(120);
  });

  it("satu kalimat bila tidak ada isi", () => {
    const [msg] = toWhatsApp(groupFlash([], TODAY), TODAY);
    expect(msg).toContain("Tidak ada tenggat dalam 3 hari ke depan.");
    expect(msg).not.toContain("🔴");
  });

  it("departemen tanpa isi dilewati", () => {
    const groups = groupFlash([item({ dept_code: "TO", due: "2026-11-30" })], TODAY);
    expect(groups).toHaveLength(0);
  });
});
