"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Markdown from "@/components/Markdown";
import { findRanges, normalizeText, searchTerms } from "@/lib/search";

export type ProcedureRow = {
  id: string;
  sop_code: string | null;
  title: string;
  dept_code: string | null;
  sort_order: number;
  updated_at: string;
  body: string;
  excerpt?: string;
};

// Beri warna pada kata yang dicari di teks pendek (judul, kode SOP).
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ranges = findRanges(text, terms);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) parts.push(text.slice(pos, a));
    parts.push(
      <mark key={a} className="rounded bg-amber-200/70 px-0.5 text-inherit">
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

// Daftar prosedur: "Umum" lalu per departemen. Klik judul untuk membaca isinya di tempat
// (buka-tutup); halaman khusus hanya lewat "Lihat detail". Pencarian langsung saat mengetik
// di judul, kode SOP, dan seluruh isi (termasuk baris "Kata kunci").
export default function ProcedureList({
  rows,
  departments,
}: {
  rows: ProcedureRow[];
  departments: { code: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  // Prosedur yang dibuka/ditutup pengguna. Saat mencari, semua hasil terbuka kecuali yang ditutup.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;

  const haystacks = useMemo(
    () => new Map(rows.map((r) => [r.id, normalizeText(`${r.title} ${r.sop_code ?? ""} ${r.body}`)])),
    [rows],
  );
  const visible = searching ? rows.filter((r) => terms.every((t) => haystacks.get(r.id)!.includes(t))) : rows;

  const groups = [
    { key: "", label: "Umum (semua departemen)", items: visible.filter((r) => !r.dept_code) },
    ...departments.map((d) => ({
      key: d.code,
      label: `${d.code} · ${d.name}`,
      items: visible.filter((r) => r.dept_code === d.code),
    })),
  ].filter((g) => g.items.length > 0);

  const isOpen = (id: string) => searching !== toggled.has(id);
  const toggle = (id: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-[var(--app-header-h,0px)] z-10 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setToggled(new Set());
          }}
          placeholder="Cari prosedur, kode SOP, atau isi..."
          aria-label="Cari prosedur"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        />
        {searching && (
          <p className="mt-1.5 text-xs text-slate-500">
            {visible.length === 0 ? "Tidak ada hasil" : `${visible.length} prosedur cocok`}
          </p>
        )}
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Tidak ada prosedur yang cocok. Coba kata lain atau lebih sedikit kata.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key || "umum"}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((r) => {
              const open = isOpen(r.id);
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                    >
                      ▸
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {r.sop_code && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-800">
                            <Highlight text={r.sop_code} terms={terms} />
                          </span>
                        )}
                        <span className="font-semibold text-slate-900">
                          <Highlight text={r.title} terms={terms} />
                        </span>
                      </span>
                      {!open && <span className="line-clamp-1 text-xs text-slate-500">{r.excerpt || "Belum ada isi."}</span>}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
                      {r.body.trim() ? (
                        <Markdown highlight={terms}>{r.body}</Markdown>
                      ) : (
                        <p className="text-sm text-slate-500">Isi prosedur ini belum ditulis.</p>
                      )}
                      <Link
                        href={`/prosedur/${r.id}`}
                        className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline"
                      >
                        Lihat detail →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
