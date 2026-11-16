"use client";

import { useRef, useState } from "react";
import type { ApplyResult, DiffItem, RowValues } from "@/lib/bulk-sheet";
import BulkPreview from "./BulkPreview";

// Hasil membaca file + membandingkan dengan data portal (dikerjakan modul).
export type BulkPrepared = { items: DiffItem[]; guarded: boolean; warnings: string[]; exportedAt?: string; baselines?: Map<string, RowValues> | null };

export type BulkModule = {
  exportFile: () => Promise<void>;
  // Baca file di browser, ambil data terkini dari server, bandingkan.
  prepare: (file: File) => Promise<BulkPrepared>;
  // Terapkan baris terpilih; satu hasil per baris.
  apply: (items: DiffItem[], baselines?: Map<string, RowValues> | null) => Promise<ApplyResult[]>;
  allowDelete: boolean;
};

// Tombol "Ekspor Excel" / "Impor Excel" + pratinjau. File dibaca di browser dan tidak disimpan di server.
export default function BulkSheetButtons({ module, onApplied }: { module: BulkModule; onApplied?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<BulkPrepared | null>(null);

  async function run<T>(fn: () => Promise<T>, then?: (v: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const v = await fn();
      then?.(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses file.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100 disabled:opacity-60";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(module.exportFile)} className={btn}>
          ⬇ Ekspor Excel
        </button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn}>
          ⬆ Impor Excel
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) run(() => module.prepare(file), setPrepared);
          }}
        />
      </div>
      {busy && <p className="text-xs text-slate-500">Memproses…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {prepared && (
        <BulkPreview
          prepared={prepared}
          allowDelete={module.allowDelete}
          apply={(items) => module.apply(items, prepared.baselines)}
          onClose={(applied) => {
            setPrepared(null);
            if (applied) onApplied?.();
          }}
        />
      )}
    </div>
  );
}
