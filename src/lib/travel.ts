// Penugasan perjalanan dinas: tarif, parameter, dan kalkulator (rumus dari FORM-HR-02).
// Lihat migrations/009_perjalanan_dinas.sql dan docs/fase-2-3/04-perjalanan-dinas.md.
// Dipakai di form (angka langsung berubah) dan di server action (dihitung ulang sebelum disimpan).

export type TravelRate = {
  grade: string;
  label: string;
  sort: number;
  daily: number;
  hotel: number;
  local_transport: number;
  representation: number; // 0 = tidak ada plafon representasi
};

export type TravelParams = {
  min_notice_days: number;
  report_days: number;
  local_km: number;
  province_km: number;
  private_km_rate: number;
};

export const TRAVEL_PARAM_KEYS = ["min_notice_days", "report_days", "local_km", "province_km", "private_km_rate"] as const;

export type TravelZone = "local" | "province" | "outside";

export const ZONE_LABEL: Record<TravelZone, string> = {
  local: "Lokal",
  province: "Dalam provinsi",
  outside: "Luar provinsi",
};

export const LOCAL_ZONE_NOTE =
  "Zona lokal tanpa uang harian: transport Rp30.000–100.000 dan makan Rp50.000–100.000 sesuai nota.";

// Isian form (bagian A. Penugasan).
export type TravelInput = {
  assigner_id: string;
  destination: string;
  target: string;
  depart_date: string;
  return_date: string;
  distance_km: number;
  province_factor: number; // 70-100 (%), dipakai hanya untuk zona dalam provinsi
  ticket: number;
  private_km: number;
  representation: number;
  advance: boolean;
  emergency_reason: string; // wajib bila tenggat tidak terpenuhi
};

export type TravelCalc = {
  days: number;
  notice_days: number;
  meets_notice: boolean;
  zone: TravelZone;
  factor: number; // 0-1
  daily_total: number;
  nights: number;
  hotel: number;
  local_transport: number;
  private_vehicle: number;
  ticket: number;
  representation: number;
  total: number;
  report_due: string; // batas FPTD & laporan misi
};

// Disimpan di requests.data: isian + golongan + tarif yang dipakai + hasil hitung.
export type TravelData = Omit<TravelInput, "assigner_id"> & {
  form_date: string;
  assigner_name: string;
  assigner_title: string;
  grade: string;
  grade_label: string;
  rate: TravelRate;
  calc: TravelCalc;
};

// ---------- Tanggal & hari kerja (Senin-Jumat, tanpa libur di tabel holidays) ----------

function toDay(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
}

function fromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function isWorkday(day: number, holidays: Set<string>): boolean {
  const dow = new Date(day * 86_400_000).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(fromDay(day));
}

// Seperti WORKDAY() di Excel: n hari kerja setelah tanggal.
export function workdayAdd(iso: string, n: number, holidays: Set<string>): string {
  let day = toDay(iso);
  let left = n;
  while (left > 0) {
    day += 1;
    if (isWorkday(day, holidays)) left -= 1;
  }
  return fromDay(day);
}

// Jumlah hari kerja setelah `from` sampai dengan `to`.
export function workdaysBetween(from: string, to: string, holidays: Set<string>): number {
  let count = 0;
  for (let day = toDay(from) + 1; day <= toDay(to); day++) if (isWorkday(day, holidays)) count++;
  return count;
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// ---------- Kalkulator ----------

export function zoneOf(km: number, params: TravelParams): TravelZone {
  if (km <= params.local_km) return "local";
  if (km <= params.province_km) return "province";
  return "outside";
}

// null bila tanggal belum lengkap / tanggal kembali sebelum berangkat.
export function calcTravel(
  input: TravelInput,
  rate: TravelRate,
  params: TravelParams,
  formDate: string,
  holidays: Set<string>,
): TravelCalc | null {
  if (!isIsoDate(input.depart_date) || !isIsoDate(input.return_date)) return null;
  const days = toDay(input.return_date) - toDay(input.depart_date) + 1;
  if (days < 1) return null;

  const notice_days = workdaysBetween(formDate, input.depart_date, holidays);
  const zone = zoneOf(input.distance_km, params);
  const factor = zone === "local" ? 0 : zone === "province" ? input.province_factor / 100 : 1;
  const nights = Math.max(days - 1, 0);
  const daily_total = Math.round(rate.daily * factor * days);
  const hotel = rate.hotel * nights;
  const local_transport = rate.local_transport * days;
  const private_vehicle = input.private_km * params.private_km_rate;

  return {
    days,
    notice_days,
    meets_notice: notice_days >= params.min_notice_days,
    zone,
    factor,
    daily_total,
    nights,
    hotel,
    local_transport,
    private_vehicle,
    ticket: input.ticket,
    representation: input.representation,
    total: daily_total + hotel + local_transport + input.ticket + private_vehicle + input.representation,
    report_due: workdayAdd(input.return_date, params.report_days, holidays),
  };
}

// Golongan bawaan bila admin belum memilih (sama dengan default_grade() di database).
export function defaultGrade(role: string, status: string): string {
  if (role === "ceo") return "director";
  if (role === "head" || role === "admin") return "head";
  if (status === "INTERN") return "intern";
  if (status === "PKWT") return "staff_pt";
  return "staff_ft";
}
