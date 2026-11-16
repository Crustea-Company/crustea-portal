"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { taskInputFromValues, taskSheetDef, type TaskSheetCtx, type TaskSheetOp } from "@/lib/bulk-tasks";
import {
  STATUS_ORDER,
  TASK_SELECT,
  canCreateInDept,
  type Task,
  type TaskNote,
  type TaskStatus,
} from "@/lib/tasks";

type Fail = { ok: false; message: string; denied?: true };
// denied = ditolak karena hak akses (dipakai impor Excel untuk menandai "Dilewati", bukan "Gagal").
const fail = (message: string, denied = false): Fail => (denied ? { ok: false, message, denied: true } : { ok: false, message });
const SESSION_ENDED = "Sesi login berakhir. Silakan masuk lagi.";

// ---------- Status ----------

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<{ ok: true } | Fail> {
  if (!STATUS_ORDER.includes(status)) return fail("Status tidak dikenal.");
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);

  const supabase = await createClient();
  // Hak ubah diperiksa oleh database (RLS). Kalau tidak berhak, tidak ada baris yang berubah.
  const { data, error } = await supabase.from("tasks").update({ status }).eq("id", taskId).select("id");
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  if (!data || data.length === 0) return fail("Anda tidak berhak mengubah tugas ini.");

  revalidatePath("/tugas");
  return { ok: true };
}

// ---------- Pengingat pribadi ----------

// remindAt: "YYYY-MM-DDTHH:mm" (waktu WIB dari input tanggal & jam).
export async function setReminder(taskId: string, remindAt: string): Promise<{ ok: true; remind_at: string } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(remindAt)) return fail("Pilih tanggal dan jam pengingat.");
  const when = new Date(`${remindAt}:00+07:00`);
  if (when.getTime() <= Date.now()) return fail("Waktu pengingat harus di masa depan.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_reminders")
    .upsert(
      { task_id: taskId, employee_id: me.id, remind_at: when.toISOString() },
      { onConflict: "task_id,employee_id" },
    )
    .select("remind_at")
    .single();
  if (error) return fail(`Gagal menyimpan pengingat: ${error.message}`);
  return { ok: true, remind_at: data.remind_at };
}

export async function clearReminder(taskId: string): Promise<{ ok: true } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_reminders")
    .delete()
    .eq("task_id", taskId)
    .eq("employee_id", me.id);
  if (error) return fail(`Gagal menghapus pengingat: ${error.message}`);
  return { ok: true };
}

// ---------- Catatan ----------

const NOTE_SELECT = "id, task_id, author_id, body, created_at, updated_at";

export async function addNote(taskId: string, body: string): Promise<{ ok: true; note: TaskNote } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  if (!body.trim()) return fail("Catatan masih kosong.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_notes")
    .insert({ task_id: taskId, author_id: me.id, body: body.trim() })
    .select(NOTE_SELECT)
    .single();
  if (error) return fail(`Gagal menyimpan catatan: ${error.message}`);
  return { ok: true, note: data as TaskNote };
}

export async function updateNote(noteId: string, body: string): Promise<{ ok: true; note: TaskNote } | Fail> {
  if (!body.trim()) return fail("Catatan masih kosong.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_notes")
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select(NOTE_SELECT);
  if (error) return fail(`Gagal menyimpan catatan: ${error.message}`);
  if (!data?.length) return fail("Anda hanya bisa mengubah catatan milik sendiri.");
  return { ok: true, note: data[0] as TaskNote };
}

export async function deleteNote(noteId: string): Promise<{ ok: true } | Fail> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_notes").delete().eq("id", noteId).select("id");
  if (error) return fail(`Gagal menghapus catatan: ${error.message}`);
  if (!data?.length) return fail("Anda tidak berhak menghapus catatan ini.");
  return { ok: true };
}

// ---------- Delegasi ----------

export async function delegateTask(taskId: string, employeeId: string): Promise<{ ok: true } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const supabase = await createClient();
  // Hak akses dan notifikasi diatur oleh fungsi delegate_task di database.
  const { error } = await supabase.rpc("delegate_task", { p_task: taskId, p_employee: employeeId });
  if (error) return fail(error.message);
  revalidatePath("/tugas");
  return { ok: true };
}

// ---------- Tambah / ubah / hapus tugas ----------

export type TaskInput = {
  dept_code: string;
  title: string;
  workstream: string;
  output: string;
  status: TaskStatus;
  start_date: string;
  deadline: string;
  is_priority: boolean;
  sprint_id: number | null;
  program_id: string | null;
  notes: string;
  pics: string[];
  supports: string[];
};

function validate(input: TaskInput): string | null {
  if (!input.title.trim()) return "Judul tugas wajib diisi.";
  if (!input.dept_code) return "Departemen wajib dipilih.";
  if (!STATUS_ORDER.includes(input.status)) return "Status tidak dikenal.";
  if (input.pics.length === 0) return "Pilih minimal satu PIC.";
  if (input.start_date && input.deadline && input.start_date > input.deadline) {
    return "Tanggal mulai tidak boleh setelah deadline.";
  }
  return null;
}

const toRow = (input: TaskInput) => ({
  dept_code: input.dept_code,
  title: input.title.trim(),
  workstream: input.workstream.trim() || null,
  output: input.output.trim() || null,
  status: input.status,
  start_date: input.start_date || null,
  deadline: input.deadline || null,
  is_priority: input.is_priority,
  sprint_id: input.sprint_id,
  program_id: input.program_id,
  notes: input.notes.trim() || null,
});

const peopleRows = (taskId: string, input: TaskInput) => [
  ...input.pics.map((id) => ({ task_id: taskId, employee_id: id, role: "pic" })),
  ...input.supports
    .filter((id) => !input.pics.includes(id))
    .map((id) => ({ task_id: taskId, employee_id: id, role: "support" })),
];

async function reloadTask(taskId: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).single();
  return (data as Task | null) ?? null;
}

type Me = NonNullable<Awaited<ReturnType<typeof getCurrentEmployee>>>;

// Inti tambah tugas: dipakai tombol Tambah dan impor Excel (aturan sama, tanpa menggandakan).
async function createTaskCore(me: Me, input: TaskInput): Promise<{ ok: true; id: string; warning?: string } | Fail> {
  const problem = validate(input);
  if (problem) return fail(problem);
  if (!canCreateInDept(input.dept_code, me)) {
    return fail("Anda hanya bisa menambah tugas untuk departemen sendiri.", true);
  }

  const supabase = await createClient();
  // Kode tugas (mis. CA-102) dibuat otomatis oleh database.
  const { data, error } = await supabase.from("tasks").insert(toRow(input)).select("id").single();
  if (error) return fail(`Gagal menambah tugas: ${error.message}`);

  const { error: peopleError } = await supabase.from("task_people").insert(peopleRows(data.id, input));
  return {
    ok: true,
    id: data.id,
    warning: peopleError ? `Tugas tersimpan, tetapi PIC/support gagal disimpan: ${peopleError.message}` : undefined,
  };
}

export async function createTask(input: TaskInput): Promise<{ ok: true; task: Task; warning?: string } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const res = await createTaskCore(me, input);
  if (!res.ok) return res;
  const task = await reloadTask(res.id);
  revalidatePath("/tugas");
  if (!task) return fail("Tugas tersimpan, tetapi gagal dimuat ulang. Muat ulang halaman.");
  return { ok: true, task, warning: res.warning };
}

// Inti ubah tugas: dipakai form Ubah dan impor Excel.
async function updateTaskCore(me: Me, taskId: string, input: TaskInput): Promise<{ ok: true; warning?: string } | Fail> {
  const problem = validate(input);
  if (problem) return fail(problem);

  const supabase = await createClient();
  const row = toRow(input);
  // Hanya admin dan CEO yang boleh memindahkan tugas ke departemen lain.
  const { data: current } = await supabase
    .from("tasks")
    .select("dept_code, task_people(employee_id, role)")
    .eq("id", taskId)
    .single();
  if (!current) return fail("Tugas tidak ditemukan.");
  if (row.dept_code !== current.dept_code && me.app_role !== "admin" && me.app_role !== "ceo") {
    return fail("Hanya admin dan CEO yang boleh memindahkan tugas ke departemen lain.", true);
  }

  const { data, error } = await supabase.from("tasks").update(row).eq("id", taskId).select("id");
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  if (!data?.length) return fail("Anda tidak berhak mengubah tugas ini.", true);

  // Sesuaikan PIC dan support: hapus yang dilepas, tambah yang baru.
  const key = (p: { employee_id: string; role: string }) => `${p.employee_id}:${p.role}`;
  const before = (current.task_people ?? []) as { employee_id: string; role: string }[];
  const after = peopleRows(taskId, input);
  const removed = before.filter((p) => !after.some((a) => key(a) === key(p)));
  const added = after.filter((a) => !before.some((p) => key(p) === key(a)));

  // Tambah dulu, baru lepas, supaya tugas tidak pernah tanpa PIC kalau ada yang gagal.
  let warning: string | undefined;
  if (added.length) {
    const { error: e } = await supabase.from("task_people").insert(added);
    if (e) return fail(`Data tugas tersimpan, tetapi PIC/support gagal diubah: ${e.message}`);
  }
  for (const p of removed) {
    const { error: e } = await supabase
      .from("task_people")
      .delete()
      .eq("task_id", taskId)
      .eq("employee_id", p.employee_id)
      .eq("role", p.role);
    if (e) warning = `Sebagian PIC/support gagal dilepas: ${e.message}`;
  }

  return { ok: true, warning };
}

export async function updateTask(
  taskId: string,
  input: TaskInput,
): Promise<{ ok: true; task: Task; warning?: string } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const res = await updateTaskCore(me, taskId, input);
  if (!res.ok) return res;
  const task = await reloadTask(taskId);
  revalidatePath("/tugas");
  if (!task) return fail("Tugas tersimpan, tetapi gagal dimuat ulang. Muat ulang halaman.");
  return { ok: true, task, warning: res.warning };
}

export async function deleteTask(taskId: string): Promise<{ ok: true } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("id");
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  if (!data?.length) return fail("Hanya admin atau head departemen yang boleh menghapus tugas ini.");
  revalidatePath("/tugas");
  return { ok: true };
}

// ---------- Ubah / hapus banyak tugas sekaligus ----------
// Hak akses tetap diperiksa database per tugas: tugas yang tidak boleh diubah dilewati.

export type BulkPatch = {
  status?: TaskStatus;
  sprint_id?: number | null; // null = tanpa sprint
  deadline?: string;
  is_priority?: boolean;
  addPic?: string; // id karyawan yang ditambahkan sebagai PIC
};

const CHUNK = 100;
const chunks = <T,>(list: T[]) =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

export async function bulkUpdateTasks(
  ids: string[],
  patch: BulkPatch,
): Promise<{ ok: true; tasks: Task[]; changed: number; skipped: number } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  if (ids.length === 0) return fail("Belum ada tugas yang dipilih.");
  if (patch.status && !STATUS_ORDER.includes(patch.status)) return fail("Status tidak dikenal.");
  if (patch.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(patch.deadline)) return fail("Deadline tidak valid.");

  const fields: Record<string, unknown> = {};
  if (patch.status) fields.status = patch.status;
  if (patch.sprint_id !== undefined) fields.sprint_id = patch.sprint_id;
  if (patch.deadline) fields.deadline = patch.deadline;
  if (patch.is_priority !== undefined) fields.is_priority = patch.is_priority;
  if (Object.keys(fields).length === 0 && !patch.addPic) return fail("Pilih minimal satu perubahan.");

  const supabase = await createClient();
  const changed = new Set<string>();

  if (Object.keys(fields).length > 0) {
    for (const part of chunks(ids)) {
      const { data, error } = await supabase.from("tasks").update(fields).in("id", part).select("id");
      if (error) return fail(`Gagal menyimpan: ${error.message}`);
      for (const r of data ?? []) changed.add(r.id);
    }
  }

  if (patch.addPic) {
    const rows = ids.map((id) => ({ task_id: id, employee_id: patch.addPic, role: "pic" }));
    for (const part of chunks(rows)) {
      const { data, error } = await supabase
        .from("task_people")
        .upsert(part, { onConflict: "task_id,employee_id,role", ignoreDuplicates: true })
        .select("task_id");
      if (error) return fail(`Gagal menambah PIC: ${error.message}`);
      for (const r of data ?? []) changed.add(r.task_id);
    }
  }

  const tasks: Task[] = [];
  for (const part of chunks(ids)) {
    const { data } = await supabase.from("tasks").select(TASK_SELECT).in("id", part);
    tasks.push(...((data ?? []) as Task[]));
  }

  revalidatePath("/tugas");
  return { ok: true, tasks, changed: changed.size, skipped: ids.length - changed.size };
}

export async function bulkDeleteTasks(ids: string[]): Promise<{ ok: true; deleted: string[] } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  if (ids.length === 0) return fail("Belum ada tugas yang dipilih.");

  const supabase = await createClient();
  const deleted: string[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from("tasks").delete().in("id", part).select("id");
    if (error) return fail(`Gagal menghapus: ${error.message}`);
    deleted.push(...(data ?? []).map((r) => r.id as string));
  }
  revalidatePath("/tugas");
  return { ok: true, deleted };
}

// ---------- Impor Excel (ekspor-ubah-impor massal) ----------
// Memakai inti yang sama dengan form Tambah/Ubah dan hapus banyak; hak akses tetap dijaga database (RLS).
// File Excel dibaca di browser; server hanya menerima daftar perubahan yang sudah disetujui di pratinjau.

// Nilai terkini tugas-tugas di file (untuk mendeteksi bentrok). Hanya yang terlihat oleh pengguna (RLS).
export async function fetchTasksForSheet(ids: string[]): Promise<{ ok: true; tasks: Task[] } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const supabase = await createClient();
  const tasks: Task[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const { data, error } = await supabase.from("tasks").select(TASK_SELECT).in("id", part);
    if (error) return fail(`Gagal memuat tugas: ${error.message}`);
    tasks.push(...((data ?? []) as Task[]));
  }
  return { ok: true, tasks };
}

export async function applyTaskSheet(ops: TaskSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  if (ops.length === 0) return { ok: true, results: [] };
  if (ops.length > 25) return fail("Terlalu banyak sekaligus (maks. 25 per kiriman).");

  const supabase = await createClient();
  const [emps, depts, sprints, programs] = await Promise.all([
    supabase.from("employees").select("id, full_name"),
    supabase.from("departments").select("code, name"),
    supabase.from("sprints").select("id, name"),
    supabase.from("programs").select("id, name"),
  ]);
  const ctxError = emps.error ?? depts.error ?? sprints.error ?? programs.error;
  if (ctxError) return fail(`Gagal memuat data pendukung: ${ctxError.message}`);
  const ctx: TaskSheetCtx = { employees: emps.data ?? [], departments: depts.data ?? [], sprints: sprints.data ?? [], programs: programs.data ?? [] };
  const def = taskSheetDef(ctx);
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";

  const existing = await fetchTasksForSheet(ops.filter((o) => o.id).map((o) => o.id));
  if (!existing.ok) return existing;
  const byId = new Map(existing.tasks.map((t) => [t.id, t]));

  const result = (op: TaskSheetOp, status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
  const rowOf = (t: Task) => rowValues(def, t);

  const results = await Promise.all(
    ops.map(async (op): Promise<ApplyResult | null> => {
      try {
        if (op.op === "delete") return null; // dikerjakan sekaligus di bawah
        let values: RowValues;
        if (op.op === "add") {
          values = {};
          for (const c of def.columns) values[c.header] = c.kind === "bool" ? "Tidak" : "";
        } else {
          const task = byId.get(op.id);
          if (!task) return result(op, "skipped", "Tugas sudah tidak ada atau tidak bisa Anda lihat.");
          values = rowOf(task);
          for (const ch of op.changes) {
            if (!sameValue(kindOf(ch.col), values[ch.col] ?? "", ch.from)) {
              return result(op, "skipped", `Bentrok: kolom ${ch.col} sudah berubah di aplikasi sejak pratinjau.`);
            }
          }
        }
        for (const ch of op.changes) values[ch.col] = ch.to;
        const parsed = taskInputFromValues(values, ctx);
        if (!("input" in parsed)) return result(op, "failed", parsed.problems.join(" "));
        const res = op.op === "add" ? await createTaskCore(me, parsed.input) : await updateTaskCore(me, op.id, parsed.input);
        if (!res.ok) return result(op, res.denied ? "skipped" : "failed", res.message);
        return result(op, "ok", res.warning ?? (op.op === "add" ? "Ditambahkan." : "Diubah."));
      } catch (e) {
        return result(op, "failed", e instanceof Error ? e.message : "Kesalahan tak terduga.");
      }
    }),
  );

  // Hapus: periksa nilai terkini sama dengan saat ekspor (bila ada), lalu hapus sekaligus.
  const deletes = ops.map((op, i) => ({ op, i })).filter((x) => x.op.op === "delete");
  const deletable: { op: TaskSheetOp; i: number }[] = [];
  for (const d of deletes) {
    const task = byId.get(d.op.id);
    if (!task) {
      results[d.i] = result(d.op, "skipped", "Tugas sudah tidak ada atau tidak bisa Anda lihat.");
      continue;
    }
    const cur = rowOf(task);
    const changed = d.op.baseline ? def.columns.filter((c) => !c.readOnly && !sameValue(c.kind, cur[c.header] ?? "", d.op.baseline![c.header] ?? "")) : [];
    if (changed.length) {
      results[d.i] = result(d.op, "skipped", `Bentrok: tugas diubah di aplikasi sejak ekspor (${changed.map((c) => c.header).join(", ")}).`);
      continue;
    }
    deletable.push(d);
  }
  if (deletable.length) {
    const del = await bulkDeleteTasks(deletable.map((d) => d.op.id));
    for (const d of deletable) {
      results[d.i] = !del.ok
        ? result(d.op, "failed", del.message)
        : del.deleted.includes(d.op.id)
          ? result(d.op, "ok", "Dihapus.")
          : result(d.op, "skipped", "Hanya admin atau head departemen yang boleh menghapus tugas ini.");
    }
  }

  revalidatePath("/tugas");
  return { ok: true, results: results.map((r, i) => r ?? result(ops[i], "failed", "Tidak diproses.")) };
}
