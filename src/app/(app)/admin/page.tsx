import type { Metadata } from "next";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayJakarta } from "@/lib/format";
import { periodLabel, periodOf, periodRange } from "@/lib/ats";
import PeriodRow, { type PeriodInfo } from "./PeriodRow";

export const metadata: Metadata = { title: "Admin - Crustea Portal" };

const ACTION_LABEL: Record<string, string> = {
  update: "Ubah log",
  delete: "Hapus log",
  lock: "Tutup periode",
  relock: "Kunci ulang periode",
  reopen: "Buka ulang periode",
};

type AuditRow = {
  id: number;
  table_name: string;
  row_id: string;
  action: string;
  old_data: { employee_id?: string; log_date?: string; minutes?: number } | null;
  new_data: { log_date?: string; minutes?: number } | null;
  actor: string | null;
  reason: string | null;
  at: string;
};

export default async function AdminPage() {
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

  const supabase = await createClient();
  const today = todayJakarta();
  const currentPeriod = periodOf(today);

  const [periodsRes, snapshotsRes, employeesRes, auditRes] = await Promise.all([
    supabase.from("periods").select("period_month, locked_at"),
    supabase.from("period_snapshots").select("period_month"),
    supabase.from("employees").select("id, full_name"),
    supabase
      .from("audit_log")
      .select("id, table_name, row_id, action, old_data, new_data, actor, reason, at")
      .order("at", { ascending: false })
      .limit(30),
  ]);

  const error = periodsRes.error ?? snapshotsRes.error ?? employeesRes.error ?? auditRes.error;
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
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">Admin</h1>

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
                    Log {nameOf.get(a.old_data.employee_id ?? "") ?? "?"}, {formatDate(a.old_data.log_date)},{" "}
                    {a.old_data.minutes} menit
                    {a.new_data &&
                      ` → ${formatDate(a.new_data.log_date)}, ${a.new_data.minutes} menit`}
                  </p>
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
    </main>
  );
}
