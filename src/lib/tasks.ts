import type { Employee } from "@/lib/auth";

export type TaskStatus = "not_started" | "on_going" | "done";

export const STATUS_ORDER: TaskStatus[] = ["not_started", "on_going", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Belum Mulai",
  on_going: "Berjalan",
  done: "Selesai",
};

export type TaskPerson = { employee_id: string; role: "pic" | "support" };

export type Task = {
  id: string;
  code: string | null;
  dept_code: string;
  title: string;
  workstream: string | null;
  output: string | null;
  status: TaskStatus;
  start_date: string | null;
  deadline: string | null;
  is_priority: boolean;
  sprint_id: number | null;
  notes: string | null;
  task_people: TaskPerson[];
};

export type Sprint = {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

// Terlambat = deadline sudah lewat dan belum selesai.
export function isOverdue(
  task: Pick<Task, "deadline" | "status">,
  today: string,
): boolean {
  return !!task.deadline && task.deadline < today && task.status !== "done";
}

// Aturan CLAUDE.md: PIC boleh mengubah status tugasnya, head boleh mengubah
// semua tugas departemennya, admin dan CEO boleh mengubah semua tugas.
// (Database juga menegakkan aturan yang sama lewat RLS.)
export function canEditTask(
  task: Pick<Task, "dept_code" | "task_people">,
  me: Pick<Employee, "id" | "app_role" | "dept_code">,
): boolean {
  if (me.app_role === "admin" || me.app_role === "ceo") return true;
  if (me.app_role === "head" && task.dept_code === me.dept_code) return true;
  return task.task_people.some(
    (p) => p.role === "pic" && p.employee_id === me.id,
  );
}

// Sprint yang sedang berjalan; kalau sedang jeda antar-sprint, sprint berikutnya.
export function defaultSprint(sprints: Sprint[], today: string): Sprint | null {
  const sorted = [...sprints].sort((a, b) =>
    (a.start_date ?? "").localeCompare(b.start_date ?? ""),
  );
  return (
    sorted.find(
      (s) => s.start_date && s.end_date && s.start_date <= today && today <= s.end_date,
    ) ??
    sorted.find((s) => s.start_date && s.start_date > today) ??
    null
  );
}
