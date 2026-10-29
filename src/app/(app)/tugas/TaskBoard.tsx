"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import {
  SORT_DIR_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  compareTasks,
  defaultSprint,
  isOverdue,
  canDeleteTask,
  canEditTask,
  type SortDir,
  type Task,
  type TaskSort,
  type TaskStatus,
} from "@/lib/tasks";
import { useTaskState, type TaskStateInit } from "./useTaskState";
import BulkBar from "./BulkBar";

export type Filters = {
  dept: string; // "" = semua departemen
  sprint: string; // "semua", "tanpa", atau id sprint
  pic: string; // "" = semua, "saya", atau id karyawan
  status: "" | TaskStatus;
  overdue: boolean;
  priorityOnly: boolean;
  from: string; // deadline dari (YYYY-MM-DD), "" = tanpa batas
  to: string; // deadline sampai
  sort: TaskSort;
  dir: SortDir;
  view: "list" | "grid" | "kanban" | "pic";
};

const VIEWS: { key: Filters["view"]; label: string }[] = [
  { key: "list", label: "Daftar" },
  { key: "grid", label: "Grid" },
  { key: "kanban", label: "Kanban" },
  { key: "pic", label: "Per PIC" },
];

type Props = TaskStateInit & { initial: Partial<Filters> };

// Di HP: deretan kontrol yang bisa digeser ke samping. Di layar lebar: grid 5 kolom.
const sliderRow =
  "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0";
const sliderItem = "w-44 shrink-0 snap-start md:w-auto";
const control =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

// Filter -> query string halaman (?dept=..&sprint=..).
function toQuery(filters: Filters): URLSearchParams {
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
  return qs;
}

export default function TaskBoard(props: Props) {
  const { departments, sprints, me, today, employees } = props;

  const [filters, setFilters] = useState<Filters>(() => ({
    dept: props.initial.dept ?? "",
    sprint: props.initial.sprint ?? String(defaultSprint(sprints, today)?.id ?? "semua"),
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
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const { tasks, card, nameOf, openNew, messageBox, form, replaceTasks, dropTasks, notify } = useTaskState(props, {
    highlightFromHash: true,
    defaultSprintId:
      filters.sprint !== "semua" && filters.sprint !== "tanpa" ? Number(filters.sprint) : null,
  });

  // Simpan pilihan filter di alamat halaman, supaya bisa dibagikan atau di-bookmark.
  useEffect(() => {
    window.history.replaceState(null, "", `/tugas?${toQuery(filters)}${window.location.hash}`);
  }, [filters]);

  // Server hanya memuat tugas sprint yang dilihat: ganti sprint = muat ulang data dari server.
  const router = useRouter();
  const changeSprint = (sprint: string) => {
    set("sprint", sprint);
    router.replace(`/tugas?${toQuery({ ...filters, sprint })}`, { scroll: false });
  };

  // Pilihan PIC: hanya orang yang memang pernah jadi PIC.
  const picOptions = useMemo(() => {
    const ids = new Set(
      props.tasks.flatMap((t) => t.task_people.filter((p) => p.role === "pic").map((p) => p.employee_id)),
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
      .filter((t) => !picId || t.task_people.some((p) => p.role === "pic" && p.employee_id === picId))
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

  // Mode "pilih banyak": hanya tugas yang boleh Anda ubah yang bisa dipilih.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectableVisible = visible.filter((t) => canEditTask(t, me));
  const selectedTasks = tasks.filter((t) => selected.has(t.id));

  const cardFor = (t: Task, compact = false) =>
    card(t, {
      compact,
      ...(selectMode && canEditTask(t, me)
        ? { selected: selected.has(t.id), onToggleSelect: () => toggleSelect(t.id) }
        : {}),
    });

  return (
    <main className={`mx-auto max-w-6xl px-4 pt-6 ${selectMode ? "pb-48" : "pb-32"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Tugas</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectMode((m) => !m);
              setSelected(new Set());
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              selectMode
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {selectMode ? "Mode pilih aktif" : "Pilih banyak"}
          </button>
          <Link
            href="/tugas/riwayat"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Riwayat
          </Link>
        </div>
      </div>

      <p className="mb-2 text-sm text-slate-600">
        {formatNumber(visible.length)} tugas
        {overdueCount > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-red-700">{formatNumber(overdueCount)} terlambat</span>
          </>
        )}
        <span className="text-xs text-slate-500 md:hidden"> · geser baris filter untuk pilihan lain</span>
      </p>

      {/* Filter dan sortir menempel tepat di bawah header aplikasi saat halaman digulir. */}
      <div className="sticky top-[var(--app-header-h,0px)] z-30 -mx-4 mb-4 flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">

        <div className={sliderRow} aria-label="Filter">
          <select aria-label="Departemen" className={`${control} ${sliderItem}`} value={filters.dept} onChange={(e) => set("dept", e.target.value)}>
            <option value="">Semua departemen</option>
            {departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
          <select aria-label="Sprint" className={`${control} ${sliderItem}`} value={filters.sprint} onChange={(e) => changeSprint(e.target.value)}>
            <option value="semua">Semua sprint</option>
            {sprints.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({formatDate(s.start_date)} - {formatDate(s.end_date)})
              </option>
            ))}
            <option value="tanpa">Tanpa sprint</option>
          </select>
          <select aria-label="PIC" className={`${control} ${sliderItem}`} value={filters.pic} onChange={(e) => set("pic", e.target.value)}>
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
            className={`${control} ${sliderItem}`}
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
          <label className={`${control} ${sliderItem} flex items-center gap-2`}>
            <input
              type="checkbox"
              checked={filters.overdue}
              onChange={(e) => set("overdue", e.target.checked)}
              className="h-4 w-4 accent-red-600"
            />
            Hanya yang terlambat
          </label>
        </div>

        <div className={sliderRow} aria-label="Sortir">
          <select
            aria-label="Urutkan berdasarkan"
            className={`${control} ${sliderItem}`}
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as TaskSort)}
          >
            <option value="deadline">Urutkan: Deadline</option>
            <option value="priority">Urutkan: Prioritas</option>
            <option value="title">Urutkan: Judul A-Z</option>
          </select>
          <select
            aria-label="Arah urutan"
            className={`${control} ${sliderItem}`}
            value={filters.dir}
            onChange={(e) => set("dir", e.target.value as SortDir)}
          >
            <option value="asc">{SORT_DIR_LABEL[filters.sort][0]}</option>
            <option value="desc">{SORT_DIR_LABEL[filters.sort][1]}</option>
          </select>
          <label className={`${control} ${sliderItem} flex items-center gap-2`}>
            <input
              type="checkbox"
              checked={filters.priorityOnly}
              onChange={(e) => set("priorityOnly", e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            Hanya prioritas
          </label>
          <label className={`${control} ${sliderItem} flex items-center gap-1.5 text-slate-500`}>
            <span className="shrink-0 text-xs">Deadline dari</span>
            <input
              type="date"
              aria-label="Deadline dari"
              value={filters.from}
              onChange={(e) => set("from", e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
            />
          </label>
          <label className={`${control} ${sliderItem} flex items-center gap-1.5 text-slate-500`}>
            <span className="shrink-0 text-xs">sampai</span>
            <input
              type="date"
              aria-label="Deadline sampai"
              value={filters.to}
              onChange={(e) => set("to", e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
            />
          </label>
        </div>
      </div>

      {messageBox}

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
              <div className="flex flex-col gap-2">{deptTasks.map((t) => cardFor(t))}</div>
            ) : filters.view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{deptTasks.map((t) => cardFor(t))}</div>
            ) : filters.view === "pic" ? (
              <PicColumns
                tasks={deptTasks}
                onlyPic={filters.pic === "saya" ? me.id : filters.pic}
                nameOf={nameOf}
                card={(t) => cardFor(t, true)}
              />
            ) : (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                {STATUS_ORDER.map((status) => {
                  const column = deptTasks.filter((t) => t.status === status);
                  return (
                    <div key={status} className="w-[85%] shrink-0 snap-start rounded-xl bg-slate-100 p-2 sm:w-[45%] lg:w-auto">
                      <p className="mb-2 px-1 text-sm font-semibold text-slate-700">
                        {STATUS_LABEL[status]} ({formatNumber(column.length)})
                      </p>
                      <div className="flex flex-col gap-2">{column.map((t) => cardFor(t))}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      {form}
      {selectMode ? (
        <BulkBar
          selectedIds={[...selected]}
          deletableIds={selectedTasks.filter((t) => canDeleteTask(t, me)).map((t) => t.id)}
          visibleCount={selectableVisible.length}
          onSelectAll={() => setSelected(new Set(selectableVisible.map((t) => t.id)))}
          onClear={() => setSelected(new Set())}
          onExit={() => {
            setSelectMode(false);
            setSelected(new Set());
          }}
          onUpdated={replaceTasks}
          onDeleted={dropTasks}
          onMessage={notify}
          me={me}
          employees={employees}
          departments={departments}
          sprints={sprints}
        />
      ) : (
        <FloatingActions view={filters.view} onView={(v) => set("view", v)} onAdd={openNew} />
      )}
    </main>
  );
}

// Tampilan Per PIC: satu kolom per PIC, berdampingan. Tugas dengan beberapa PIC
// muncul di kolom setiap PIC-nya. Di HP satu PIC per layar, digeser ke samping.
function PicColumns({
  tasks,
  onlyPic,
  nameOf,
  card,
}: {
  tasks: Task[];
  onlyPic: string;
  nameOf: (id: string) => string;
  card: (t: Task) => React.ReactNode;
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
    !a ? 1 : !b ? -1 : nameOf(a).localeCompare(nameOf(b), "id"),
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
          <div key={id || "tanpa-pic"} className="w-full shrink-0 snap-start rounded-xl bg-slate-100 p-2 md:w-72">
            <p className="mb-2 flex items-baseline justify-between gap-2 px-1 text-sm font-semibold text-slate-700">
              <span className="truncate">{id ? nameOf(id) : "Tanpa PIC"}</span>
              <span className="shrink-0 text-xs font-normal text-slate-500">
                {picTasks.length} tugas
                <span className="md:hidden">
                  {" "}
                  · {i + 1}/{ordered.length}
                </span>
              </span>
            </p>
            <div className="flex flex-col gap-2">{picTasks.map((t) => card(t))}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Tombol bulat di pojok kanan bawah ----------

function ViewIcon({ view }: { view: Filters["view"] }) {
  const common = { viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true };
  if (view === "list")
    return (
      <svg {...common}>
        <circle cx="4" cy="6" r="1" fill="currentColor" />
        <circle cx="4" cy="12" r="1" fill="currentColor" />
        <circle cx="4" cy="18" r="1" fill="currentColor" />
        <path d="M9 6h12M9 12h12M9 18h12" />
      </svg>
    );
  if (view === "grid")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  if (view === "kanban")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="5" height="18" rx="1.5" />
        <rect x="10" y="3" width="5" height="12" rx="1.5" />
        <rect x="17" y="3" width="4" height="8" rx="1.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function FloatingActions({
  view,
  onView,
  onAdd,
}: {
  view: Filters["view"];
  onView: (v: Filters["view"]) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={boxRef} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              aria-label={`Tampilan ${v.label}`}
              aria-pressed={view === v.key}
              onClick={() => {
                onView(v.key);
                setOpen(false);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                view === v.key ? "bg-brand-700 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ViewIcon view={v.key} />
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ganti tampilan"
        aria-expanded={open}
        className="mr-1.5 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-md hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label="Tambah tugas"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
