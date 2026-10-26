"use client";

import { useState } from "react";
import type { EmployeeOption } from "@/lib/access";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 disabled:text-slate-400";

export default function ExportPanel({
  employees,
  meId,
  periods,
  defaultPeriod,
  today,
}: {
  employees: EmployeeOption[];
  meId: string;
  periods: { value: string; label: string }[];
  defaultPeriod: string;
  today: string;
}) {
  const [mode, setMode] = useState<"periode" | "rentang">("periode");

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 font-semibold text-slate-900">
        Unduh Excel
        <span className="text-sm font-normal text-brand-700 group-open:hidden">Buka</span>
        <span className="hidden text-sm font-normal text-slate-500 group-open:inline">Tutup</span>
      </summary>

      {/* Form biasa (GET): kolom yang dinonaktifkan tidak ikut terkirim. */}
      <form action="/log-kerja/unduh" method="get" className="flex flex-col gap-3 border-t border-slate-100 p-4">
        {employees.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Karyawan
            <select name="karyawan" defaultValue={meId} className={inputClass}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.dept_code ? ` (${e.dept_code})` : ""}
                  {e.is_active ? "" : " - nonaktif"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="karyawan" value={meId} />
        )}

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "periode"}
              onChange={() => setMode("periode")}
              className="accent-brand-700"
            />
            Per periode
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "rentang"}
              onChange={() => setMode("rentang")}
              className="accent-brand-700"
            />
            Rentang tanggal
          </label>
        </div>

        {mode === "periode" ? (
          <select name="periode" defaultValue={defaultPeriod} aria-label="Periode" className={inputClass}>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Dari
              <input type="date" name="dari" required max={today} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Sampai
              <input type="date" name="sampai" required defaultValue={today} className={inputClass} />
            </label>
          </div>
        )}

        <button
          type="submit"
          className="rounded-lg bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800"
        >
          Unduh file Excel
        </button>
      </form>
    </details>
  );
}
