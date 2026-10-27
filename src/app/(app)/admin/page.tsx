import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayJakarta } from "@/lib/format";
import { periodLabel, periodOf, periodRange } from "@/lib/ats";
import PeriodRow, { type PeriodInfo } from "./PeriodRow";
import EmployeeManager, { type AdminEmployee } from "./EmployeeManager";
import TravelRatesEditor from "./TravelRatesEditor";
import { loadTravelSetup } from "@/lib/travel-data";

export const metadata: Metadata = { title: "Admin - Crustea Portal" };

const ACTION_LABEL: Record<string, string> = {
  update: "Ubah log",
  delete: "Hapus log",
  lock: "Tutup periode",
  relock: "Kunci ulang periode",
  reopen: "Buka ulang periode",
  employee_create: "Tambah karyawan",
  employee_update: "Ubah data karyawan",
  employee_deactivate: "Nonaktifkan karyawan",
  employee_activate: "Aktifkan kembali karyawan",
  employee_delete: "Hapus karyawan",
};

// Kolom data karyawan yang ditampilkan di riwayat (lama -> baru).
const EMPLOYEE_FIELDS: [string, string][] = [
  ["full_name", "Nama"],
  ["email", "Email"],
  ["dept_code", "Departemen"],
  ["job_title", "Jabatan"],
  ["emp_status", "Status kerja"],
  ["app_role", "Peran"],
  ["ats_required", "Wajib ATS"],
  ["grade", "Golongan jabatan"],
  ["is_active", "Aktif"],
  ["left_at", "Tanggal keluar"],
];

const ROLE_NAME: Record<string, string> = { admin: "Admin", ceo: "CEO", head: "Kepala Departemen", staff: "Staf" };

function showEmployeeValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (field === "app_role") return ROLE_NAME[String(value)] ?? String(value);
  if (field === "left_at") return formatDate(String(value));
  return String(value);
}

type AuditRow = {
  id: number;
  table_name: string;
  row_id: string;
  action: string;
  old_data: ({ employee_id?: string; log_date?: string; minutes?: number; period_month?: string } & Record<string, unknown>) | null;
  new_data: ({ log_date?: string; minutes?: number } & Record<string, unknown>) | null;
  actor: string | null;
  reason: string | null;
  at: string;
};

// Link ke log karyawan di periode log tersebut (sebelum diubah). Untuk log yang
// masih ada, sertakan penanda supaya halaman langsung menggulir dan menyorot log itu.
function logLink(a: AuditRow): string {
  const old = a.old_data ?? {};
  const periode = old.period_month ?? (old.log_date ? periodOf(old.log_date) : "");
  const qs = new URLSearchParams({ karyawan: old.employee_id ?? "", periode });
  return `/log-kerja?${qs}${a.action === "update" ? `#log-${a.row_id}` : ""}`;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: "karyawan", label: "Karyawan" },
  { key: "periode", label: "Periode ATS" },
  { key: "dinas", label: "Tarif dinas" },
  { key: "riwayat", label: "Riwayat perubahan" },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  if (me.app_role !== "admin") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Halaman ini khusus admin.
        </p>
      </main>
    );
  }

  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.bagian)?.key ?? "karyawan";

  const supabase = await createClient();
  const today = todayJakarta();
  const currentPeriod = periodOf(today);

  const [periodsRes, snapshotsRes, employeesRes, departmentsRes, travel, auditRes] = await Promise.all([
    supabase.from("periods").select("period_month, locked_at"),
    supabase.from("period_snapshots").select("period_month"),
    supabase
      .from("employees")
      .select("id, email, full_name, dept_code, job_title, emp_status, app_role, ats_required, grade, is_active, left_at")
      .order("full_name"),
    supabase.from("departments").select("code, name").order("code"),
    // tarif dinas: dipakai di tab Karyawan (pilihan golongan) dan tab Tarif dinas
    loadTravelSetup(supabase, todayJakarta()),
    supabase
      .from("audit_log")
      .select("id, table_name, row_id, action, old_data, new_data, actor, reason, at")
      .order("at", { ascending: false })
      .limit(30),
  ]);

  const error = periodsRes.error ?? snapshotsRes.error ?? employeesRes.error ?? departmentsRes.error ?? auditRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat data admin: {error.message}
        </p>
      </main>
    );
  }

  const nameOf = new Map((employeesRes.data ?? []).map((e) => [e.id as string, e.full_name as string]));
  const lockedAt = new Map(
    (periodsRes.data ?? []).map((p) => [p.period_month as string, p.locked_at as string | null]),
  );
  const snapshotCount = new Map<string, number>();
  for (const s of snapshotsRes.data ?? []) {
    snapshotCount.set(s.period_month, (snapshotCount.get(s.period_month) ?? 0) + 1);
  }

  // Daftar periode: Jan 2026 (atau periode tercatat paling awal) s.d. periode berjalan.
  const earliest = [...lockedAt.keys(), "2026-01-01"].sort()[0];
  const periods: PeriodInfo[] = [];
  for (
    let d = new Date(`${currentPeriod}T00:00:00Z`);
    d >= new Date(`${earliest}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1)
  ) {
    const month = d.toISOString().slice(0, 10);
    const { start, end } = periodRange(month);
    const locked = lockedAt.get(month);
    periods.push({
      month,
      label: periodLabel(month),
      range: `${formatDate(start)} - ${formatDate(end)}`,
      state: locked ? "locked" : end >= today ? "running" : "open",
      lockedAt: locked ? formatDateTime(locked) : null,
      snapshotCount: snapshotCount.get(month) ?? 0,
    });
  }

  const audit = (auditRes.data ?? []) as AuditRow[];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">Admin</h1>

      <nav className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?bagian=${t.key}`}
            className={`flex-1 rounded-md px-2 py-1.5 text-center font-medium ${
              tab === t.key ? "bg-brand-700 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "karyawan" && (
        <section>
          <EmployeeManager
            employees={(employeesRes.data ?? []) as AdminEmployee[]}
            departments={departmentsRes.data ?? []}
            grades={travel.rates.map((r) => ({ grade: r.grade, label: r.label }))}
            meId={me.id}
            today={today}
          />
        </section>
      )}

      {tab === "periode" && (
      <section>
        <h2 className="mb-1 font-semibold text-slate-900">Periode ATS</h2>
        <p className="mb-3 text-sm text-slate-600">
          Menutup periode menyimpan ketercapaian setiap karyawan. Nilai yang sudah tersimpan tidak pernah
          dihitung ulang, termasuk saat periode dibuka lalu dikunci lagi.
        </p>
        <ul className="flex flex-col gap-2">
          {periods.map((p) => (
            <PeriodRow key={p.month} period={p} />
          ))}
        </ul>
      </section>
      )}

      {tab === "dinas" && (
        <section>
          <h2 className="mb-1 font-semibold text-slate-900">Tarif perjalanan dinas</h2>
          <p className="mb-3 text-sm text-slate-600">
            Dipakai kalkulator form dinas. Pengajuan yang sudah dikirim tetap memakai tarif saat diajukan.
          </p>
          <TravelRatesEditor rates={travel.rates} params={travel.params} />
        </section>
      )}

      {tab === "riwayat" && (
      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Riwayat perubahan (30 terakhir)</h2>
        {audit.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Belum ada perubahan yang tercatat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {audit.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {ACTION_LABEL[a.action] ?? a.action}
                    {a.table_name === "periods" && ` ${periodLabel(a.row_id)}`}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(a.at)}</p>
                </div>
                {a.table_name === "work_logs" && a.old_data && (
                  <p className="text-xs text-slate-600">
                    Log{" "}
                    <Link
                      href={logLink(a)}
                      className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
                    >
                      {nameOf.get(a.old_data.employee_id ?? "") ?? "?"}, {formatDate(a.old_data.log_date)}
                    </Link>
                    , {a.old_data.minutes} menit
                    {a.new_data &&
                      ` → ${formatDate(a.new_data.log_date)}, ${a.new_data.minutes} menit`}
                  </p>
                )}
                {a.table_name === "employees" && (
                  <div className="text-xs text-slate-600">
                    <p className="font-medium text-slate-800">
                      {String((a.new_data ?? a.old_data)?.full_name ?? "?")}
                    </p>
                    {a.action === "employee_create" && a.new_data && (
                      <p>
                        {showEmployeeValue("dept_code", a.new_data.dept_code)} ·{" "}
                        {showEmployeeValue("emp_status", a.new_data.emp_status)} ·{" "}
                        {showEmployeeValue("app_role", a.new_data.app_role)}
                      </p>
                    )}
                    {a.old_data && a.new_data && (
                      <ul className="mt-0.5 space-y-0.5">
                        {EMPLOYEE_FIELDS.filter(
                          ([f]) => JSON.stringify(a.old_data?.[f] ?? null) !== JSON.stringify(a.new_data?.[f] ?? null),
                        ).map(([f, label]) => (
                          <li key={f}>
                            <span className="font-semibold">{label}:</span> {showEmployeeValue(f, a.old_data?.[f])} →{" "}
                            {showEmployeeValue(f, a.new_data?.[f])}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-600">
                  Oleh: {a.actor ? (nameOf.get(a.actor) ?? "?") : "sistem"}
                  {a.reason && ` · Alasan: ${a.reason}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </main>
  );
}
