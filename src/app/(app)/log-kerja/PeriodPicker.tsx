"use client";

import { useRouter } from "next/navigation";

export default function PeriodPicker({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Periode"
      value={value}
      onChange={(e) => router.push(`/log-kerja?periode=${e.target.value}`)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
