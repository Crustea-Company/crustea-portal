// Program & Prioritas (migrasi 029). Aturan akses resmi ada di database (can_prioritize, is_program_lead/member).

type Me = { id: string; dept_code: string | null; app_role: string };

export const PRIORITY_LABEL: Record<number, string> = { 1: "Tinggi", 2: "Sedang", 3: "Rendah" };
export const PRIORITY_STYLE: Record<number, string> = {
  1: "bg-red-100 text-red-700",
  2: "bg-amber-100 text-amber-800",
  3: "bg-slate-100 text-slate-700",
};

export const PROGRAM_STATUS = { planned: "Direncanakan", active: "Berjalan", on_hold: "Ditunda", done: "Selesai", cancelled: "Batal" } as const;
export type ProgramStatus = keyof typeof PROGRAM_STATUS;

export const HEALTH = { on_track: "Sesuai jadwal", at_risk: "Berisiko", off_track: "Terlambat" } as const;
export type Health = keyof typeof HEALTH;
export const HEALTH_STYLE: Record<Health, string> = {
  on_track: "bg-brand-100 text-brand-800",
  at_risk: "bg-amber-100 text-amber-800",
  off_track: "bg-red-100 text-red-700",
};

export type ProgramPerson = { employee_id: string; role: string | null; is_lead: boolean; employee: { full_name: string } | null };
export type Milestone = { id: number; title: string; due_date: string | null; pic_id: string | null; done_at: string | null; pic: { full_name: string } | null };

export type Program = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  sort: number;
  status: ProgramStatus;
  health: Health;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
  program_people: ProgramPerson[];
  program_milestones: Milestone[];
};

export const PROGRAM_COLUMNS =
  "id, name, description, priority, sort, status, health, start_date, end_date, updated_at, " +
  "program_people(employee_id, role, is_lead, employee:employees(full_name)), " +
  "program_milestones(id, title, due_date, pic_id, done_at, pic:employees!program_milestones_pic_id_fkey(full_name))";

// Sama dengan can_prioritize(): admin, CEO, CTO (head TO), CMO (head BDS).
export const canPrioritize = (me: Me) =>
  me.app_role === "admin" || me.app_role === "ceo" || (me.app_role === "head" && ["TO", "BDS"].includes(me.dept_code ?? ""));

export const isLead = (me: Me, p: Pick<Program, "program_people">) => p.program_people.some((x) => x.employee_id === me.id && x.is_lead);
export const isMember = (me: Me, p: Pick<Program, "program_people">) => p.program_people.some((x) => x.employee_id === me.id);

export const sortPrograms = <T extends Pick<Program, "priority" | "sort" | "name">>(list: T[]) =>
  [...list].sort((a, b) => a.priority - b.priority || a.sort - b.sort || a.name.localeCompare(b.name));
