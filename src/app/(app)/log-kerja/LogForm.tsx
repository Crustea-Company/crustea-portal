"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWorkLog, type FormState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

export default function LogForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addWorkLog, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Kosongkan aktivitas, durasi, dan bukti setelah tersimpan; tanggal dibiarkan.
  useEffect(() => {
    if (state?.ok && formRef.current) {
      const form = formRef.current;
      for (const name of ["activity", "hours", "minutes", "proof"]) {
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el) el.value = "";
      }
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Tanggal
          <input type="date" name="log_date" defaultValue={today} max={today} required className={inputClass} />
        </label>
        <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Durasi
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="hours"
              min={0}
              max={24}
              inputMode="numeric"
              placeholder="0"
              aria-label="Jam"
              className={`${inputClass} w-20`}
            />
            <span className="text-slate-500">jam</span>
            <input
              type="number"
              name="minutes"
              min={0}
              max={59}
              step={5}
              inputMode="numeric"
              placeholder="0"
              aria-label="Menit"
              className={`${inputClass} w-20`}
            />
            <span className="text-slate-500">menit</span>
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Aktivitas
        <textarea
          name="activity"
          required
          rows={2}
          placeholder="Contoh: Rapat dengan BUMDES Amanah"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Bukti <span className="font-normal text-slate-500">(link atau keterangan, boleh kosong)</span>
        <input type="text" name="proof" placeholder="https://..." className={inputClass} />
      </label>

      {state && (
        <p className={`text-sm ${state.ok ? "text-teal-700" : "text-red-700"}`}>{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan..." : "Simpan log"}
      </button>
    </form>
  );
}
