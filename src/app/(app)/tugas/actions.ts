"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_ORDER,
  TASK_SELECT,
  canCreateInDept,
  type Task,
  type TaskNote,
  type TaskStatus,
} from "@/lib/tasks";

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });
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

export async function createTask(input: TaskInput): Promise<{ ok: true; task: Task; warning?: string } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
  const problem = validate(input);
  if (problem) return fail(problem);
  if (!canCreateInDept(input.dept_code, me)) {
    return fail("Anda hanya bisa menambah tugas untuk departemen sendiri.");
  }

  const supabase = await createClient();
  // Kode tugas (mis. CA-102) dibuat otomatis oleh database.
  const { data, error } = await supabase.from("tasks").insert(toRow(input)).select("id").single();
  if (error) return fail(`Gagal menambah tugas: ${error.message}`);

  const { error: peopleError } = await supabase.from("task_people").insert(peopleRows(data.id, input));
  const task = await reloadTask(data.id);
  revalidatePath("/tugas");
  if (!task) return fail("Tugas tersimpan, tetapi gagal dimuat ulang. Muat ulang halaman.");
  return {
    ok: true,
    task,
    warning: peopleError ? `Tugas tersimpan, tetapi PIC/support gagal disimpan: ${peopleError.message}` : undefined,
  };
}

export async function updateTask(
  taskId: string,
  input: TaskInput,
): Promise<{ ok: true; task: Task; warning?: string } | Fail> {
  const me = await getCurrentEmployee();
  if (!me) return fail(SESSION_ENDED);
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
    return fail("Hanya admin dan CEO yang boleh memindahkan tugas ke departemen lain.");
  }

  const { data, error } = await supabase.from("tasks").update(row).eq("id", taskId).select("id");
  if (error) return fail(`Gagal menyimpan: ${error.message}`);
  if (!data?.length) return fail("Anda tidak berhak mengubah tugas ini.");

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

  const task = await reloadTask(taskId);
  revalidatePath("/tugas");
  if (!task) return fail("Tugas tersimpan, tetapi gagal dimuat ulang. Muat ulang halaman.");
  return { ok: true, task, warning };
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
