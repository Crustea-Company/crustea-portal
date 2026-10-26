"use client";

import { useRouter } from "next/navigation";

export default function PeriodPicker({
  value,
  options,
  employeeId,
}: {
  value: string;
  options: { value: string; label: string }[];
  employeeId: string | null; // diisi saat admin melihat log karyawan lain
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Periode"
      value={value}
      onChange={(e) => {
        const qs = new URLSearchParams({ periode: e.target.value });
        if (employeeId) qs.set("karyawan", employeeId);
        router.push(`/log-kerja?${qs}`);
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
