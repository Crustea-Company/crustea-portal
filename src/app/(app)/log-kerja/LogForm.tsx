"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWorkLog, updateWorkLog, type FormState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

type Defaults = { log_date: string; activity: string; minutes: number; proof: string | null };

// Kolom isian yang sama untuk form catat baru dan form ubah.
function LogFields({ today, defaults }: { today: string; defaults?: Defaults }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Tanggal
          <input
            type="date"
            name="log_date"
            defaultValue={defaults?.log_date ?? today}
            max={today}
            required
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Durasi
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="hours"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="0"
              aria-label="Jam"
              defaultValue={defaults ? Math.floor(defaults.minutes / 60) : undefined}
              className={`${inputClass} w-20`}
            />
            <span className="text-slate-500">jam</span>
            <input
              type="number"
              name="minutes"
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              placeholder="0"
              aria-label="Menit"
              defaultValue={defaults ? defaults.minutes % 60 : undefined}
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
          defaultValue={defaults?.activity}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Bukti <span className="font-normal text-slate-500">(link atau keterangan, boleh kosong)</span>
        <input
          type="text"
          name="proof"
          placeholder="https://..."
          defaultValue={defaults?.proof ?? undefined}
          className={inputClass}
        />
      </label>
    </>
  );
}

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
      <LogFields today={today} />

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

export function EditLogForm({
  id,
  today,
  defaults,
  onDone,
}: {
  id: string;
  today: string;
  defaults: Defaults;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateWorkLog, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <LogFields today={today} defaults={defaults} />

      {state && !state.ok && <p className="text-sm text-red-700">{state.message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan perubahan"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
