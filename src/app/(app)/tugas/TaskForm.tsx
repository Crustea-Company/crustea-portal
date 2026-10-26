"use client";

import { useState, useTransition } from "react";
import type { Employee } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  canCreateInDept,
  type EmployeeLite,
  type Sprint,
  type Task,
} from "@/lib/tasks";
import { createTask, updateTask, type TaskInput } from "./actions";
import PeoplePicker from "./PeoplePicker";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100";

// Jendela tambah / ubah tugas. Di HP tampil penuh layar.
export default function TaskForm({
  task,
  me,
  employees,
  departments,
  sprints,
  defaultSprintId,
  onClose,
  onSaved,
}: {
  task: Task | null; // null = tugas baru
  me: Pick<Employee, "id" | "app_role" | "dept_code">;
  employees: EmployeeLite[];
  departments: { code: string; name: string }[];
  sprints: Sprint[];
  defaultSprintId: number | null;
  onClose: () => void;
  onSaved: (task: Task, isNew: boolean, warning?: string) => void;
}) {
  const people = (role: "pic" | "support") =>
    task ? task.task_people.filter((p) => p.role === role).map((p) => p.employee_id) : [];

  const [input, setInput] = useState<TaskInput>(() => ({
    dept_code: task?.dept_code ?? me.dept_code ?? departments[0]?.code ?? "",
    title: task?.title ?? "",
    workstream: task?.workstream ?? "",
    output: task?.output ?? "",
    status: task?.status ?? "not_started",
    start_date: task?.start_date ?? "",
    deadline: task?.deadline ?? "",
    is_priority: task?.is_priority ?? false,
    sprint_id: task ? task.sprint_id : defaultSprintId,
    notes: task?.notes ?? "",
    pics: task ? people("pic") : [me.id],
    supports: people("support"),
  }));
  const [pickerFor, setPickerFor] = useState<"pic" | "support" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setInput((cur) => ({ ...cur, [key]: value }));
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "?";
  const canMoveDept = me.app_role === "admin" || me.app_role === "ceo";
  const deptOptions = departments.filter((d) => (task ? canMoveDept || d.code === task.dept_code : canCreateInDept(d.code, me)));

  const togglePerson = (role: "pic" | "support", id: string) => {
    const key = role === "pic" ? "pics" : "supports";
    const other = role === "pic" ? "supports" : "pics";
    setInput((cur) => ({
      ...cur,
      [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id],
      // Satu orang tidak bisa sekaligus PIC dan support.
      [other]: cur[other].filter((x) => x !== id),
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = task ? await updateTask(task.id, input) : await createTask(input);
      if (!res.ok) return setError(res.message);
      onSaved(res.task, !task, res.warning);
    });
  };

  const chips = (role: "pic" | "support") => {
    const ids = role === "pic" ? input.pics : input.supports;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-900"
          >
            {nameOf(id)}
            <button
              type="button"
              aria-label={`Lepas ${nameOf(id)}`}
              onClick={() => togglePerson(role, id)}
              className="text-brand-700 hover:text-red-700"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setPickerFor(pickerFor === role ? null : role)}
          className="rounded-full border border-dashed border-slate-400 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {pickerFor === role ? "Selesai memilih" : "+ Pilih"}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="flex max-h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            {task ? `Ubah tugas ${task.code ?? ""}` : "Tambah tugas"}
          </h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-slate-500" aria-label="Tutup">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Judul tugas
            <textarea
              value={input.title}
              onChange={(e) => set("title", e.target.value)}
              required
              rows={2}
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Departemen
              <select
                value={input.dept_code}
                onChange={(e) => set("dept_code", e.target.value)}
                disabled={deptOptions.length <= 1}
                className={inputClass}
              >
                {deptOptions.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Status
              <select
                value={input.status}
                onChange={(e) => set("status", e.target.value as TaskInput["status"])}
                className={inputClass}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Tanggal mulai
              <input
                type="date"
                value={input.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Deadline
              <input
                type="date"
                value={input.deadline}
                onChange={(e) => set("deadline", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Sprint
              <select
                value={input.sprint_id ?? ""}
                onChange={(e) => set("sprint_id", e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
              >
                <option value="">Tanpa sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatDate(s.start_date)} - {formatDate(s.end_date)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700">
              <input
                type="checkbox"
                checked={input.is_priority}
                onChange={(e) => set("is_priority", e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
              Prioritas
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-slate-700">PIC (minimal satu)</p>
            {chips("pic")}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-slate-700">Support</p>
            {chips("support")}
          </div>
          {pickerFor && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Pilih {pickerFor === "pic" ? "PIC" : "support"} (klik nama untuk memilih / melepas)
              </p>
              <PeoplePicker
                employees={employees}
                departments={departments}
                myDept={me.dept_code}
                selected={pickerFor === "pic" ? input.pics : input.supports}
                onPick={(id) => togglePerson(pickerFor, id)}
              />
            </div>
          )}

          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Workstream <span className="font-normal text-slate-500">(boleh kosong)</span>
            <input value={input.workstream} onChange={(e) => set("workstream", e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Output <span className="font-normal text-slate-500">(boleh kosong)</span>
            <textarea value={input.output} onChange={(e) => set("output", e.target.value)} rows={2} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Keterangan <span className="font-normal text-slate-500">(boleh kosong)</span>
            <textarea value={input.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass} />
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? "Menyimpan..." : task ? "Simpan perubahan" : "Tambah tugas"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
