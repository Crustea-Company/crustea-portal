import type { Employee } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  formatHours,
  formatPercent,
  monthlyExpectedHours,
  periodLabelWithRange,
  weekRange,
  weeklyHours,
} from "@/lib/ats";

// Kartu "Sisa jam minggu ini" dan "Ketercapaian periode berjalan"
// (dipakai di halaman Log Kerja dan Dashboard).
export default function LogSummaryCards({
  empStatus,
  weekMinutes,
  periodMinutes,
  today,
  currentPeriod,
}: {
  empStatus: Employee["emp_status"];
  weekMinutes: number;
  periodMinutes: number;
  today: string;
  currentPeriod: string;
}) {
  const week = weekRange(today);
  const weekLeft = weeklyHours(empStatus) * 60 - weekMinutes;
  const achievement = periodMinutes / (monthlyExpectedHours(empStatus) * 60);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">Sisa jam minggu ini</p>
        {weekLeft > 0 ? (
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {formatHours(weekLeft)} <span className="text-base font-medium">jam</span>
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-brand-700">Target tercapai</p>
        )}
        <p className="mt-1 text-sm text-slate-600">
          Sudah dicatat {formatHours(weekMinutes)} dari {weeklyHours(empStatus)} jam
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatDate(week.start)} - {formatDate(week.end)}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">Ketercapaian periode berjalan</p>
        <p className={`mt-1 text-3xl font-bold ${achievement >= 1 ? "text-brand-700" : "text-slate-900"}`}>
          {formatPercent(achievement)}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(achievement, 1) * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {formatHours(periodMinutes)} dari {monthlyExpectedHours(empStatus)} jam
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{periodLabelWithRange(currentPeriod)}</p>
      </section>
    </div>
  );
}
