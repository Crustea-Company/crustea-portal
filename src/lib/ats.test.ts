import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatHours,
  formatPercent,
  monthlyExpectedHours,
  periodLabel,
  periodLabelWithRange,
  periodOf,
  periodRange,
  weekRange,
  weeklyHours,
} from "@/lib/ats";

// Nilai yang diharapkan berasal dari aturan ATS di CLAUDE.md, bukan dari keluaran kode.

describe("jam mingguan & ekspektasi bulanan", () => {
  it("PKWTT 40 jam, PKWT 20 jam, Intern 20 jam per minggu", () => {
    expect(weeklyHours("PKWTT")).toBe(40);
    expect(weeklyHours("PKWT")).toBe(20);
    expect(weeklyHours("INTERN")).toBe(20);
  });

  it("ekspektasi bulanan = jam mingguan x 4", () => {
    expect(monthlyExpectedHours("PKWTT")).toBe(160);
    expect(monthlyExpectedHours("PKWT")).toBe(80);
    expect(monthlyExpectedHours("INTERN")).toBe(80);
  });
});

describe("periodOf: tgl 29 bulan sebelumnya s.d. tgl 28", () => {
  it("tanggal 1-28 tetap di bulan itu", () => {
    expect(periodOf("2026-10-01")).toBe("2026-10-01");
    expect(periodOf("2026-10-28")).toBe("2026-10-01");
  });

  it("tanggal 29-31 masuk periode bulan berikutnya", () => {
    expect(periodOf("2026-10-29")).toBe("2026-11-01");
    expect(periodOf("2026-10-31")).toBe("2026-11-01");
    expect(periodOf("2026-01-31")).toBe("2026-02-01");
  });

  it("pergantian tahun: 29 Des masuk periode Januari tahun berikutnya", () => {
    expect(periodOf("2026-12-29")).toBe("2027-01-01");
    expect(periodOf("2026-12-31")).toBe("2027-01-01");
  });

  it("Februari: tgl 28 tetap Februari, tgl 29 (kabisat) masuk Maret", () => {
    expect(periodOf("2026-02-28")).toBe("2026-02-01");
    expect(periodOf("2028-02-29")).toBe("2028-03-01");
  });
});

describe("periodRange", () => {
  it("Okt 2026 = 29 Sep s.d. 28 Okt", () => {
    expect(periodRange("2026-10-01")).toEqual({ start: "2026-09-29", end: "2026-10-28" });
  });

  it("Januari mulai 29 Des tahun sebelumnya", () => {
    expect(periodRange("2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-28" });
  });

  it("Maret 2026: Februari tidak punya tgl 29, jadi mulai 1 Maret", () => {
    expect(periodRange("2026-03-01")).toEqual({ start: "2026-03-01", end: "2026-03-28" });
  });

  it("Maret 2028 (Februari kabisat) mulai 29 Feb", () => {
    expect(periodRange("2028-03-01")).toEqual({ start: "2028-02-29", end: "2028-03-28" });
  });

  it("setiap tanggal 2026-2028 jatuh di dalam rentang periodenya sendiri", () => {
    const day = 24 * 60 * 60 * 1000;
    for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2028, 11, 31); t += day) {
      const date = new Date(t).toISOString().slice(0, 10);
      const { start, end } = periodRange(periodOf(date));
      expect(date >= start && date <= end, `${date} di luar ${start}..${end}`).toBe(true);
    }
  });

  it("periode berurutan tidak tumpang tindih dan tidak ada tanggal yang terlewat", () => {
    const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    for (let year = 2026; year <= 2028; year++) {
      for (let month = 1; month <= 11; month++) {
        const a = `${year}-${String(month).padStart(2, "0")}-01`;
        const b = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        expect(next(periodRange(a).end), `${a} -> ${b}`).toBe(periodRange(b).start);
      }
    }
  });
});

describe("weekRange: Senin-Minggu", () => {
  it("Senin sampai Minggu memuat tanggal yang sama", () => {
    const week = { start: "2026-10-26", end: "2026-11-01" };
    expect(weekRange("2026-10-26")).toEqual(week); // Senin
    expect(weekRange("2026-10-28")).toEqual(week); // Rabu
    expect(weekRange("2026-11-01")).toEqual(week); // Minggu tetap di minggu yang sama
  });

  it("Senin berikutnya memulai minggu baru", () => {
    expect(weekRange("2026-11-02")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});

describe("format tampilan", () => {
  it("label periode", () => {
    expect(periodLabel("2026-10-01")).toBe("Okt 2026");
    expect(periodLabelWithRange("2026-10-01")).toBe("Okt 2026 (29 Sep 2026 - 28 Okt 2026)");
  });

  it("jam, persen, dan durasi", () => {
    expect(formatHours(90)).toBe("1,5");
    expect(formatPercent(0.845313)).toBe("84,5%");
    expect(formatDuration(90)).toBe("1 jam 30 menit");
    expect(formatDuration(120)).toBe("2 jam");
    expect(formatDuration(45)).toBe("45 menit");
    expect(formatDuration(0)).toBe("0 menit");
  });
});
