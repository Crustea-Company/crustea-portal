"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobdescItem } from "@/lib/jobdesc";
import { saveJobdesc } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600";

// Ubah jobdesc (admin & CEO): satu baris = satu lingkup tanggung jawab + kata kunci pencocokan.
export default function JobdescEditor({ employeeId, items }: { employeeId: string; items: JobdescItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(items.map((i) => ({ item: i.item, keywords: i.keywords ?? "" })));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
        {items.length ? "Ubah jobdesc" : "+ Isi jobdesc"}
      </button>
    );
  }

  async function save() {
    setError("");
    setPending(true);
    const res = await saveJobdesc(employeeId, rows);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <p className="text-xs text-slate-600">
        Kata kunci (dipisah koma) dipakai untuk mendeteksi penugasan di luar jobdesc, mis. <i>paten, HKI, DJKI, merek</i>. Bila kosong, kata dari uraian yang dipakai.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200 sm:grid-cols-[1fr_16rem_auto]">
          <input value={r.item} onChange={(e) => setRow(i, { item: e.target.value })} placeholder="Lingkup tanggung jawab" className={inputClass} aria-label="Uraian jobdesc" />
          <input value={r.keywords} onChange={(e) => setRow(i, { keywords: e.target.value })} placeholder="Kata kunci" className={inputClass} aria-label="Kata kunci" />
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded px-2 text-red-700 hover:bg-red-50" aria-label="Hapus baris">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((x) => [...x, { item: "", keywords: "" }])} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
        + Tambah baris
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Menyimpan..." : "Simpan jobdesc"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
          Batal
        </button>
      </div>
    </div>
  );
}
