import type { Metadata } from "next";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayJakarta } from "@/lib/format";
import {
  formatHours,
  formatPercent,
  monthlyExpectedHours,
  periodLabel,
  periodLabelWithRange,
  periodOf,
  weekRange,
  weeklyHours,
} from "@/lib/ats";
import LogForm from "./LogForm";
import LogList, { type WorkLog } from "./LogList";
import PeriodPicker from "./PeriodPicker";

export const metadata: Metadata = { title: "Log Kerja - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sumMinutes = (rows: { minutes: number }[] | null) =>
  (rows ?? []).reduce((total, r) => total + r.minutes, 0);

export default async function LogKerjaPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const today = todayJakarta();
  const currentPeriod = periodOf(today);
  const week = weekRange(today);

  const params = await searchParams;
  const requested = typeof params.periode === "string" ? params.periode : "";
  const selectedPeriod = /^\d{4}-\d{2}-01$/.test(requested) ? requested : currentPeriod;

  // Selalu batasi ke log milik sendiri: admin, CEO, dan head juga boleh membaca log orang lain.
  const [periodRes, weekRes, listRes, monthsRes, lockedRes, snapshotRes] = await Promise.all([
    supabase.from("work_logs").select("minutes").eq("employee_id", me.id).eq("period_month", currentPeriod),
    supabase
      .from("work_logs")
      .select("minutes")
      .eq("employee_id", me.id)
      .gte("log_date", week.start)
      .lte("log_date", week.end),
    supabase
      .from("work_logs")
      .select("id, log_date, activity, minutes, proof, is_correction")
      .eq("employee_id", me.id)
      .eq("period_month", selectedPeriod)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("work_logs").select("period_month").eq("employee_id", me.id),
    supabase.from("periods").select("period_month").not("locked_at", "is", null),
    supabase
      .from("period_snapshots")
      .select("period_month, emp_status, total_hours, expected_hours, achievement, source, locked_at")
      .eq("employee_id", me.id)
      .order("period_month", { ascending: false }),
  ]);

  const error =
    periodRes.error ?? weekRes.error ?? listRes.error ?? monthsRes.error ?? lockedRes.error ?? snapshotRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat log kerja: {error.message}
        </p>
      </main>
    );
  }

  const weekTarget = weeklyHours(me.emp_status) * 60;
  const weekDone = sumMinutes(weekRes.data);
  const weekLeft = weekTarget - weekDone;

  const periodTarget = monthlyExpectedHours(me.emp_status) * 60;
  const periodDone = sumMinutes(periodRes.data);
  const achievement = periodDone / periodTarget;

  const lockedPeriods = new Set((lockedRes.data ?? []).map((p) => p.period_month as string));
  const periodOptions = [
    ...new Set([currentPeriod, selectedPeriod, ...(monthsRes.data ?? []).map((r) => r.period_month as string)]),
  ].sort((a, b) => b.localeCompare(a));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Log Kerja</h1>
        {!me.ats_required && (
          <p className="mt-1 text-sm text-slate-500">
            Posisi Anda tidak wajib ATS dan tidak masuk laporan ketercapaian, tetapi tetap bisa mencatat.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Sisa jam minggu ini</p>
          {weekLeft > 0 ? (
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {formatHours(weekLeft)} <span className="text-base font-medium">jam</span>
            </p>
          ) : (
            <p className="mt-1 text-2xl font-bold text-teal-700">Target tercapai</p>
          )}
          <p className="mt-1 text-sm text-slate-600">
            Sudah dicatat {formatHours(weekDone)} dari {weeklyHours(me.emp_status)} jam
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(week.start)} - {formatDate(week.end)}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Ketercapaian periode berjalan</p>
          <p
            className={`mt-1 text-3xl font-bold ${achievement >= 1 ? "text-teal-700" : "text-slate-900"}`}
          >
            {formatPercent(achievement)}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: `${Math.min(achievement, 1) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {formatHours(periodDone)} dari {monthlyExpectedHours(me.emp_status)} jam
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{periodLabelWithRange(currentPeriod)}</p>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Catat pekerjaan</h2>
        <LogForm today={today} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Log saya</h2>
          <PeriodPicker
            value={selectedPeriod}
            options={periodOptions.map((p) => ({ value: p, label: periodLabelWithRange(p) }))}
          />
        </div>
        <LogList
          logs={(listRes.data ?? []) as WorkLog[]}
          locked={lockedPeriods.has(selectedPeriod)}
          today={today}
        />
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Riwayat ketercapaian (periode ditutup)</h2>
        {(snapshotRes.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Belum ada periode yang ditutup untuk Anda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Periode</th>
                  <th className="px-3 py-2 font-medium">Ketercapaian</th>
                  <th className="px-3 py-2 font-medium">Jam</th>
                  <th className="px-3 py-2 font-medium">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {(snapshotRes.data ?? []).map((s) => (
                  <tr key={s.period_month} className="border-t border-slate-100">
                    <td className="px-3 py-2">{periodLabel(s.period_month)}</td>
                    <td className="px-3 py-2 font-semibold">{formatPercent(Number(s.achievement))}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {s.total_hours == null
                        ? "-"
                        : `${formatHours(Number(s.total_hours) * 60)} / ${formatHours(Number(s.expected_hours) * 60)}`}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {s.source === "import" ? "Data impor" : `Ditutup ${formatDate(String(s.locked_at).slice(0, 10))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
