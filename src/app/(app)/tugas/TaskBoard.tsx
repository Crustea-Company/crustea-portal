"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Employee } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  canEditTask,
  defaultSprint,
  isOverdue,
  type Sprint,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { updateTaskStatus } from "./actions";

export type Filters = {
  dept: string; // "" = semua departemen
  sprint: string; // "semua", "tanpa", atau id sprint
  pic: string; // "" = semua, "saya", atau id karyawan
  status: "" | TaskStatus;
  overdue: boolean;
  priorityOnly: boolean;
  from: string; // deadline dari (YYYY-MM-DD), "" = tanpa batas
  to: string; // deadline sampai
  sort: "deadline" | "priority" | "title";
  dir: "asc" | "desc";
  view: "list" | "grid" | "kanban" | "pic";
};

const VIEWS: { key: Filters["view"]; label: string }[] = [
  { key: "list", label: "Daftar" },
  { key: "grid", label: "Grid" },
  { key: "kanban", label: "Kanban" },
  { key: "pic", label: "Per PIC" },
];

const SORT_DIR_LABEL: Record<Filters["sort"], [string, string]> = {
  deadline: ["Terdekat dulu", "Terjauh dulu"],
  priority: ["Prioritas di atas", "Prioritas di bawah"],
  title: ["A-Z", "Z-A"],
};

const byDeadline = (a: Task, b: Task, dir: 1 | -1) => {
  // Tugas tanpa deadline selalu di paling bawah.
  if (!a.deadline || !b.deadline) return (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1);
  return dir * a.deadline.localeCompare(b.deadline);
};

function compareTasks(a: Task, b: Task, sort: Filters["sort"], dir: Filters["dir"]): number {
  const d = dir === "asc" ? 1 : -1;
  const byCode = (a.code ?? "").localeCompare(b.code ?? "", "id", { numeric: true });
  if (sort === "title") return d * a.title.localeCompare(b.title, "id", { sensitivity: "base" }) || byCode;
  if (sort === "priority") {
    return d * (Number(b.is_priority) - Number(a.is_priority)) || byDeadline(a, b, 1) || byCode;
  }
  return byDeadline(a, b, d) || byCode;
}

type Props = {
  tasks: Task[];
  employees: { id: string; full_name: string; is_active: boolean }[];
  departments: { code: string; name: string }[];
  sprints: Sprint[];
  me: Pick<Employee, "id" | "app_role" | "dept_code">;
  today: string;
  initial: Partial<Filters>;
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-300",
  on_going: "bg-sky-50 text-sky-800 border-sky-300",
  done: "bg-teal-50 text-teal-800 border-teal-300",
};

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

export default function TaskBoard(props: Props) {
  const { employees, departments, sprints, me, today } = props;

  const [tasks, setTasks] = useState(props.tasks);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [filters, setFilters] = useState<Filters>(() => ({
    dept: props.initial.dept ?? "",
    sprint:
      props.initial.sprint ??
      String(defaultSprint(sprints, today)?.id ?? "semua"),
    pic: props.initial.pic ?? "",
    status: props.initial.status ?? "",
    overdue: props.initial.overdue ?? false,
    priorityOnly: props.initial.priorityOnly ?? false,
    from: props.initial.from ?? "",
    to: props.initial.to ?? "",
    sort: props.initial.sort ?? "deadline",
    dir: props.initial.dir ?? "asc",
    view: props.initial.view ?? "list",
  }));
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  // Simpan pilihan filter di alamat halaman, supaya bisa dibagikan atau di-bookmark.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.dept) qs.set("dept", filters.dept);
    qs.set("sprint", filters.sprint);
    if (filters.pic) qs.set("pic", filters.pic);
    if (filters.status) qs.set("status", filters.status);
    if (filters.overdue) qs.set("terlambat", "1");
    if (filters.priorityOnly) qs.set("prioritas", "1");
    if (filters.from) qs.set("dari", filters.from);
    if (filters.to) qs.set("sampai", filters.to);
    if (filters.sort !== "deadline") qs.set("urut", filters.sort === "priority" ? "prioritas" : "judul");
    if (filters.dir === "desc") qs.set("arah", "turun");
    if (filters.view !== "list") qs.set("tampilan", filters.view);
    window.history.replaceState(null, "", `/tugas?${qs}`);
  }, [filters]);

  const nameOf = useMemo(() => {
    const map = new Map(employees.map((e) => [e.id, e.full_name]));
    return (id: string) => map.get(id) ?? "?";
  }, [employees]);

  const sprintName = useMemo(() => {
    const map = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: number | null) => (id == null ? null : map.get(id) ?? null);
  }, [sprints]);

  // Pilihan PIC: hanya orang yang memang pernah jadi PIC.
  const picOptions = useMemo(() => {
    const ids = new Set(
      props.tasks.flatMap((t) =>
        t.task_people.filter((p) => p.role === "pic").map((p) => p.employee_id),
      ),
    );
    return employees.filter((e) => ids.has(e.id));
  }, [props.tasks, employees]);

  const visible = useMemo(() => {
    const picId = filters.pic === "saya" ? me.id : filters.pic;
    return tasks
      .filter((t) => !filters.dept || t.dept_code === filters.dept)
      .filter((t) =>
        filters.sprint === "semua"
          ? true
          : filters.sprint === "tanpa"
            ? t.sprint_id == null
            : String(t.sprint_id) === filters.sprint,
      )
      .filter(
        (t) =>
          !picId ||
          t.task_people.some((p) => p.role === "pic" && p.employee_id === picId),
      )
      .filter((t) => !filters.status || t.status === filters.status)
      .filter((t) => !filters.overdue || isOverdue(t, today))
      .filter((t) => !filters.priorityOnly || t.is_priority)
      .filter((t) => !filters.from || (!!t.deadline && t.deadline >= filters.from))
      .filter((t) => !filters.to || (!!t.deadline && t.deadline <= filters.to))
      .sort((a, b) => compareTasks(a, b, filters.sort, filters.dir));
  }, [tasks, filters, me.id, today]);

  const overdueCount = visible.filter((t) => isOverdue(t, today)).length;

  const byDept = departments
    .map((d) => ({ dept: d, tasks: visible.filter((t) => t.dept_code === d.code) }))
    .filter((g) => g.tasks.length > 0);

  function changeStatus(task: Task, status: TaskStatus) {
    const previous = task.status;
    setMessage(null);
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    startTransition(async () => {
      const result = await updateTaskStatus(task.id, status);
      if (!result.ok) {
        setTasks((ts) =>
          ts.map((t) => (t.id === task.id ? { ...t, status: previous } : t)),
        );
        setMessage(result.message);
      }
    });
  }

  const cardProps = { today, me, nameOf, sprintName, onChangeStatus: changeStatus };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tugas</h1>
          <p className="text-sm text-slate-600">
            {formatNumber(visible.length)} tugas
            {overdueCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-red-700">
                  {formatNumber(overdueCount)} terlambat
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => set("view", v.key)}
              className={`rounded-md px-2.5 py-1.5 font-medium sm:px-3 ${
                filters.view === v.key ? "bg-teal-700 text-white" : "text-slate-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <select
          aria-label="Departemen"
          className={selectClass}
          value={filters.dept}
          onChange={(e) => set("dept", e.target.value)}
        >
          <option value="">Semua departemen</option>
          {departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sprint"
          className={selectClass}
          value={filters.sprint}
          onChange={(e) => set("sprint", e.target.value)}
        >
          <option value="semua">Semua sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name} ({formatDate(s.start_date)} - {formatDate(s.end_date)})
            </option>
          ))}
          <option value="tanpa">Tanpa sprint</option>
        </select>
        <select
          aria-label="PIC"
          className={selectClass}
          value={filters.pic}
          onChange={(e) => set("pic", e.target.value)}
        >
          <option value="">Semua PIC</option>
          <option value="saya">Saya sebagai PIC</option>
          {picOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
              {e.is_active ? "" : " (nonaktif)"}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={selectClass}
          value={filters.status}
          onChange={(e) => set("status", e.target.value as Filters["status"])}
        >
          <option value="">Semua status</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="col-span-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-1">
          <input
            type="checkbox"
            checked={filters.overdue}
            onChange={(e) => set("overdue", e.target.checked)}
            className="h-4 w-4 accent-red-600"
          />
          Hanya yang terlambat
        </label>
      </div>

      <div className="-mt-3 mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <select
          aria-label="Urutkan berdasarkan"
          className={selectClass}
          value={filters.sort}
          onChange={(e) => set("sort", e.target.value as Filters["sort"])}
        >
          <option value="deadline">Urutkan: Deadline</option>
          <option value="priority">Urutkan: Prioritas</option>
          <option value="title">Urutkan: Judul A-Z</option>
        </select>
        <select
          aria-label="Arah urutan"
          className={selectClass}
          value={filters.dir}
          onChange={(e) => set("dir", e.target.value as Filters["dir"])}
        >
          <option value="asc">{SORT_DIR_LABEL[filters.sort][0]}</option>
          <option value="desc">{SORT_DIR_LABEL[filters.sort][1]}</option>
        </select>
        <label className="flex flex-col text-xs text-slate-500">
          Deadline dari
          <input
            type="date"
            value={filters.from}
            onChange={(e) => set("from", e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Deadline sampai
          <input
            type="date"
            value={filters.to}
            onChange={(e) => set("to", e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 self-end rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-1">
          <input
            type="checkbox"
            checked={filters.priorityOnly}
            onChange={(e) => set("priorityOnly", e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          Hanya prioritas
        </label>
      </div>

      {message && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {message}
        </p>
      )}

      {byDept.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Tidak ada tugas yang cocok dengan filter.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {byDept.map(({ dept, tasks: deptTasks }) => (
          <section key={dept.code}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {dept.code} · {dept.name}{" "}
              <span className="font-normal normal-case">({formatNumber(deptTasks.length)})</span>
            </h2>

            {filters.view === "list" ? (
              <div className="flex flex-col gap-2">
                {deptTasks.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            ) : filters.view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {deptTasks.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            ) : filters.view === "pic" ? (
              <PicColumns
                tasks={deptTasks}
                onlyPic={filters.pic === "saya" ? me.id : filters.pic}
                cardProps={cardProps}
              />
            ) : (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                {STATUS_ORDER.map((status) => {
                  const column = deptTasks.filter((t) => t.status === status);
                  return (
                    <div
                      key={status}
                      className="w-[85%] shrink-0 snap-start rounded-xl bg-slate-100 p-2 md:w-auto"
                    >
                      <p className="mb-2 px-1 text-sm font-semibold text-slate-700">
                        {STATUS_LABEL[status]} ({formatNumber(column.length)})
                      </p>
                      <div className="flex flex-col gap-2">
                        {column.map((t) => (
                          <TaskCard key={t.id} task={t} {...cardProps} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

function TaskCard({
  task,
  today,
  me,
  nameOf,
  sprintName,
  onChangeStatus,
  compact = false,
}: CardProps & {
  task: Task;
  compact?: boolean; // kartu kecil untuk tampilan Per PIC
}) {
  const overdue = isOverdue(task, today);
  const editable = canEditTask(task, me);
  const pics = task.task_people.filter((p) => p.role === "pic").map((p) => nameOf(p.employee_id));
  const supports = task.task_people
    .filter((p) => p.role === "support")
    .map((p) => nameOf(p.employee_id));
  const sprint = sprintName(task.sprint_id);

  return (
    <article
      className={`rounded-xl border bg-white shadow-sm ${compact ? "p-2.5 text-xs" : "p-3 text-sm"} ${
        overdue ? "border-red-300" : "border-slate-200"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {task.code && <span className="font-mono text-slate-500">{task.code}</span>}
        {task.is_priority && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
            Prioritas
          </span>
        )}
        {overdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">
            Terlambat
          </span>
        )}
        {sprint && !compact && <span className="text-slate-500">{sprint}</span>}
      </div>

      <p className="font-medium text-slate-900">{task.title}</p>

      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <p>
          Deadline:{" "}
          <span className={overdue ? "font-semibold text-red-700" : ""}>
            {formatDate(task.deadline)}
          </span>
        </p>
        {!compact && <p>PIC: {pics.length ? pics.join(", ") : "-"}</p>}
        {supports.length > 0 && !compact && <p>Support: {supports.join(", ")}</p>}
      </div>

      <div className={compact ? "mt-2" : "mt-3"}>
        {editable ? (
          <select
            aria-label="Ubah status"
            value={task.status}
            onChange={(e) => onChangeStatus(task, e.target.value as TaskStatus)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[task.status]}`}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>
        )}
      </div>

      {!compact && <TaskDetails task={task} />}
    </article>
  );
}

type CardProps = {
  today: string;
  me: Props["me"];
  nameOf: (id: string) => string;
  sprintName: (id: number | null) => string | null;
  onChangeStatus: (task: Task, status: TaskStatus) => void;
};

// Tampilan Per PIC: satu kolom per PIC, berdampingan. Tugas dengan beberapa PIC
// muncul di kolom setiap PIC-nya. Di HP satu PIC per layar, digeser ke samping.
function PicColumns({
  tasks,
  onlyPic,
  cardProps,
}: {
  tasks: Task[];
  onlyPic: string;
  cardProps: CardProps;
}) {
  const columns = new Map<string, Task[]>();
  for (const t of tasks) {
    const pics = t.task_people.filter((p) => p.role === "pic").map((p) => p.employee_id);
    for (const id of pics.length ? pics : [""]) {
      if (onlyPic && id !== onlyPic) continue;
      columns.set(id, [...(columns.get(id) ?? []), t]);
    }
  }
  const ordered = [...columns.entries()].sort(([a], [b]) =>
    !a ? 1 : !b ? -1 : cardProps.nameOf(a).localeCompare(cardProps.nameOf(b), "id"),
  );

  return (
    <>
      {ordered.length > 1 && (
        <p className="mb-2 text-xs text-slate-500 md:hidden">
          {ordered.length} PIC · geser ke samping untuk PIC berikutnya
        </p>
      )}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0">
        {ordered.map(([id, picTasks], i) => (
          <div
            key={id || "tanpa-pic"}
            className="w-full shrink-0 snap-start rounded-xl bg-slate-100 p-2 md:w-64"
          >
            <p className="mb-2 flex items-baseline justify-between gap-2 px-1 text-sm font-semibold text-slate-700">
              <span className="truncate">{id ? cardProps.nameOf(id) : "Tanpa PIC"}</span>
              <span className="shrink-0 text-xs font-normal text-slate-500">
                {picTasks.length} tugas
                <span className="md:hidden">
                  {" "}
                  · {i + 1}/{ordered.length}
                </span>
              </span>
            </p>
            <div className="flex flex-col gap-2">
              {picTasks.map((t) => (
                <TaskCard key={t.id} task={t} compact {...cardProps} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

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
            <dt className="inline font-semibold">Catatan: </dt>
            <dd className="inline whitespace-pre-line">{task.notes}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
