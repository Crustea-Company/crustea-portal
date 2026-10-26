// Format tampilan gaya Indonesia.

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// "2026-10-26" -> "26 Okt 2026"
export function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

// Tanggal hari ini di zona waktu WIB, format "YYYY-MM-DD".
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
}

// 1234567 -> "1.234.567"
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}
