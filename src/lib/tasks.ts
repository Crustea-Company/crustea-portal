import type { Employee } from "@/lib/auth";

export type TaskStatus = "not_started" | "on_going" | "pending" | "done";

export const STATUS_ORDER: TaskStatus[] = ["not_started", "on_going", "pending", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Belum Mulai",
  on_going: "Berjalan",
  pending: "Pending",
  done: "Selesai",
};

// Warna label status (dipakai di semua halaman).
export const STATUS_STYLE: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-300",
  on_going: "bg-sky-50 text-sky-800 border-sky-300",
  pending: "bg-violet-50 text-violet-800 border-violet-300",
  done: "bg-brand-50 text-brand-800 border-brand-300",
};

export type EmployeeLite = {
  id: string;
  full_name: string;
  dept_code: string | null;
  is_active: boolean;
};

export type TaskNote = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
};

// Kolom yang diambil untuk setiap tugas (dipakai halaman dan server action).
export const TASK_SELECT =
  "id, code, dept_code, title, workstream, output, status, start_date, deadline, is_priority, sprint_id, notes, sop_codes, task_people(employee_id, role)";

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
  sop_codes?: string[] | null;
  task_people: TaskPerson[];
};

export type Sprint = {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

export type TaskSort = "deadline" | "priority" | "title";
export type SortDir = "asc" | "desc";

export const SORT_DIR_LABEL: Record<TaskSort, [string, string]> = {
  deadline: ["Terdekat dulu", "Terjauh dulu"],
  priority: ["Prioritas di atas", "Prioritas di bawah"],
  title: ["A-Z", "Z-A"],
};

const byDeadline = (a: Task, b: Task, dir: 1 | -1) => {
  // Tugas tanpa deadline selalu di paling bawah.
  if (!a.deadline || !b.deadline) return (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1);
  return dir * a.deadline.localeCompare(b.deadline);
};

export function compareTasks(a: Task, b: Task, sort: TaskSort, dir: SortDir): number {
  const d = dir === "asc" ? 1 : -1;
  const byCode = (a.code ?? "").localeCompare(b.code ?? "", "id", { numeric: true });
  if (sort === "title") return d * a.title.localeCompare(b.title, "id", { sensitivity: "base" }) || byCode;
  if (sort === "priority") {
    return d * (Number(b.is_priority) - Number(a.is_priority)) || byDeadline(a, b, 1) || byCode;
  }
  return byDeadline(a, b, d) || byCode;
}

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

// Hapus tugas: admin, atau head untuk departemennya (sama dengan aturan database).
export function canDeleteTask(
  task: Pick<Task, "dept_code">,
  me: Pick<Employee, "app_role" | "dept_code">,
): boolean {
  return me.app_role === "admin" || (me.app_role === "head" && task.dept_code === me.dept_code);
}

// Tambah tugas: admin dan CEO untuk semua departemen, lainnya untuk departemennya sendiri.
export function canCreateInDept(dept: string, me: Pick<Employee, "app_role" | "dept_code">): boolean {
  return me.app_role === "admin" || me.app_role === "ceo" || dept === me.dept_code;
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
