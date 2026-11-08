"use client";

import { useActionState } from "react";
import { enterCode, type EnterState } from "./actions";

export default function CodeForm({ notice }: { notice: string | null }) {
  const [state, action, pending] = useActionState<EnterState, FormData>(enterCode, null);
  const message = state?.message ?? notice;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-white/90">
        Kode akses investor
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX"
          className="w-full rounded-xl border border-white/20 bg-white/90 px-4 py-3 text-center font-mono text-lg tracking-wider text-slate-900 outline-none focus:ring-2 focus:ring-logo-lime"
        />
      </label>
      {message && <p className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-white">{message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-logo-lime px-4 py-3 font-semibold text-brand-950 hover:brightness-95 disabled:opacity-60"
      >
        {pending ? "Memeriksa…" : "Buka dashboard"}
      </button>
      <p className="text-center text-xs text-white/60">Kode diberikan oleh tim Crustea. Halaman ini hanya untuk melihat, tidak bisa mengubah data.</p>
    </form>
  );
}
