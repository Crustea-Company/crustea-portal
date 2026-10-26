// Aturan ATS (log kerja harian) dari CLAUDE.md. Semua tanggal berformat "YYYY-MM-DD".

import type { Employee } from "@/lib/auth";
import { formatDate } from "@/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

// Jam mingguan: PKWTT 40, PKWT 20, Intern 20 (sama dengan fungsi weekly_hours di database).
export function weeklyHours(status: Employee["emp_status"]): number {
  return status === "PKWTT" ? 40 : 20;
}

// Ekspektasi bulanan = jam mingguan x 4.
export function monthlyExpectedHours(status: Employee["emp_status"]): number {
  return weeklyHours(status) * 4;
}

// Periode = tgl 29 bulan sebelumnya s.d. tgl 28. Tgl 29-31 masuk bulan berikutnya
// (sama dengan fungsi period_of di database). Hasil: tanggal 1 bulan periode.
export function periodOf(date: string): string {
  const d = toDate(date);
  const shift = d.getUTCDate() > 28 ? 1 : 0;
  return toStr(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 1)));
}

// Tanggal awal dan akhir sebuah periode.
export function periodRange(periodMonth: string): { start: string; end: string } {
  const p = toDate(periodMonth);
  const y = p.getUTCFullYear();
  const m = p.getUTCMonth();
  const daysInPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = daysInPrev >= 29 ? new Date(Date.UTC(y, m - 1, 29)) : new Date(Date.UTC(y, m, 1));
  return { start: toStr(start), end: toStr(new Date(Date.UTC(y, m, 28))) };
}

// "2026-10-01" -> "Okt 2026"
export function periodLabel(periodMonth: string): string {
  const p = toDate(periodMonth);
  return `${MONTHS[p.getUTCMonth()]} ${p.getUTCFullYear()}`;
}

// "Okt 2026 (29 Sep 2026 - 28 Okt 2026)"
export function periodLabelWithRange(periodMonth: string): string {
  const { start, end } = periodRange(periodMonth);
  return `${periodLabel(periodMonth)} (${formatDate(start)} - ${formatDate(end)})`;
}

// Minggu Senin-Minggu yang memuat tanggal tersebut.
export function weekRange(date: string): { start: string; end: string } {
  const d = toDate(date);
  const offset = (d.getUTCDay() + 6) % 7; // Senin = 0
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - offset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: toStr(start), end: toStr(end) };
}

// 90 -> "1,5"
export function formatHours(minutes: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(minutes / 60);
}

// 0.845313 -> "84,5%"
export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

// 90 -> "1 jam 30 menit"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} jam ${m} menit`;
  if (h) return `${h} jam`;
  return `${m} menit`;
}
