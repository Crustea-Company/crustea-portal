"use client";

import { useRef, useState } from "react";

// Tombol salin teks ke papan klip (untuk ditempel ke WhatsApp). Bila browser menolak,
// teksnya ditampilkan di kotak yang bisa dipilih dan disalin manual.
export default function CopyButton({ texts }: { texts: string[] }) {
  const [done, setDone] = useState<number | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(texts[i]);
      setFallback(null);
      setDone(i);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(null), 2000);
    } catch {
      setFallback(texts[i]);
    }
  }

  const many = texts.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {texts.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => copy(i)}
            className="rounded-lg bg-brand-800 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-900"
          >
            {done === i ? "Tersalin ✓" : many ? `Salin pesan ${i + 1}/${texts.length}` : "Salin untuk WhatsApp"}
          </button>
        ))}
      </div>
      {fallback !== null && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-slate-600">Browser tidak mengizinkan salin otomatis. Pilih teks di bawah lalu salin manual.</p>
          <textarea
            readOnly
            value={fallback}
            rows={8}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
