"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Markdown from "@/components/Markdown";
import { saveProcedure, type ProcedureInput } from "./actions";

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

// Form tambah/ubah prosedur (khusus admin) dengan pratinjau tampilan.
export default function ProcedureEditor({
  id,
  initial,
  departments,
}: {
  id: string | null;
  initial: ProcedureInput;
  departments: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ProcedureInput>(k: K, v: ProcedureInput[K]) => setInput((c) => ({ ...c, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveProcedure(input, id);
      if (!res.ok) return setError(res.message);
      router.push(`/prosedur/${res.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Judul
        <input required value={input.title} onChange={(e) => set("title", e.target.value)} className={field} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Kode SOP <span className="font-normal text-slate-500">(boleh kosong, mis. SOP-CA-09)</span>
          <input value={input.sop_code} onChange={(e) => set("sop_code", e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Departemen
          <select value={input.dept_code} onChange={(e) => set("dept_code", e.target.value)} className={field}>
            <option value="">Umum (semua departemen)</option>
            {departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Urutan tampil
          <input
            type="number"
            value={input.sort_order}
            onChange={(e) => set("sort_order", Number(e.target.value))}
            className={field}
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Isi prosedur</p>
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
            {(["tulis", "pratinjau"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 font-medium ${tab === t ? "bg-brand-700 text-white" : "text-slate-700"}`}
              >
                {t === "tulis" ? "Tulis" : "Pratinjau"}
              </button>
            ))}
          </div>
        </div>
        {tab === "tulis" ? (
          <>
            <textarea
              value={input.body}
              onChange={(e) => set("body", e.target.value)}
              rows={18}
              className={`${field} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Format: <code>## Judul</code>, <code>**tebal**</code>, daftar dengan <code>1.</code> atau <code>-</code>,
              tabel dengan <code>|</code>, link <code>[teks](/alamat)</code>. Lihat hasilnya di tab Pratinjau.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {input.body.trim() ? <Markdown>{input.body}</Markdown> : <p className="text-sm text-slate-500">Belum ada isi.</p>}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan prosedur"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
