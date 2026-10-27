"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { createQuarter } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

// Buat target kuartal baru (admin, CEO). Sumber & strategi disalin dari kuartal terakhir.
export default function NewQuarter({ defaultYear, defaultQuarter }: { defaultYear: number; defaultQuarter: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(defaultYear);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50">
        + Kuartal baru
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setPending(true);
        const res = await createQuarter(year, quarter, total);
        setPending(false);
        if (!res.ok) return setError(res.message);
        setOpen(false);
        router.push(`/kpi/target?q=${res.id}`);
        router.refresh();
      }}
      className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <p className="text-sm font-semibold text-slate-900">Target kuartal baru</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tahun" className={inputClass} />
        <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} aria-label="Kuartal" className={inputClass}>
          <option value={1}>Q1 (Jan-Mar)</option>
          <option value={2}>Q2 (Apr-Jun)</option>
          <option value={3}>Q3 (Jul-Sep)</option>
          <option value={4}>Q4 (Okt-Des)</option>
        </select>
        <div className="col-span-2 sm:col-span-1">
          <RupiahInput value={total} onChange={setTotal} />
        </div>
      </div>
      <p className="text-xs text-slate-500">Sumber, bobot, dan strategi disalin dari kuartal terakhir; proyeksi diisi ulang lewat &quot;Ubah target&quot;.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Membuat..." : "Buat"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
          Batal
        </button>
      </div>
    </form>
  );
}
