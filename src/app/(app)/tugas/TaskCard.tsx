"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Employee } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_STYLE,
  canDeleteTask,
  canEditTask,
  isOverdue,
  type EmployeeLite,
  type Task,
  type TaskNote,
  type TaskStatus,
} from "@/lib/tasks";
import { addNote, clearReminder, delegateTask, deleteNote, setReminder, updateNote } from "./actions";
import PeoplePicker from "./PeoplePicker";

// Semua yang dibutuhkan kartu dari halaman Tugas.
export type CardCtx = {
  today: string;
  me: Pick<Employee, "id" | "app_role" | "dept_code">;
  employees: EmployeeLite[];
  departments: { code: string; name: string }[];
  nameOf: (id: string) => string;
  sprintName: (id: number | null) => string | null;
  highlightId: string | null;
  onChangeStatus: (task: Task, status: TaskStatus) => void;
  onTaskChange: (task: Task) => void;
  onNotesChange: (taskId: string, notes: TaskNote[]) => void;
  onReminderChange: (taskId: string, remindAt: string | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

type Panel = null | "notes" | "reminder" | "delegate";

const actionBtn =
  "rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-100";

export default function TaskCard({
  task,
  notes,
  reminder,
  ctx,
  compact = false,
  href,
  selected,
  onToggleSelect,
}: {
  task: Task;
  notes: TaskNote[];
  reminder: string | null;
  ctx: CardCtx;
  compact?: boolean; // kartu kecil untuk tampilan Per PIC
  href?: string; // kalau diisi, kartu bisa diklik untuk membuka tugas (quick link di Dashboard)
  selected?: boolean; // mode "pilih banyak": undefined = tidak bisa dipilih
  onToggleSelect?: () => void;
}) {
  const { today, me, nameOf } = ctx;
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const overdue = isOverdue(task, today);
  const editable = canEditTask(task, me);
  const deletable = canDeleteTask(task, me);
  const pics = task.task_people.filter((p) => p.role === "pic").map((p) => nameOf(p.employee_id));
  const supports = task.task_people.filter((p) => p.role === "support").map((p) => nameOf(p.employee_id));
  const sprint = ctx.sprintName(task.sprint_id);
  const highlighted = ctx.highlightId === task.id;

  return (
    <article
      id={`task-${task.id}`}
      onClick={(e) => {
        // Klik di tombol, pilihan, atau panel tidak ikut membuka halaman tugas.
        if (!href || (e.target as HTMLElement).closest("button,select,a,input,textarea,label,summary,details")) return;
        if ((e.target as HTMLElement).closest("[data-panel]")) return;
        router.push(href);
      }}
      className={`scroll-mt-40 rounded-xl border shadow-sm transition-colors duration-700 ${href ? "cursor-pointer hover:border-brand-400" : ""} ${
        compact ? "p-2.5 text-xs" : "p-3 text-sm"
      } ${
        selected
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
          : highlighted
          ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300"
          : overdue
            ? "border-red-300 bg-white"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            aria-label={`Pilih tugas ${task.code ?? task.title}`}
            className="h-4 w-4 accent-brand-700"
          />
        )}
        {task.code && <span className="font-mono text-slate-500">{task.code}</span>}
        {task.is_priority && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Prioritas</span>
        )}
        {overdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">Terlambat</span>
        )}
        {sprint && !compact && <span className="text-slate-500">{sprint}</span>}
      </div>

      {href ? (
        <Link href={href} className="font-medium text-slate-900 hover:text-brand-800 hover:underline">
          {task.title}
        </Link>
      ) : (
        <p className="font-medium text-slate-900">{task.title}</p>
      )}

      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <p>
          Deadline:{" "}
          <span className={overdue ? "font-semibold text-red-700" : ""}>{formatDate(task.deadline)}</span>
        </p>
        {!compact && <p>PIC: {pics.length ? pics.join(", ") : "-"}</p>}
        {supports.length > 0 && !compact && <p>Support: {supports.join(", ")}</p>}
        {reminder && (
          <p className="font-medium text-violet-700">Pengingat Anda: {formatDateTime(reminder)}</p>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 text-xs ${compact ? "mt-2" : "mt-3"}`}>
        {editable ? (
          <select
            aria-label="Ubah status"
            value={task.status}
            onChange={(e) => {
              const status = e.target.value as TaskStatus;
              ctx.onChangeStatus(task, status);
              if (status === "pending") setPanel("reminder");
            }}
            className={`rounded-full border px-2.5 py-1 font-semibold ${STATUS_STYLE[task.status]}`}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`rounded-full border px-2.5 py-1 font-semibold ${STATUS_STYLE[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </span>
        )}

        <button type="button" onClick={() => toggle("notes")} className={actionBtn}>
          Catatan{notes.length ? ` (${notes.length})` : ""}
        </button>
        {(task.status === "pending" || reminder) && (
          <button type="button" onClick={() => toggle("reminder")} className={actionBtn}>
            Pengingat
          </button>
        )}
        {editable && (
          <button type="button" onClick={() => toggle("delegate")} className={actionBtn}>
            Delegasikan
          </button>
        )}
        {editable && (
          <button type="button" onClick={() => ctx.onEdit(task)} className={actionBtn}>
            Ubah
          </button>
        )}
        {deletable && (
          <button
            type="button"
            onClick={() => ctx.onDelete(task)}
            className="rounded-lg border border-red-200 px-2 py-1 font-medium text-red-700 hover:bg-red-50"
          >
            Hapus
          </button>
        )}
      </div>

      <div data-panel>
        {panel === "reminder" && (
          <ReminderPanel task={task} reminder={reminder} ctx={ctx} onClose={() => setPanel(null)} />
        )}
        {panel === "notes" && <NotesPanel task={task} notes={notes} ctx={ctx} />}
        {panel === "delegate" && <DelegatePanel task={task} ctx={ctx} onClose={() => setPanel(null)} />}
      </div>

      {!compact && <TaskDetails task={task} />}
    </article>
  );
}

// ---------- Pengingat ----------

function tomorrowAt9(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

// "2026-10-27T02:00:00Z" -> "2026-10-27T09:00" (WIB) untuk isian tanggal & jam.
function toWibInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

function ReminderPanel({
  task,
  reminder,
  ctx,
  onClose,
}: {
  task: Task;
  reminder: string | null;
  ctx: CardCtx;
  onClose: () => void;
}) {
  const [value, setValue] = useState(reminder ? toWibInput(reminder) : tomorrowAt9(ctx.today));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await setReminder(task.id, value);
      if (!res.ok) return setError(res.message);
      ctx.onReminderChange(task.id, res.remind_at);
      onClose();
    });

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const res = await clearReminder(task.id);
      if (!res.ok) return setError(res.message);
      ctx.onReminderChange(task.id, null);
      onClose();
    });

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-xs">
      <label className="flex flex-col gap-1 font-medium text-violet-900">
        Ingatkan saya pada
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-sm"
        />
      </label>
      <p className="text-violet-800">Pengingat ini pribadi: hanya Anda yang menerimanya.</p>
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan pengingat"}
        </button>
        {reminder && (
          <button type="button" onClick={remove} disabled={pending} className={actionBtn}>
            Hapus pengingat
          </button>
        )}
        <button type="button" onClick={onClose} disabled={pending} className={actionBtn}>
          Tutup
        </button>
      </div>
    </div>
  );
}

// ---------- Catatan ----------

function NotesPanel({ task, notes, ctx }: { task: Task; notes: TaskNote[]; ctx: CardCtx }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      await fn();
    });

  const add = () =>
    run(async () => {
      const res = await addNote(task.id, draft);
      if (!res.ok) return setError(res.message);
      ctx.onNotesChange(task.id, [...notes, res.note]);
      setDraft("");
    });

  const save = (id: string) =>
    run(async () => {
      const res = await updateNote(id, editText);
      if (!res.ok) return setError(res.message);
      ctx.onNotesChange(task.id, notes.map((n) => (n.id === id ? res.note : n)));
      setEditingId(null);
    });

  const remove = (note: TaskNote) =>
    run(async () => {
      if (!window.confirm("Hapus catatan ini?")) return;
      const res = await deleteNote(note.id);
      if (!res.ok) return setError(res.message);
      ctx.onNotesChange(task.id, notes.filter((n) => n.id !== note.id));
    });

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
      {notes.length === 0 && <p className="text-slate-500">Belum ada catatan.</p>}
      {notes.map((n) => {
        const mine = n.author_id === ctx.me.id;
        return (
          <div key={n.id} className="rounded-lg bg-white p-2">
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">{ctx.nameOf(n.author_id)}</span> ·{" "}
              {formatDateTime(n.created_at)}
              {n.updated_at && " (diubah)"}
            </p>
            {editingId === n.id ? (
              <div className="mt-1 flex flex-col gap-1.5">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => save(n.id)}
                    disabled={pending}
                    className="rounded-lg bg-brand-700 px-3 py-1 font-semibold text-white disabled:opacity-60"
                  >
                    Simpan
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className={actionBtn}>
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-0.5 whitespace-pre-line text-slate-800">{n.body}</p>
                {(mine || ctx.me.app_role === "admin") && (
                  <div className="mt-1 flex gap-2">
                    {mine && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditText(n.body);
                        }}
                        className="font-medium text-brand-700"
                      >
                        Ubah
                      </button>
                    )}
                    <button type="button" onClick={() => remove(n)} className="font-medium text-red-700">
                      Hapus
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="Tambahkan catatan..."
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
      />
      {error && <p className="text-red-700">{error}</p>}
      <button
        type="button"
        onClick={add}
        disabled={pending || !draft.trim()}
        className="self-start rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {pending ? "Menyimpan..." : "Tambahkan catatan"}
      </button>
    </div>
  );
}

// ---------- Delegasi ----------

function DelegatePanel({ task, ctx, onClose }: { task: Task; ctx: CardCtx; onClose: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentPics = task.task_people.filter((p) => p.role === "pic").map((p) => p.employee_id);
  const supportIds = task.task_people.filter((p) => p.role === "support").map((p) => p.employee_id);

  const submit = () =>
    startTransition(async () => {
      if (!picked) return;
      setError(null);
      const res = await delegateTask(task.id, picked);
      if (!res.ok) return setError(res.message);
      ctx.onTaskChange({
        ...task,
        task_people: [...task.task_people, { employee_id: picked, role: "pic" }],
      });
      onClose();
    });

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 text-xs">
      <p className="font-semibold text-slate-800">Delegasikan kepada</p>
      <p className="text-slate-600">
        Orang yang dipilih ditambahkan sebagai PIC dan mendapat notifikasi. PIC yang sekarang tetap ada.
      </p>
      <PeoplePicker
        employees={ctx.employees}
        departments={ctx.departments}
        myDept={ctx.me.dept_code}
        selected={picked ? [picked] : []}
        disabled={currentPics}
        disabledLabel="sudah PIC"
        suggestions={supportIds}
        suggestionLabel="Support tugas ini"
        onPick={setPicked}
      />
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={!picked || pending}
          className="rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {pending ? "Memproses..." : picked ? `Delegasikan ke ${ctx.nameOf(picked)}` : "Pilih karyawan"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={actionBtn}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ---------- Rincian ----------

function TaskDetails({ task }: { task: Task }) {
  if (!(task.output || task.notes || task.workstream || task.start_date)) return null;
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer select-none text-slate-500">Rincian</summary>
      <dl className="mt-2 space-y-1">
        {task.workstream && (
          <div>
            <dt className="inline font-semibold">Workstream: </dt>
            <dd className="inline">{task.workstream}</dd>
          </div>
        )}
        {task.start_date && (
          <div>
            <dt className="inline font-semibold">Mulai: </dt>
            <dd className="inline">{formatDate(task.start_date)}</dd>
          </div>
        )}
        {task.output && (
          <div>
            <dt className="inline font-semibold">Output: </dt>
            <dd className="inline">{task.output}</dd>
          </div>
        )}
        {task.notes && (
          <div>
            <dt className="inline font-semibold">Keterangan: </dt>
            <dd className="inline whitespace-pre-line">{task.notes}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
