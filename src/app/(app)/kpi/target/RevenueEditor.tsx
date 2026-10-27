"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { REVENUE_STATUS, type Revenue } from "@/lib/kpi";
import { deleteRevenue, saveRevenue, type RevenueInput } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";

// Tombol + form catat / ubah pendapatan (F&A, admin, CEO).
export default function RevenueEditor({ revenue, labels, defaultDate }: { revenue: Revenue | null; labels: string[]; defaultDate: string }) {
  const router = useRouter();
  const init = (): RevenueInput => ({
    revenue_date: revenue?.revenue_date ?? defaultDate,
    amount: revenue?.amount ?? 0,
    allocation: revenue?.allocation ?? "",
    status: revenue?.status ?? "paid",
    description: revenue?.description ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RevenueInput>(init);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<RevenueInput>) => setForm((f) => ({ ...f, ...patch }));
  // Label lama yang sudah tidak ada di daftar sumber tetap bisa dipilih.
  const options = form.allocation && !labels.includes(form.allocation) ? [...labels, form.allocation] : labels;

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setError("");
    setPending(true);
    const res = await action();
    setPending(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return revenue ? (
      <button
        type="button"
        onClick={() => {
          setForm(init());
          setOpen(true);
        }}
        className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      >
        Ubah
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          setForm(init());
          setOpen(true);
        }}
        className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
      >
        + Catat pendapatan
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveRevenue(form, revenue?.id ?? null));
        }}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
      >
        <p className="font-semibold text-slate-900">{revenue ? "Ubah pendapatan" : "Catat pendapatan"}</p>
        <label className={labelClass}>
          Keterangan
          <input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="mis. Termin 1 proyek tambak X" className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Tanggal
            <input type="date" value={form.revenue_date} onChange={(e) => set({ revenue_date: e.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>
            Status
            <select value={form.status} onChange={(e) => set({ status: e.target.value as RevenueInput["status"] })} className={inputClass}>
              {(Object.keys(REVENUE_STATUS) as RevenueInput["status"][]).map((s) => (
                <option key={s} value={s}>
                  {REVENUE_STATUS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={labelClass}>
          Nilai
          <RupiahInput value={form.amount} onChange={(n) => set({ amount: n })} />
        </label>
        <label className={labelClass}>
          Alokasi (sumber target)
          <select value={form.allocation} onChange={(e) => set({ allocation: e.target.value })} className={inputClass}>
            <option value="">Belum dipilih / lainnya</option>
            {options.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-slate-500">Penjualan teknologi tidak dicatat di sini: otomatis dari Pipeline penjualan.</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {pending ? "Menyimpan..." : "Simpan"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Batal
          </button>
          {revenue && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Hapus catatan pendapatan ini?")) run(() => deleteRevenue(revenue.id));
              }}
              className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Hapus
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
