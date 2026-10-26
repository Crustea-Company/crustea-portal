"use client";

import { useRouter } from "next/navigation";

export default function DeptFilter({
  value,
  departments,
}: {
  value: string;
  departments: { code: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Departemen"
      value={value}
      onChange={(e) => router.push(e.target.value ? `/tugas/riwayat?dept=${e.target.value}` : "/tugas/riwayat")}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
    >
      <option value="">Semua departemen</option>
      {departments.map((d) => (
        <option key={d.code} value={d.code}>
          {d.code} · {d.name}
        </option>
      ))}
    </select>
  );
}
