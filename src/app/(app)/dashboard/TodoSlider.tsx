"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import { compareTasks, type SortDir, type Task, type TaskSort } from "@/lib/tasks";
import { useTaskState, type TaskStateInit } from "../tugas/useTaskState";

const MAX_CARDS = 20;

const SORT_OPTIONS: { value: string; label: string; sort: TaskSort; dir: SortDir }[] = [
  { value: "deadline-asc", label: "Deadline terdekat", sort: "deadline", dir: "asc" },
  { value: "deadline-desc", label: "Deadline terjauh", sort: "deadline", dir: "desc" },
  { value: "priority-asc", label: "Prioritas dulu", sort: "priority", dir: "asc" },
  { value: "title-asc", label: "Judul A-Z", sort: "title", dir: "asc" },
  { value: "title-desc", label: "Judul Z-A", sort: "title", dir: "desc" },
];

const taskLink = (t: Task) =>
  `/tugas?${new URLSearchParams({ dept: t.dept_code, sprint: "semua" })}#task-${t.id}`;

// "Perlu diselesaikan": quick link ke tugas yang belum selesai, dengan fitur kartu yang sama
// seperti di halaman Tugas. Slider: HP 1 kartu + sebagian berikutnya, desktop 3 kartu.
export default function TodoSlider(props: TaskStateInit) {
  const { me } = props;
  const { tasks, card, messageBox, form } = useTaskState(props);

  // Daftar ditetapkan saat halaman dibuka, supaya kartu tidak langsung hilang
  // ketika statusnya diubah (mis. ke Pending lalu mengatur pengingat).
  const [mineIds, deptIds] = useMemo(() => {
    const open = props.tasks.filter((t) => t.status !== "done");
    return [
      new Set(open.filter((t) => t.task_people.some((p) => p.role === "pic" && p.employee_id === me.id)).map((t) => t.id)),
      new Set(open.filter((t) => t.dept_code === me.dept_code).map((t) => t.id)),
    ];
  }, [props.tasks, me.id, me.dept_code]);

  const [tab, setTab] = useState<"mine" | "dept">("mine");
  const [sortKey, setSortKey] = useState(SORT_OPTIONS[0].value);
  const scroller = useRef<HTMLDivElement>(null);

  const sort = SORT_OPTIONS.find((o) => o.value === sortKey) ?? SORT_OPTIONS[0];
  const ids = tab === "mine" ? mineIds : deptIds;
  const list = tasks.filter((t) => ids.has(t.id)).sort((a, b) => compareTasks(a, b, sort.sort, sort.dir));
  const shown = list.slice(0, MAX_CARDS);
  const allLink =
    tab === "mine"
      ? "/tugas?pic=saya&sprint=semua"
      : `/tugas?${new URLSearchParams({ dept: me.dept_code ?? "", sprint: "semua" })}`;

  const scrollBy = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth, behavior: "smooth" });
  const slideWidth = "w-[85%] shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(
            [
              ["mine", `Tugas saya (${formatNumber(mineIds.size)})`],
              ["dept", `Tugas departemen saya (${formatNumber(deptIds.size)})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                scroller.current?.scrollTo({ left: 0 });
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${tab === key ? "bg-teal-700 text-white" : "text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <select
            aria-label="Urutkan"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              scroller.current?.scrollTo({ left: 0 });
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-teal-600"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Geser ke kiri"
            className="hidden h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-100 md:block"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Geser ke kanan"
            className="hidden h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-100 md:block"
          >
            ›
          </button>
        </div>
      </div>

      {messageBox}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Tidak ada tugas yang belum selesai. Mantap!
        </p>
      ) : (
        <div
          ref={scroller}
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0"
        >
          {shown.map((t) => (
            <div key={t.id} className={slideWidth}>
              {card(t, { href: taskLink(t) })}
            </div>
          ))}
          <Link
            href={allLink}
            className={`${slideWidth} flex min-h-40 items-center justify-center self-stretch rounded-xl border border-dashed border-teal-300 bg-teal-50 p-3 text-center text-sm font-semibold text-teal-800 hover:bg-teal-100`}
          >
            {list.length > MAX_CARDS
              ? `Lihat semua ${formatNumber(list.length)} tugas di halaman Tugas`
              : "Buka di halaman Tugas"}
          </Link>
        </div>
      )}

      {form}
    </div>
  );
}
