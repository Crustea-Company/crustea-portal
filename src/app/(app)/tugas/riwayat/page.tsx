import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks";
import DeptFilter from "./DeptFilter";

export const metadata: Metadata = { title: "Riwayat Tugas - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type HistoryRow = {
  id: number;
  task_id: string | null;
  task_code: string | null;
  task_title: string | null;
  dept_code: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  actor: string | null;
  at: string;
};

const LIMIT = 200;

const FIELD_LABEL: Record<string, string> = {
  title: "Judul",
  status: "Status",
  deadline: "Deadline",
  start_date: "Mulai",
  is_priority: "Prioritas",
  sprint_id: "Sprint",
  workstream: "Workstream",
  output: "Output",
  notes: "Keterangan",
  dept_code: "Departemen",
  code: "Kode",
  source: "Sumber",
  sop_codes: "SOP",
};

const ACTION_LABEL: Record<string, string> = {
  create: "Menambah tugas",
  update: "Mengubah tugas",
  delete: "Menghapus tugas",
  add_person: "Menambah orang",
  remove_person: "Melepas orang",
};

export default async function RiwayatTugasPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const params = await searchParams;
  const dept = typeof params.dept === "string" ? params.dept : "";

  let query = supabase
    .from("task_history")
    .select("id, task_id, task_code, task_title, dept_code, action, changes, actor, at")
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMIT);
  if (dept) query = query.eq("dept_code", dept);

  const [historyRes, employeesRes, sprintsRes, departmentsRes] = await Promise.all([
    query,
    supabase.from("employees").select("id, full_name"),
    supabase.from("sprints").select("id, name"),
    supabase.from("departments").select("code, name").order("code"),
  ]);

  const error = historyRes.error ?? employeesRes.error ?? sprintsRes.error ?? departmentsRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat riwayat: {error.message}
        </p>
      </main>
    );
  }

  const nameOf = new Map((employeesRes.data ?? []).map((e) => [e.id as string, e.full_name as string]));
  const sprintOf = new Map((sprintsRes.data ?? []).map((s) => [String(s.id), s.name as string]));
  const deletedIds = new Set(
    ((historyRes.data ?? []) as HistoryRow[]).filter((h) => h.action === "delete").map((h) => h.task_id),
  );

  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "-";
    if (field === "status") return STATUS_LABEL[value as TaskStatus] ?? String(value);
    if (field === "deadline" || field === "start_date") return formatDate(String(value));
    if (field === "is_priority") return value ? "Ya" : "Tidak";
    if (field === "sprint_id") return sprintOf.get(String(value)) ?? String(value);
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  };

  const rows = (historyRes.data ?? []) as HistoryRow[];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/tugas" className="text-sm text-teal-700 hover:underline">
            ← Kembali ke Tugas
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Riwayat perubahan tugas</h1>
          <p className="text-sm text-slate-600">{LIMIT} perubahan terakhir, terbaru di atas.</p>
        </div>
        <DeptFilter value={dept} departments={departmentsRes.data ?? []} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Belum ada perubahan yang tercatat.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((h) => {
            const c = h.changes ?? {};
            const canLink = h.task_id && !deletedIds.has(h.task_id);
            const taskLabel = `${h.task_code ?? ""} ${h.task_title ?? ""}`.trim();
            return (
              <li key={h.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">{ACTION_LABEL[h.action] ?? h.action}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(h.at)}</p>
                </div>
                <p className="text-slate-700">
                  {canLink ? (
                    <Link
                      href={`/tugas?${new URLSearchParams({ dept: h.dept_code ?? "", sprint: "semua" })}#task-${h.task_id}`}
                      className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900"
                    >
                      {taskLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{taskLabel}</span>
                  )}
                </p>

                {h.action === "update" && (
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {Object.entries(c).map(([field, pair]) => {
                      const [oldV, newV] = Array.isArray(pair) ? pair : [null, pair];
                      return (
                        <li key={field}>
                          <span className="font-semibold">{FIELD_LABEL[field] ?? field}:</span>{" "}
                          {show(field, oldV)} → {show(field, newV)}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(h.action === "add_person" || h.action === "remove_person") && (
                  <p className="mt-1 text-xs text-slate-600">
                    {nameOf.get(String(c.employee_id)) ?? "?"} sebagai {c.role === "pic" ? "PIC" : "support"}
                  </p>
                )}
                {h.action === "create" && (
                  <p className="mt-1 text-xs text-slate-600">
                    Status {show("status", c.status)} · Deadline {show("deadline", c.deadline)}
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-500">
                  Oleh: {h.actor ? (nameOf.get(h.actor) ?? "?") : "sistem"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
