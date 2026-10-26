"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE, isOverdue, type TaskStatus } from "@/lib/tasks";

export type TodoTask = {
  id: string;
  code: string | null;
  title: string;
  dept_code: string;
  status: TaskStatus;
  deadline: string | null;
  is_priority: boolean;
  pics: string[];
};

const MAX_CARDS = 20;

// "Perlu diselesaikan": tugas Belum Mulai dan Berjalan, deadline terdekat lebih dulu,
// dalam slider kartu (HP: 1 kartu + sebagian kartu berikutnya, desktop: 3 kartu).
export default function TodoSlider({
  mine,
  dept,
  deptCode,
  today,
}: {
  mine: TodoTask[];
  dept: TodoTask[];
  deptCode: string | null;
  today: string;
}) {
  const [tab, setTab] = useState<"mine" | "dept">("mine");
  const scroller = useRef<HTMLDivElement>(null);

  const list = tab === "mine" ? mine : dept;
  const shown = list.slice(0, MAX_CARDS);
  const allLink =
    tab === "mine"
      ? "/tugas?pic=saya&sprint=semua"
      : `/tugas?${new URLSearchParams({ dept: deptCode ?? "", sprint: "semua" })}`;

  const scrollBy = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth, behavior: "smooth" });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(
            [
              ["mine", `Tugas saya (${formatNumber(mine.length)})`],
              ["dept", `Tugas departemen saya (${formatNumber(dept.length)})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                scroller.current?.scrollTo({ left: 0 });
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${
                tab === key ? "bg-teal-700 text-white" : "text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hidden gap-1 md:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Geser ke kiri"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Geser ke kanan"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            ›
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Tidak ada tugas yang belum selesai. Mantap!
        </p>
      ) : (
        <div
          ref={scroller}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0"
        >
          {shown.map((t) => {
            const overdue = isOverdue(t, today);
            return (
              <article
                key={t.id}
                className={`flex w-[80%] shrink-0 snap-start flex-col rounded-xl border bg-white p-3 text-sm shadow-sm sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)] ${
                  overdue ? "border-red-300" : "border-slate-200"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {t.code && <span className="font-mono text-slate-500">{t.code}</span>}
                  {t.is_priority && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                      Prioritas
                    </span>
                  )}
                  {overdue && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">
                      Terlambat
                    </span>
                  )}
                </div>
                <p className="line-clamp-3 font-medium text-slate-900">{t.title}</p>
                <div className="mt-auto space-y-0.5 pt-2 text-xs text-slate-600">
                  <p>
                    Deadline:{" "}
                    <span className={overdue ? "font-semibold text-red-700" : ""}>
                      {formatDate(t.deadline)}
                    </span>
                  </p>
                  <p className="truncate">PIC: {t.pics.length ? t.pics.join(", ") : "-"}</p>
                  <p>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </p>
                </div>
              </article>
            );
          })}
          <Link
            href={allLink}
            className="flex w-[60%] shrink-0 snap-start items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50 p-3 text-center text-sm font-semibold text-teal-800 hover:bg-teal-100 sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]"
          >
            {list.length > MAX_CARDS
              ? `Lihat semua ${formatNumber(list.length)} tugas di halaman Tugas`
              : "Buka di halaman Tugas"}
          </Link>
        </div>
      )}
    </div>
  );
}
