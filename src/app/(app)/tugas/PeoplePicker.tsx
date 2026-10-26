"use client";

import { useMemo, useState } from "react";
import type { EmployeeLite } from "@/lib/tasks";

// Pemilih karyawan dengan dua tab: "Departemen sendiri" dan "Departemen lain"
// (dikelompokkan per departemen), plus kotak pencarian. Hanya karyawan aktif.
export default function PeoplePicker({
  employees,
  departments,
  myDept,
  selected,
  disabled = [],
  disabledLabel = "sudah dipilih",
  suggestions = [],
  suggestionLabel = "Disarankan",
  onPick,
}: {
  employees: EmployeeLite[];
  departments: { code: string; name: string }[];
  myDept: string | null;
  selected: string[];
  disabled?: string[];
  disabledLabel?: string;
  suggestions?: string[];
  suggestionLabel?: string;
  onPick: (id: string) => void;
}) {
  const [tab, setTab] = useState<"own" | "other">("own");
  const [query, setQuery] = useState("");

  const active = useMemo(() => employees.filter((e) => e.is_active), [employees]);
  const q = query.trim().toLowerCase();
  const matches = (e: EmployeeLite) => !q || e.full_name.toLowerCase().includes(q);

  const own = active.filter((e) => e.dept_code === myDept && matches(e));
  const otherGroups = departments
    .filter((d) => d.code !== myDept)
    .map((d) => ({ dept: d, people: active.filter((e) => e.dept_code === d.code && matches(e)) }))
    .filter((g) => g.people.length > 0);
  const suggested = active.filter((e) => suggestions.includes(e.id));

  const row = (e: EmployeeLite) => {
    const isSelected = selected.includes(e.id);
    const isDisabled = disabled.includes(e.id);
    return (
      <li key={e.id}>
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onPick(e.id)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
            isSelected ? "bg-brand-50 font-semibold text-brand-900" : "hover:bg-slate-100"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span className="truncate">{e.full_name}</span>
          <span className="shrink-0 text-xs text-slate-500">
            {isDisabled ? disabledLabel : isSelected ? "✓ dipilih" : ""}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {suggested.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">{suggestionLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={disabled.includes(e.id)}
                onClick={() => onPick(e.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  selected.includes(e.id)
                    ? "border-brand-600 bg-brand-50 font-semibold text-brand-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                } disabled:opacity-50`}
              >
                {e.full_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
        {(
          [
            ["own", "Departemen sendiri"],
            ["other", "Departemen lain"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              tab === key ? "bg-brand-700 text-white" : "text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari nama..."
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
      />

      <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
        {tab === "own" ? (
          own.length ? (
            <ul>{own.map(row)}</ul>
          ) : (
            <p className="p-3 text-center text-xs text-slate-500">Tidak ada nama yang cocok.</p>
          )
        ) : otherGroups.length ? (
          otherGroups.map((g) => (
            <div key={g.dept.code} className="mb-1">
              <p className="sticky top-0 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {g.dept.code} · {g.dept.name}
              </p>
              <ul>{g.people.map(row)}</ul>
            </div>
          ))
        ) : (
          <p className="p-3 text-center text-xs text-slate-500">Tidak ada nama yang cocok.</p>
        )}
      </div>
    </div>
  );
}
