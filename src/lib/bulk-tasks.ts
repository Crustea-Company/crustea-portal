// Definisi file Excel untuk Tugas (ekspor–ubah–impor massal). Fungsi murni: dipakai di browser dan di server action.
import { normalizeText } from "./search";
import { resolvePeople, type Person, type RowValues, type SheetDef } from "./bulk-sheet";
import { STATUS_LABEL, STATUS_ORDER, type Task, type TaskStatus } from "./tasks";
import type { TaskInput } from "@/app/(app)/tugas/actions";

export type TaskSheetCtx = {
  employees: { id: string; full_name: string }[];
  departments: { code: string; name: string }[];
  sprints: { id: number; name: string }[];
  programs: { id: string; name: string }[];
};

export const TASK_SHEET_KIND = "tugas";
export const OTHER_PROGRAM = "(program lain)"; // program tugas yang tidak ada di daftar pilihan

export const H = {
  code: "Kode",
  dept: "Departemen",
  title: "Judul",
  workstream: "Workstream",
  output: "Output",
  status: "Status",
  start: "Mulai",
  deadline: "Deadline",
  priority: "Prioritas",
  sprint: "Sprint",
  program: "Program",
  pic: "PIC",
  support: "Support",
  notes: "Catatan",
} as const;

export const taskSheetPeople = (ctx: TaskSheetCtx): Person[] => ctx.employees.map((e) => ({ id: e.id, name: e.full_name }));

export function taskSheetDef(ctx: TaskSheetCtx): SheetDef<Task> {
  const nameOf = new Map(ctx.employees.map((e) => [e.id, e.full_name]));
  const sprintName = new Map(ctx.sprints.map((s) => [s.id, s.name]));
  const programName = new Map(ctx.programs.map((p) => [p.id, p.name]));
  const people = (t: Task, role: "pic" | "support") =>
    t.task_people.filter((p) => p.role === role).map((p) => nameOf.get(p.employee_id) ?? "?");

  return {
    kind: TASK_SHEET_KIND,
    title: "Tugas",
    id: (t) => t.id,
    allowDelete: true,
    instructions: [
      "Kolom Departemen: kode departemen (mis. CA, TO). Hanya admin dan CEO yang boleh memindahkan tugas ke departemen lain.",
      "Kolom Status: Belum Mulai, Berjalan, Pending, atau Selesai. Prioritas: Ya / Tidak.",
      "Kolom Sprint dan Program: pilih dari daftar (dropdown); kosongkan bila tidak ada.",
      "PIC wajib ada minimal satu orang. Support boleh kosong. Pisahkan beberapa nama dengan titik koma (;).",
      "Hak mengubah/menghapus tetap mengikuti aturan aplikasi: baris yang tidak boleh Anda ubah akan dilewati saat impor.",
    ],
    columns: [
      { header: H.code, kind: "text", get: (t) => t.code, readOnly: true, width: 10 },
      { header: H.dept, kind: "choice", get: (t) => t.dept_code, choices: ctx.departments.map((d) => d.code), required: true, width: 12 },
      { header: H.title, kind: "text", get: (t) => t.title, required: true, width: 44 },
      { header: H.workstream, kind: "text", get: (t) => t.workstream, width: 22 },
      { header: H.output, kind: "text", get: (t) => t.output, width: 30 },
      { header: H.status, kind: "choice", get: (t) => STATUS_LABEL[t.status], choices: STATUS_ORDER.map((s) => STATUS_LABEL[s]), required: true, width: 14 },
      { header: H.start, kind: "date", get: (t) => t.start_date, width: 13 },
      { header: H.deadline, kind: "date", get: (t) => t.deadline, width: 13 },
      { header: H.priority, kind: "bool", get: (t) => t.is_priority, width: 10 },
      { header: H.sprint, kind: "choice", get: (t) => (t.sprint_id == null ? "" : (sprintName.get(t.sprint_id) ?? "")), choices: ctx.sprints.map((s) => s.name), width: 18 },
      {
        header: H.program,
        kind: "choice",
        get: (t) => (t.program_id ? (programName.get(t.program_id) ?? OTHER_PROGRAM) : ""),
        choices: ctx.programs.map((p) => p.name),
        width: 22,
      },
      { header: H.pic, kind: "people", get: (t) => people(t, "pic"), required: true, width: 26 },
      { header: H.support, kind: "people", get: (t) => people(t, "support"), width: 26 },
      { header: H.notes, kind: "text", get: (t) => t.notes, width: 40 },
    ],
  };
}

// Nilai kanonik satu baris -> isian tugas (sama dengan form Tambah/Ubah). Nama tak dikenal/ganda = masalah.
export function taskInputFromValues(v: RowValues, ctx: TaskSheetCtx): { input: TaskInput } | { problems: string[] } {
  const problems: string[] = [];
  const statusKey = STATUS_ORDER.find((s) => normalizeText(STATUS_LABEL[s]) === normalizeText(v[H.status] ?? ""));
  if (!statusKey) problems.push(`Status "${v[H.status] ?? ""}" tidak dikenal.`);

  const lookup = <I extends string | number>(label: string, name: string, list: { id: I; name: string }[]): I | null => {
    if (!name) return null;
    const hits = list.filter((x) => normalizeText(x.name) === normalizeText(name));
    if (hits.length === 1) return hits[0].id;
    problems.push(hits.length === 0 ? `${label} "${name}" tidak dikenal.` : `${label} "${name}" ada lebih dari satu.`);
    return null;
  };
  const sprint_id = lookup(H.sprint, v[H.sprint] ?? "", ctx.sprints);
  const program_id = lookup(H.program, v[H.program] ?? "", ctx.programs);

  const people = taskSheetPeople(ctx);
  const pics = resolvePeople(v[H.pic] ?? "", people);
  const supports = resolvePeople(v[H.support] ?? "", people);
  problems.push(...pics.problems.map((p) => `${H.pic}: ${p}`), ...supports.problems.map((p) => `${H.support}: ${p}`));

  if (problems.length || !statusKey) return { problems };
  return {
    input: {
      dept_code: v[H.dept] ?? "",
      title: v[H.title] ?? "",
      workstream: v[H.workstream] ?? "",
      output: v[H.output] ?? "",
      status: statusKey as TaskStatus,
      start_date: v[H.start] ?? "",
      deadline: v[H.deadline] ?? "",
      is_priority: v[H.priority] === "Ya",
      sprint_id,
      program_id,
      notes: v[H.notes] ?? "",
      pics: pics.ids,
      supports: supports.ids,
    },
  };
}

// Satu operasi dari pratinjau, dikirim ke server. Server mengambil nilai terkini sendiri dan menolak bila sudah berubah.
export type TaskSheetOp = {
  op: "add" | "update" | "delete";
  id: string;
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
  baseline?: RowValues; // nilai saat ekspor (untuk hapus; null bila file tanpa _asal)
};
