"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatNumber } from "@/lib/format";
import { quarterLabel, type QuarterTarget, type TargetSource } from "@/lib/kpi";
import { saveTarget, type SourceInput } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600";

const toInput = (sources: TargetSource[]): SourceInput[] =>
  sources.map((s) => ({
    id: s.id,
    name: s.name,
    division: s.division,
    weight: s.weight,
    alloc_label: s.alloc_label,
    from_sales: s.from_sales,
    strategies: s.strategies.map((g) => ({ id: g.id, strategy: g.strategy, projection: g.projection })),
  }));

// Ubah target total, sumber (bobot, divisi PIC), dan strategi satu kuartal (admin, CEO).
export default function TargetEditor({ target, sources }: { target: QuarterTarget; sources: TargetSource[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(target.total);
  const [notes, setNotes] = useState(target.notes ?? "");
  const [rows, setRows] = useState<SourceInput[]>(() => toInput(sources));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<SourceInput>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setStrategy = (i: number, k: number, patch: Partial<SourceInput["strategies"][number]>) =>
    setRow(i, { strategies: rows[i].strategies.map((g, j) => (j === k ? { ...g, ...patch } : g)) });
  const weightSum = rows.reduce((s, r) => s + (r.weight ?? 0), 0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTotal(target.total);
          setNotes(target.notes ?? "");
          setRows(toInput(sources));
          setError("");
          setOpen(true);
        }}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Ubah target
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setPending(true);
          const res = await saveTarget(target.id, { total, notes, sources: rows });
          setPending(false);
          if (!res.ok) return setError(res.message);
          setOpen(false);
          router.refresh();
        }}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
      >
        <p className="font-semibold text-slate-900">Ubah target {quarterLabel(target)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Target total kuartal
            <RupiahInput value={total} onChange={setTotal} />
          </label>
          <label className={labelClass}>
            Catatan
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className={`text-xs ${weightSum === 100 ? "text-slate-500" : "text-amber-700"}`}>Jumlah bobot: {formatNumber(weightSum)}%</p>

        {rows.map((r, i) => (
          <fieldset key={r.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className={`${labelClass} col-span-2`}>
                Sumber
                <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Divisi PIC
                <input value={r.division} onChange={(e) => setRow(i, { division: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Bobot (%)
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={r.weight ?? ""}
                  placeholder="tanpa target"
                  onChange={(e) => setRow(i, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
              <label className={`${labelClass} col-span-2`}>
                Label alokasi pendapatan
                <input value={r.alloc_label} placeholder={r.name} onChange={(e) => setRow(i, { alloc_label: e.target.value })} className={inputClass} />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={r.from_sales}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => ({ ...x, from_sales: j === i ? e.target.checked : e.target.checked ? false : x.from_sales })))}
                  className="h-4 w-4 accent-brand-700"
                />
                Realisasi otomatis dari Pipeline penjualan
              </label>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-600">Strategi & proyeksi</p>
              {r.strategies.map((g, k) => (
                <div key={g.id ?? `g-${k}`} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_auto]">
                  <input
                    value={g.strategy}
                    placeholder="Nama strategi"
                    onChange={(e) => setStrategy(i, k, { strategy: e.target.value })}
                    className={`${inputClass} col-span-2 sm:col-span-1`}
                  />
                  <RupiahInput value={g.projection} onChange={(n) => setStrategy(i, k, { projection: n })} />
                  <button
                    type="button"
                    onClick={() => setRow(i, { strategies: r.strategies.filter((_, j) => j !== k) })}
                    className="rounded-lg px-2 text-sm text-red-600 hover:bg-red-50"
                    aria-label="Hapus strategi"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRow(i, { strategies: [...r.strategies, { id: null, strategy: "", projection: 0 }] })}
                className="self-start text-xs font-medium text-brand-700 hover:underline"
              >
                + Strategi
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Hapus sumber "${r.name || "baru"}" beserta strateginya?`)) setRows((rs) => rs.filter((_, j) => j !== i));
              }}
              className="self-end text-xs font-medium text-red-600 hover:underline"
            >
              Hapus sumber
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { id: null, name: "", division: "", weight: null, alloc_label: "", from_sales: false, strategies: [] }])}
          className="self-start rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          + Sumber
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {pending ? "Menyimpan..." : "Simpan"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
