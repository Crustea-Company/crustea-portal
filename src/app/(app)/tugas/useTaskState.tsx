"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Employee } from "@/lib/auth";
import type { EmployeeLite, Sprint, Task, TaskNote, TaskStatus } from "@/lib/tasks";
import { deleteTask, updateTaskStatus } from "./actions";
import TaskCard, { type CardCtx } from "./TaskCard";
import TaskForm from "./TaskForm";

export type TaskStateInit = {
  tasks: Task[];
  notes: TaskNote[];
  reminders: { task_id: string; remind_at: string }[];
  employees: EmployeeLite[];
  departments: { code: string; name: string }[];
  sprints: Sprint[];
  me: Pick<Employee, "id" | "app_role" | "dept_code">;
  today: string;
};

// Semua isi dan aksi kartu tugas (status, catatan, pengingat, delegasi, ubah, hapus),
// dipakai bersama oleh halaman Tugas dan bagian "Perlu diselesaikan" di Dashboard.
export function useTaskState(
  init: TaskStateInit,
  opts: { highlightFromHash?: boolean; defaultSprintId?: number | null } = {},
) {
  const { employees, departments, sprints, me, today } = init;

  const [tasks, setTasks] = useState(init.tasks);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const [notesByTask, setNotesByTask] = useState(() => {
    const map = new Map<string, TaskNote[]>();
    for (const n of init.notes) map.set(n.task_id, [...(map.get(n.task_id) ?? []), n]);
    return map;
  });
  const [reminders, setReminders] = useState(
    () => new Map(init.reminders.map((r) => [r.task_id, r.remind_at])),
  );
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Link dari notifikasi / riwayat / dashboard (#task-<id>): gulir ke tugas itu dan sorot sebentar.
  const { highlightFromHash } = opts;
  useEffect(() => {
    if (!highlightFromHash) return;
    const match = window.location.hash.match(/^#task-(.+)$/);
    if (!match) return;
    const el = document.getElementById(`task-${match[1]}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(match[1]);
    const timer = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightFromHash]);

  const nameOf = useMemo(() => {
    const map = new Map(employees.map((e) => [e.id, e.full_name]));
    return (id: string) => map.get(id) ?? "?";
  }, [employees]);

  const sprintName = useMemo(() => {
    const map = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: number | null) => (id == null ? null : (map.get(id) ?? null));
  }, [sprints]);

  const changeStatus = useCallback((task: Task, status: TaskStatus) => {
    const previous = task.status;
    setMessage(null);
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    startTransition(async () => {
      const result = await updateTaskStatus(task.id, status);
      if (!result.ok) {
        setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
        setMessage({ ok: false, text: result.message });
      }
    });
  }, []);

  const removeTask = useCallback((task: Task) => {
    if (!window.confirm(`Hapus tugas ${task.code ?? ""} "${task.title}"? Tindakan ini tercatat di riwayat.`)) return;
    setMessage(null);
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (!res.ok) return setMessage({ ok: false, text: res.message });
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      setMessage({ ok: true, text: `Tugas ${task.code ?? ""} dihapus.` });
    });
  }, []);

  const ctx: CardCtx = {
    today,
    me,
    employees,
    departments,
    nameOf,
    sprintName,
    highlightId,
    onChangeStatus: changeStatus,
    onTaskChange: (task) => setTasks((ts) => ts.map((t) => (t.id === task.id ? task : t))),
    onNotesChange: (taskId, list) => setNotesByTask((m) => new Map(m).set(taskId, list)),
    onReminderChange: (taskId, at) =>
      setReminders((m) => {
        const next = new Map(m);
        if (at) next.set(taskId, at);
        else next.delete(taskId);
        return next;
      }),
    onEdit: (task) => setEditing(task),
    onDelete: removeTask,
  };

  const card = (
    t: Task,
    extra: { compact?: boolean; href?: string; selected?: boolean; onToggleSelect?: () => void } = {},
  ) => (
    <TaskCard
      key={t.id}
      task={t}
      notes={notesByTask.get(t.id) ?? []}
      reminder={reminders.get(t.id) ?? null}
      ctx={ctx}
      compact={extra.compact}
      href={extra.href}
      selected={extra.selected}
      onToggleSelect={extra.onToggleSelect}
    />
  );

  const messageBox = message && (
    <p
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        message.ok ? "border-brand-200 bg-brand-50 text-brand-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {message.text}
    </p>
  );

  const form = editing && (
    <TaskForm
      task={editing === "new" ? null : editing}
      me={me}
      employees={employees}
      departments={departments}
      sprints={sprints}
      defaultSprintId={opts.defaultSprintId ?? null}
      onClose={() => setEditing(null)}
      onSaved={(task, isNew, warning) => {
        setTasks((ts) => (isNew ? [task, ...ts] : ts.map((t) => (t.id === task.id ? task : t))));
        setEditing(null);
        setMessage(
          warning
            ? { ok: false, text: warning }
            : { ok: true, text: isNew ? `Tugas ${task.code ?? ""} ditambahkan.` : `Tugas ${task.code ?? ""} disimpan.` },
        );
      }}
    />
  );

  // Untuk ubah/hapus banyak tugas sekaligus.
  const replaceTasks = useCallback((updated: Task[]) => {
    const byId = new Map(updated.map((t) => [t.id, t]));
    setTasks((ts) => ts.map((t) => byId.get(t.id) ?? t));
  }, []);
  const dropTasks = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setTasks((ts) => ts.filter((t) => !gone.has(t.id)));
  }, []);

  return {
    tasks,
    card,
    nameOf,
    openNew: () => setEditing("new"),
    messageBox,
    form,
    replaceTasks,
    dropTasks,
    notify: setMessage,
  };
}
