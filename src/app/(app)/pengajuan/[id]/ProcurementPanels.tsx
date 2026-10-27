"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatNumber } from "@/lib/format";
import { CEO_APPROVAL_MIN, MIN_VENDORS, PROCUREMENT_METHODS, type VendorQuote } from "@/lib/requests";
import { chooseProcurementVendor, submitVendorComparison } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 text-slate-700 hover:bg-slate-100";

const emptyVendor = (): VendorQuote => ({
  name: "",
  avl: false,
  price: 0,
  spec: "",
  lead_time: "",
  warranty: "",
  pros: "",
  cons: "",
});

// TechOps: bandingkan minimal 3 vendor (prioritas Approved Vendor List) lalu rekomendasikan satu.
export function VendorCompareForm({ id }: { id: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorQuote[]>(() => Array.from({ length: MIN_VENDORS }, emptyVendor));
  const [recommended, setRecommended] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const update = (i: number, patch: Partial<VendorQuote>) =>
    setVendors((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => {
    setVendors((list) => list.filter((_, j) => j !== i));
    setRecommended((r) => (r === null || r === i ? null : r > i ? r - 1 : r));
  };

  async function save() {
    setError("");
    if (recommended === null) return setError("Pilih satu vendor yang direkomendasikan.");
    setPending(true);
    const res = await submitVendorComparison(id, vendors, recommended, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <div>
        <h2 className="font-semibold text-slate-900">Perbandingan vendor (TechOps)</h2>
        <p className="text-sm text-slate-600">
          Minimal {MIN_VENDORS} vendor, utamakan yang ada di Approved Vendor List. Harga = harga total untuk seluruh
          jumlah yang diminta.
        </p>
      </div>

      {vendors.map((v, i) => (
        <fieldset key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-semibold text-slate-900">Vendor {i + 1}</legend>
            {vendors.length > MIN_VENDORS && (
              <button type="button" onClick={() => remove(i)} className="text-sm text-red-700 hover:underline">
                Hapus
              </button>
            )}
          </div>
          <label className={labelClass}>
            Nama vendor
            <input type="text" value={v.name} onChange={(e) => update(i, { name: e.target.value })} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={v.avl}
              onChange={(e) => update(i, { avl: e.target.checked })}
              className="h-4 w-4 accent-brand-700"
            />
            Ada di Approved Vendor List
          </label>
          <div className={labelClass}>
            <label htmlFor={`price-${i}`}>Harga total (Rp)</label>
            <RupiahInput id={`price-${i}`} value={v.price} onChange={(n) => update(i, { price: n })} />
          </div>
          <label className={labelClass}>
            Spesifikasi yang ditawarkan
            <textarea rows={2} value={v.spec} onChange={(e) => update(i, { spec: e.target.value })} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Lead time
              <input
                type="text"
                value={v.lead_time}
                onChange={(e) => update(i, { lead_time: e.target.value })}
                placeholder="mis. 5 hari"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Garansi
              <input
                type="text"
                value={v.warranty}
                onChange={(e) => update(i, { warranty: e.target.value })}
                placeholder="mis. 1 tahun"
                className={inputClass}
              />
            </label>
          </div>
          <label className={labelClass}>
            Kelebihan
            <input type="text" value={v.pros} onChange={(e) => update(i, { pros: e.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>
            Kekurangan
            <input type="text" value={v.cons} onChange={(e) => update(i, { cons: e.target.value })} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
            <input
              type="radio"
              name="recommended"
              checked={recommended === i}
              onChange={() => setRecommended(i)}
              className="h-4 w-4 accent-brand-700"
            />
            Rekomendasikan vendor ini
          </label>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() => setVendors((list) => [...list, emptyVendor()])}
        className={`self-start rounded-lg px-3 py-2 text-sm font-medium ${NEUTRAL}`}
      >
        + Tambah vendor
      </button>

      <label className={labelClass}>
        Catatan <span className="font-normal text-slate-500">(boleh kosong; terlihat pemohon)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
      >
        {pending ? "Menyimpan..." : "Kirim perbandingan ke Finance"}
      </button>
    </section>
  );
}

// Head F&A: pilih vendor + metode pengadaan. Harga vendor terpilih >= Rp5 juta diteruskan ke CEO.
export function ChooseVendorForm({
  id,
  vendors,
  recommended,
}: {
  id: string;
  vendors: VendorQuote[];
  recommended: number | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(recommended);
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (selected === null) return setError("Pilih vendor.");
    setPending(true);
    const res = await chooseProcurementVendor(id, selected, method, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  const price = selected === null ? 0 : (vendors[selected]?.price ?? 0);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Pilih vendor (Head F&A)</h2>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Vendor</legend>
        {vendors.map((v, i) => (
          <label key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input
              type="radio"
              name="selected"
              checked={selected === i}
              onChange={() => setSelected(i)}
              className="h-4 w-4 accent-brand-700"
            />
            <span className="flex-1">
              {v.name}
              {i === recommended && <span className="ml-1 text-xs font-semibold text-brand-700">(rekomendasi TechOps)</span>}
            </span>
            <span className="tabular-nums">Rp{formatNumber(v.price)}</span>
          </label>
        ))}
      </fieldset>
      <label className={labelClass}>
        Metode pengadaan
        <input
          type="text"
          list="procurement-methods"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Pilih atau tulis"
          className={inputClass}
        />
        <datalist id="procurement-methods">
          {PROCUREMENT_METHODS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      {price >= CEO_APPROVAL_MIN && (
        <p className="text-sm text-slate-600">Nilai ≥ Rp5 juta: setelah disetujui, diteruskan ke CEO untuk approval final.</p>
      )}
      <label className={labelClass}>
        Catatan <span className="font-normal text-slate-500">(boleh kosong; terlihat pemohon)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
      >
        {pending ? "Menyimpan..." : "Setujui vendor & metode"}
      </button>
    </section>
  );
}
