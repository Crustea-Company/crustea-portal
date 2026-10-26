import type { Metadata } from "next";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { Sprint, Task } from "@/lib/tasks";
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

  const [tasksRes, employeesRes, departmentsRes, sprintsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, code, dept_code, title, workstream, output, status, start_date, deadline, is_priority, sprint_id, notes, task_people(employee_id, role)",
      ),
    supabase.from("employees").select("id, full_name, is_active").order("full_name"),
    supabase.from("departments").select("code, name").order("code"),
    supabase.from("sprints").select("id, name, start_date, end_date").order("id"),
  ]);

  const error =
    tasksRes.error ?? employeesRes.error ?? departmentsRes.error ?? sprintsRes.error;
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
      tasks={(tasksRes.data ?? []) as Task[]}
      employees={employeesRes.data ?? []}
      departments={departmentsRes.data ?? []}
      sprints={(sprintsRes.data ?? []) as Sprint[]}
      me={{ id: me.id, app_role: me.app_role, dept_code: me.dept_code }}
      today={todayJakarta()}
      initial={initial}
    />
  );
}
