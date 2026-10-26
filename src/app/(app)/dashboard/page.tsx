import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
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
import { TASK_SELECT, type EmployeeLite, type Sprint, type Task, type TaskNote } from "@/lib/tasks";
import TodoSlider from "./TodoSlider";

export const metadata: Metadata = { title: "Dashboard - Crustea Portal" };

type DashEmployee = Pick<Employee, "id" | "full_name" | "dept_code" | "emp_status" | "app_role">;

export default async function DashboardPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const today = todayJakarta();
  const week = weekRange(today);
  const currentPeriod = periodOf(today);

  // Hak akses ATS (sama dengan aturan database): admin & CEO semua karyawan,
  // head karyawan departemennya, lainnya hanya diri sendiri.
  let employeesQuery = supabase
    .from("employees")
    .select("id, full_name, dept_code, emp_status, app_role")
    .eq("is_active", true)
    .eq("ats_required", true)
    .order("full_name");
  if (me.app_role === "head") employeesQuery = employeesQuery.eq("dept_code", me.dept_code ?? "");
  else if (me.app_role === "staff") employeesQuery = employeesQuery.eq("id", me.id);

  const [
    tasksRes,
    departmentsRes,
    employeesRes,
    periodLogsRes,
    weekLogsRes,
    lockedRes,
    allEmployeesRes,
    sprintsRes,
    notesRes,
    remindersRes,
  ] = await Promise.all([
    fetchAll<Task>(() => supabase.from("tasks").select(TASK_SELECT).neq("status", "done").order("id")),
    supabase.from("departments").select("code, name").order("code"),
    employeesQuery,
    fetchAll<{ employee_id: string; minutes: number }>(() =>
      supabase.from("work_logs").select("employee_id, minutes").eq("period_month", currentPeriod),
    ),
    fetchAll<{ employee_id: string; minutes: number }>(() =>
      supabase
        .from("work_logs")
        .select("employee_id, minutes")
        .gte("log_date", week.start)
        .lte("log_date", week.end),
    ),
    supabase
      .from("periods")
      .select("period_month")
      .not("locked_at", "is", null)
      .order("period_month", { ascending: false })
      .limit(1),
    supabase.from("employees").select("id, full_name, dept_code, is_active").order("full_name"),
    supabase.from("sprints").select("id, name, start_date, end_date").order("id"),
    fetchAll<TaskNote>(() =>
      supabase.from("task_notes").select("id, task_id, author_id, body, created_at, updated_at").order("created_at").order("id"),
    ),
    supabase.from("task_reminders").select("task_id, remind_at"),
  ]);

  const lastLocked = (lockedRes.data?.[0]?.period_month as string | undefined) ?? null;
  const snapshotsRes = lastLocked
    ? await supabase
        .from("period_snapshots")
        .select("employee_id, achievement")
        .eq("period_month", lastLocked)
    : { data: [], error: null };

  const error =
    tasksRes.error ??
    departmentsRes.error ??
    employeesRes.error ??
    periodLogsRes.error ??
    weekLogsRes.error ??
    lockedRes.error ??
    allEmployeesRes.error ??
    sprintsRes.error ??
    notesRes.error ??
    remindersRes.error ??
    snapshotsRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat dashboard: {error.message}
        </p>
      </main>
    );
  }

  // ---------- Tugas per departemen ----------
  // Terlambat = deadline sebelum hari ini; jatuh tempo minggu ini = deadline hari ini s.d. Minggu.
  const taskRows = (departmentsRes.data ?? []).map((d) => {
    const open = tasksRes.data.filter((t) => t.dept_code === d.code);
    return {
      code: d.code as string,
      name: d.name as string,
      overdue: open.filter((t) => t.deadline && t.deadline < today).length,
      dueThisWeek: open.filter((t) => t.deadline && t.deadline >= today && t.deadline <= week.end).length,
    };
  });
  const totalOverdue = taskRows.reduce((t, r) => t + r.overdue, 0);
  const totalDue = taskRows.reduce((t, r) => t + r.dueThisWeek, 0);

  // ---------- Perlu diselesaikan ----------
  // Tugas yang belum selesai di mana saya PIC, atau milik departemen saya.
  const todoTasks = tasksRes.data.filter(
    (t) =>
      t.dept_code === me.dept_code ||
      t.task_people.some((p) => p.role === "pic" && p.employee_id === me.id),
  );
  const todoIds = new Set(todoTasks.map((t) => t.id));

  // ---------- ATS per karyawan ----------
  const sumBy = (rows: { employee_id: string; minutes: number }[]) => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.employee_id, (map.get(r.employee_id) ?? 0) + r.minutes);
    return map;
  };
  const periodMinutes = sumBy(periodLogsRes.data);
  const weekMinutes = sumBy(weekLogsRes.data);
  const lastAchievement = new Map(
    (snapshotsRes.data ?? []).map((s) => [s.employee_id as string, Number(s.achievement)]),
  );

  const employees = (employeesRes.data ?? []) as DashEmployee[];
  const atsRows = employees.map((e) => {
    const minutes = periodMinutes.get(e.id) ?? 0;
    return {
      ...e,
      achievement: minutes / (monthlyExpectedHours(e.emp_status) * 60),
      periodMinutes: minutes,
      weekMinutes: weekMinutes.get(e.id) ?? 0,
      last: lastAchievement.get(e.id),
    };
  });
  const atsByDept = (departmentsRes.data ?? [])
    .map((d) => ({ code: d.code as string, name: d.name as string, rows: atsRows.filter((r) => r.dept_code === d.code) }))
    .filter((g) => g.rows.length > 0);

  const canOpenLogs = me.app_role === "admin";
  const atsScope =
    me.app_role === "admin" || me.app_role === "ceo"
      ? "Semua karyawan"
      : me.app_role === "head"
        ? `Departemen ${me.dept_code}`
        : "Anda";

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Minggu ini: {formatDate(week.start)} - {formatDate(week.end)}
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Tugas per departemen</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Terlambat</p>
            <p className="text-3xl font-bold text-red-700">{formatNumber(totalOverdue)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">Jatuh tempo minggu ini</p>
            <p className="text-3xl font-bold text-amber-700">{formatNumber(totalDue)}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Departemen</th>
                <th className="px-3 py-2 text-right font-medium">Terlambat</th>
                <th className="px-3 py-2 text-right font-medium">Minggu ini</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((r) => (
                <tr key={r.code} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/tugas?${new URLSearchParams({ dept: r.code, sprint: "semua" })}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {r.code}
                    </Link>{" "}
                    <span className="hidden text-slate-500 sm:inline">{r.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.overdue > 0 ? (
                      <Link
                        href={`/tugas?${new URLSearchParams({ dept: r.code, sprint: "semua", terlambat: "1" })}`}
                        className="font-semibold text-red-700 underline underline-offset-2"
                      >
                        {formatNumber(r.overdue)}
                      </Link>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.dueThisWeek > 0 ? (
                      <span className="font-semibold text-amber-700">{formatNumber(r.dueThisWeek)}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Perlu diselesaikan</h2>
        <TodoSlider
          tasks={todoTasks}
          notes={notesRes.data.filter((n) => todoIds.has(n.task_id))}
          reminders={remindersRes.data ?? []}
          employees={(allEmployeesRes.data ?? []) as EmployeeLite[]}
          departments={departmentsRes.data ?? []}
          sprints={(sprintsRes.data ?? []) as Sprint[]}
          me={{ id: me.id, app_role: me.app_role, dept_code: me.dept_code }}
          today={today}
        />
      </section>

      <section>
        <h2 className="font-semibold text-slate-900">Ketercapaian ATS</h2>
        <p className="mb-3 text-sm text-slate-600">
          {atsScope} · periode berjalan {periodLabelWithRange(currentPeriod)}
        </p>

        {atsByDept.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Tidak ada karyawan wajib ATS yang bisa Anda lihat.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {atsByDept.map((g) => (
              <div key={g.code}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {g.code} · {g.name}
                </h3>
                <ul className="flex flex-col gap-2">
                  {g.rows.map((r) => (
                    <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        {canOpenLogs ? (
                          <Link
                            href={`/log-kerja?karyawan=${r.id}`}
                            className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {r.full_name}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">{r.full_name}</span>
                        )}
                        <span
                          className={`text-lg font-bold ${r.achievement >= 1 ? "text-brand-700" : "text-slate-900"}`}
                        >
                          {formatPercent(r.achievement)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${r.achievement >= 1 ? "bg-brand-600" : "bg-sky-500"}`}
                          style={{ width: `${Math.min(r.achievement, 1) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                        <span>{r.emp_status}</span>
                        <span>
                          Periode: {formatHours(r.periodMinutes)} / {monthlyExpectedHours(r.emp_status)} jam
                        </span>
                        <span>
                          Minggu ini: {formatHours(r.weekMinutes)} / {weeklyHours(r.emp_status)} jam
                        </span>
                        {lastLocked && (
                          <span>
                            {periodLabel(lastLocked)}: {r.last == null ? "-" : formatPercent(r.last)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
