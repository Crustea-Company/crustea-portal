"use client";

import Link from "next/link";
import { useState } from "react";

export type ProcedureRow = {
  id: string;
  sop_code: string | null;
  title: string;
  dept_code: string | null;
  sort_order: number;
  updated_at: string;
  excerpt?: string;
};

// Daftar prosedur: "Umum" lalu per departemen, dengan pencarian judul, kode SOP, dan isi.
export default function ProcedureList({
  rows,
  departments,
}: {
  rows: (ProcedureRow & { body?: string })[];
  departments: { code: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      !q ||
      r.title.toLowerCase().includes(q) ||
      (r.sop_code ?? "").toLowerCase().includes(q) ||
      (r.body ?? "").toLowerCase().includes(q),
  );

  const groups = [
    { key: "", label: "Umum (semua departemen)", items: visible.filter((r) => !r.dept_code) },
    ...departments.map((d) => ({
      key: d.code,
      label: `${d.code} · ${d.name}`,
      items: visible.filter((r) => r.dept_code === d.code),
    })),
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari prosedur, kode SOP, atau isi..."
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
      />

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Tidak ada prosedur yang cocok.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key || "umum"}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.items.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/prosedur/${r.id}`}
                  className="flex h-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
                >
                  <span className="flex items-center gap-2">
                    {r.sop_code && (
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-800">{r.sop_code}</span>
                    )}
                    <span className="font-semibold text-slate-900">{r.title}</span>
                  </span>
                  <span className="line-clamp-2 text-xs text-slate-500">{r.excerpt || "Belum ada isi."}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
