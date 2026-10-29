import type { Metadata } from "next";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { TASK_SELECT, type EmployeeLite, type Sprint, type Task, type TaskNote } from "@/lib/tasks";
import TaskBoard, { type Filters } from "./TaskBoard";

export const metadata: Metadata = { title: "Tugas - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TugasPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const params = await searchParams;
  const param = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };

  // Hanya muat tugas sprint yang dilihat (database jauh: 447 tugas ~0,8 detik, satu sprint ~0,3 detik).
  // Tanpa pilihan sprint: sprint berjalan + mendatang (pilihan bawaan papan ada di dalamnya).
  // Ganti sprint di papan = muat ulang dari server (lihat TaskBoard).
  const sprintParam = param("sprint");
  const today = todayJakarta();
  const scope = sprintParam === "semua" || sprintParam === "tanpa" || /^\d+$/.test(sprintParam ?? "") ? sprintParam! : "berjalan";
  const tasksQuery = () => {
    if (scope === "semua") return supabase.from("tasks").select(TASK_SELECT).order("id");
    if (scope === "tanpa") return supabase.from("tasks").select(TASK_SELECT).is("sprint_id", null).order("id");
    if (scope === "berjalan") {
      return supabase
        .from("tasks")
        .select(`${TASK_SELECT}, sprints!inner(end_date)`)
        .gte("sprints.end_date", today)
        .order("id");
    }
    return supabase.from("tasks").select(TASK_SELECT).eq("sprint_id", Number(scope)).order("id");
  };

  const [tasksRes, employeesRes, departmentsRes, sprintsRes, notesRes, remindersRes] = await Promise.all([
    fetchAll<Task>(tasksQuery),
    supabase.from("employees").select("id, full_name, dept_code, is_active").order("full_name"),
    supabase.from("departments").select("code, name").order("code"),
    supabase.from("sprints").select("id, name, start_date, end_date").order("id"),
    fetchAll<TaskNote>(() =>
      supabase
        .from("task_notes")
        .select("id, task_id, author_id, body, created_at, updated_at")
        .order("created_at")
        .order("id"),
    ),
    // Pengingat pribadi: database hanya mengembalikan milik pengguna ini.
    supabase.from("task_reminders").select("task_id, remind_at"),
  ]);

  const error =
    tasksRes.error ??
    employeesRes.error ??
    departmentsRes.error ??
    sprintsRes.error ??
    notesRes.error ??
    remindersRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat tugas: {error.message}
        </p>
      </main>
    );
  }

  const initial: Partial<Filters> = {
    dept: param("dept"),
    sprint: param("sprint"),
    pic: param("pic"),
    status: param("status") as Filters["status"] | undefined,
    overdue: param("terlambat") === "1",
    priorityOnly: param("prioritas") === "1",
    from: param("dari"),
    to: param("sampai"),
    sort: param("urut") === "prioritas" ? "priority" : param("urut") === "judul" ? "title" : "deadline",
    dir: param("arah") === "turun" ? "desc" : "asc",
    view: (["grid", "kanban", "pic"] as const).find((v) => v === param("tampilan")) ?? "list",
  };

  return (
    <TaskBoard
      key={scope}
      tasks={tasksRes.data}
      employees={(employeesRes.data ?? []) as EmployeeLite[]}
      departments={departmentsRes.data ?? []}
      sprints={(sprintsRes.data ?? []) as Sprint[]}
      notes={notesRes.data}
      reminders={remindersRes.data ?? []}
      me={{ id: me.id, app_role: me.app_role, dept_code: me.dept_code }}
      today={today}
      initial={initial}
    />
  );
}
