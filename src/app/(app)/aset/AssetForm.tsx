"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { ASSET_CATEGORIES, type Asset, type AssetCategory } from "@/lib/sales";
import { saveAsset, type AssetInput } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

// Serah terima aset baru (BAST) atau ubah data aset.
export default function AssetForm({ today, asset, onDone }: { today: string; asset?: Asset; onDone?: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<AssetInput>({
    name: asset?.name ?? "",
    category: asset?.category ?? "ebii",
    received_on: asset?.received_on ?? today,
    location: asset?.location ?? "",
    holder: asset?.holder ?? "",
    value: asset?.value ?? 0,
    useful_life_months: asset?.useful_life_months ?? 0,
    reference: asset?.reference ?? "",
    notes: asset?.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<AssetInput>) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await saveAsset(form, asset?.id ?? null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    if (asset) {
      onDone?.();
      router.refresh();
    } else {
      router.push(`/aset/${res.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className={labelClass}>
        Nama aset
        <input type="text" required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="mis. EBII System unit #3" className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Kategori
          <select value={form.category} onChange={(e) => set({ category: e.target.value as AssetCategory })} className={inputClass}>
            {Object.entries(ASSET_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Tanggal serah terima (BAST)
          <input type="date" required max={today} value={form.received_on} onChange={(e) => set({ received_on: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Lokasi
          <input type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="mis. Gudang Bogor" className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Penanggung jawab <span className={hintClass}>(boleh kosong)</span>
          </span>
          <input type="text" value={form.holder} onChange={(e) => set({ holder: e.target.value })} className={inputClass} />
        </label>
      </div>
      {asset && asset.status !== "received" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={labelClass}>
            <label htmlFor="asset-value">Nilai perolehan</label>
            <RupiahInput id="asset-value" value={form.value} onChange={(n) => set({ value: n })} />
          </div>
          <label className={labelClass}>
            <span>
              Umur manfaat <span className={hintClass}>(bulan, untuk penyusutan)</span>
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.useful_life_months || ""}
              onChange={(e) => set({ useful_life_months: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className={inputClass}
            />
          </label>
        </div>
      )}
      <label className={labelClass}>
        <span>
          Referensi <span className={hintClass}>(No. PO / GRN / link BAST)</span>
        </span>
        <input type="text" value={form.reference} onChange={(e) => set({ reference: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Catatan
        <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Menyimpan..." : asset ? "Simpan perubahan" : "Simpan serah terima"}
        </button>
        {asset && (
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
