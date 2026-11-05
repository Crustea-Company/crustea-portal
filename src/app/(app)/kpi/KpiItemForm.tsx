"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEPT_ORDER, type KpiItem } from "@/lib/kpi";
import { deleteKpiItem, saveKpiItem, type KpiInput } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hint = "font-normal text-slate-500";

export type KpiFormOptions = {
  depts: string[]; // departemen yang boleh dipilih pengguna ini
  people: { id: string; full_name: string; dept_code: string | null }[];
  objectives: { code: string; objective: string; dept_code: string }[];
};

// Tambah / ubah item KPI (admin, CEO, head departemen item; dicek juga oleh aturan database write_kpi).
export default function KpiItemForm({
  item,
  defaultDept,
  options,
  onDone,
}: {
  item: KpiItem | null;
  defaultDept: string;
  options: KpiFormOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<KpiInput>({
    objective_code: item?.objective_code ?? "",
    objective: item?.objective ?? "",
    dept_code: item?.dept_code ?? (options.depts.includes(defaultDept) ? defaultDept : options.depts[0]),
    item: item?.item ?? "",
    pic_type: item?.pic_type ?? "person",
    pic_id: item?.pic_id ?? "",
    target_value: item?.target_value ?? null,
    target_unit: item?.target_unit ?? "",
    target_period: item?.target_period === "quarter" ? "quarter" : "",
    target_weeks: item?.target_weeks ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<KpiInput>) => setF((x) => ({ ...x, ...patch }));
  const objectives = options.objectives.filter((o) => o.dept_code === f.dept_code);
  const people = [...options.people].sort(
    (a, b) => Number(b.dept_code === f.dept_code) - Number(a.dept_code === f.dept_code) || a.full_name.localeCompare(b.full_name),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await saveKpiItem(f, item?.id ?? null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    onDone();
    router.refresh();
  }

  async function remove() {
    if (!item || !confirm(`Hapus item KPI "${item.item}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setPending(true);
    const res = await deleteKpiItem(item.id);
    setPending(false);
    if (!res.ok) return setError(res.message);
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_10rem_1fr]">
        <label className={labelClass}>
          Departemen
          <select value={f.dept_code} onChange={(e) => set({ dept_code: e.target.value })} className={inputClass}>
            {DEPT_ORDER.filter((d) => options.depts.includes(d)).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span>
            Kode objective <span className={hint}>(mis. BDS-A.1)</span>
          </span>
          <input
            required
            list={`kpi-obj-${item?.id ?? "baru"}`}
            value={f.objective_code}
            onChange={(e) => {
              const code = e.target.value;
              const found = objectives.find((o) => o.code === code);
              set({ objective_code: code, ...(found ? { objective: found.objective } : {}) });
            }}
            className={inputClass}
          />
          <datalist id={`kpi-obj-${item?.id ?? "baru"}`}>
            {objectives.map((o) => (
              <option key={o.code} value={o.code}>
                {o.objective}
              </option>
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          Objective
          <input required value={f.objective} onChange={(e) => set({ objective: e.target.value })} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        Item KPI
        <textarea required rows={2} value={f.item} onChange={(e) => set({ item: e.target.value })} className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          PIC
          <select
            value={f.pic_type === "department" ? "__dept" : f.pic_id}
            onChange={(e) =>
              e.target.value === "__dept" ? set({ pic_type: "department", pic_id: "" }) : set({ pic_type: "person", pic_id: e.target.value })
            }
            className={inputClass}
          >
            <option value="" disabled>
              Pilih PIC
            </option>
            <option value="__dept">Departemen {f.dept_code} (semua anggota)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
                {p.dept_code ? ` (${p.dept_code})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Target
            <input
              type="number"
              step="any"
              min={0}
              value={f.target_value ?? ""}
              onChange={(e) => set({ target_value: e.target.value === "" ? null : Number(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Satuan
            <input value={f.target_unit} onChange={(e) => set({ target_unit: e.target.value })} placeholder="mis. lead" className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          Periode target
          <select value={f.target_period} onChange={(e) => set({ target_period: e.target.value as KpiInput["target_period"] })} className={inputClass}>
            <option value="">-</option>
            <option value="quarter">Per kuartal</option>
          </select>
        </label>
        <label className={labelClass}>
          <span>
            Minggu target <span className={hint}>(bulan-minggu, mis. 9-W1;9-W2)</span>
          </span>
          <input value={f.target_weeks} onChange={(e) => set({ target_weeks: e.target.value })} className={inputClass} />
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Menyimpan..." : item ? "Simpan perubahan" : "Tambah item"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
          Batal
        </button>
        {item && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Hapus item
          </button>
        )}
      </div>
    </form>
  );
}

// Tombol "+ Tambah item KPI" di atas daftar.
export function NewKpiItem({ defaultDept, options }: { defaultDept: string; options: KpiFormOptions }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
      >
        + Tambah item KPI
      </button>
    );
  }
  return <KpiItemForm item={null} defaultDept={defaultDept} options={options} onDone={() => setOpen(false)} />;
}
