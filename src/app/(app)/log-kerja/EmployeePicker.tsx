"use client";

import { useRouter } from "next/navigation";

// Khusus admin: memilih karyawan yang log kerjanya ingin dilihat atau dikoreksi.
export default function EmployeePicker({
  value,
  period,
  options,
}: {
  value: string;
  period: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      Lihat log karyawan
      <select
        value={value}
        onChange={(e) =>
          router.push(`/log-kerja?${new URLSearchParams({ karyawan: e.target.value, periode: period })}`)
        }
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
