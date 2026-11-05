"use client";

import { useRef, useState } from "react";

// Tombol "Unduh template Excel" + "Isi dari Excel". File dibaca di browser lalu dibuang (tidak diunggah ke server).
export default function XlsxButtons({
  onDownload,
  onFile,
  hint,
}: {
  onDownload: () => Promise<void>;
  onFile: (file: File) => Promise<string[] | void>; // mengembalikan peringatan (bila ada)
  hint: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);

  async function run(fn: () => Promise<string[] | void>, done: string | null) {
    setBusy(true);
    setMsg(null);
    try {
      const warnings = (await fn()) ?? [];
      if (done) setMsg({ ok: true, lines: [done, ...warnings] });
    } catch (e) {
      setMsg({ ok: false, lines: [e instanceof Error ? e.message : "Gagal memproses file."] });
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100 disabled:opacity-60";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand-300 p-3">
      <p className="text-xs text-slate-600">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(onDownload, null)} className={btn}>
          ⬇ Unduh template Excel
        </button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn}>
          ⬆ Isi dari Excel
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) run(() => onFile(file), "Form sudah diisi dari Excel. Periksa lagi, lalu simpan.");
          }}
        />
      </div>
      {msg && (
        <ul className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700"}`}>
          {msg.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
