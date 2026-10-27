"use client";

import { formatNumber } from "@/lib/format";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

// Isian rupiah: hanya angka, tampil dengan titik ribuan (mis. 1.250.000).
export default function RupiahInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  id?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={value ? formatNumber(value) : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 15);
          onChange(digits ? Number(digits) : 0);
        }}
        className={inputClass}
      />
    </div>
  );
}
