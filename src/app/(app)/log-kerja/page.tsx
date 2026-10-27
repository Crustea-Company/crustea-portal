import type { Metadata } from "next";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayJakarta } from "@/lib/format";
import {
  formatHours,
  formatPercent,
  periodLabel,
  periodLabelWithRange,
  periodOf,
  weekRange,
} from "@/lib/ats";
import LogForm from "./LogForm";
import LogList, { type WorkLog } from "./LogList";
import PeriodPicker from "./PeriodPicker";
import LogSummaryCards from "./LogSummaryCards";
import ExportPanel from "./ExportPanel";
import { exportableEmployees } from "@/lib/access";
import EmployeePicker from "./EmployeePicker";

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

  // Admin boleh membuka log karyawan lain (untuk koreksi). Selain admin selalu log sendiri.
  const isAdmin = me.app_role === "admin";
  const requestedEmployee = typeof params.karyawan === "string" ? params.karyawan : "";
  let viewed: Pick<Employee, "id" | "full_name" | "emp_status" | "ats_required"> = me;
  if (isAdmin && requestedEmployee && requestedEmployee !== me.id) {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, emp_status, ats_required")
      .eq("id", requestedEmployee)
      .maybeSingle();
    if (data) viewed = data as typeof viewed;
  }
  const viewingOther = viewed.id !== me.id;

  // Selalu batasi ke satu karyawan: admin, CEO, dan head juga boleh membaca log orang lain.
  const [periodRes, weekRes, listRes, monthsRes, lockedRes, snapshotRes] = await Promise.all([
    supabase.from("work_logs").select("minutes").eq("employee_id", viewed.id).eq("period_month", currentPeriod),
    supabase
      .from("work_logs")
      .select("minutes")
      .eq("employee_id", viewed.id)
      .gte("log_date", week.start)
      .lte("log_date", week.end),
    supabase
      .from("work_logs")
      .select("id, log_date, activity, minutes, proof, is_correction")
      .eq("employee_id", viewed.id)
      .eq("period_month", selectedPeriod)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("work_logs").select("period_month").eq("employee_id", viewed.id),
    supabase.from("periods").select("period_month").not("locked_at", "is", null),
    supabase
      .from("period_snapshots")
      .select("period_month, emp_status, total_hours, expected_hours, achievement, source, locked_at")
      .eq("employee_id", viewed.id)
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

  // Pilihan periode untuk unduhan: Jan 2025 s.d. periode berjalan, terbaru di atas.
  const exportPeriods: string[] = [];
  for (let d = new Date(`${currentPeriod}T00:00:00Z`); d >= new Date("2025-01-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1)) {
    exportPeriods.push(d.toISOString().slice(0, 10));
  }
  const exportEmployees = await exportableEmployees(me);

  const lockedPeriods = new Set((lockedRes.data ?? []).map((p) => p.period_month as string));
  const periodOptions = [
    ...new Set([currentPeriod, selectedPeriod, ...(monthsRes.data ?? []).map((r) => r.period_month as string)]),
  ].sort((a, b) => b.localeCompare(a));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          Log Kerja{viewingOther && <span className="text-slate-500">: {viewed.full_name}</span>}
        </h1>
        {isAdmin && (
          <EmployeePicker
            value={viewed.id}
            period={selectedPeriod}
            options={exportEmployees.map((e) => ({
              value: e.id,
              label: `${e.full_name}${e.dept_code ? ` (${e.dept_code})` : ""}${e.is_active ? "" : " - nonaktif"}`,
            }))}
          />
        )}
        {viewingOther && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Anda melihat log karyawan lain sebagai admin. Setiap perubahan wajib disertai alasan dan
            tercatat di riwayat perubahan.
          </p>
        )}
        {!viewed.ats_required && (
          <p className="text-sm text-slate-500">
            {viewingOther ? "Karyawan ini" : "Posisi Anda"} tidak wajib ATS dan tidak masuk laporan
            ketercapaian, tetapi tetap bisa mencatat.
          </p>
        )}
      </div>

      <LogSummaryCards
        empStatus={viewed.emp_status}
        weekMinutes={sumMinutes(weekRes.data)}
        periodMinutes={sumMinutes(periodRes.data)}
        today={today}
        currentPeriod={currentPeriod}
      />

      {!viewingOther && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Catat pekerjaan</h2>
          <LogForm today={today} />
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{viewingOther ? "Daftar log" : "Log saya"}</h2>
          <PeriodPicker
            employeeId={viewingOther ? viewed.id : null}
            value={selectedPeriod}
            options={periodOptions.map((p) => ({ value: p, label: periodLabelWithRange(p) }))}
          />
        </div>
        <LogList
          logs={(listRes.data ?? []) as WorkLog[]}
          locked={lockedPeriods.has(selectedPeriod)}
          adminMode={isAdmin && (viewingOther || lockedPeriods.has(selectedPeriod))}
          today={today}
        />
      </section>

      <ExportPanel
        employees={exportEmployees}
        meId={viewed.id}
        periods={exportPeriods.map((p) => ({ value: p, label: periodLabelWithRange(p) }))}
        defaultPeriod={selectedPeriod}
        today={today}
      />

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Riwayat ketercapaian (periode ditutup)</h2>
        {(snapshotRes.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Belum ada periode yang ditutup.
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
