"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { PRODUCT_TYPE_LABEL, type Product, type ProductType } from "@/lib/commission";
import { newProductVersion, saveProduct, type ProductInput } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";

type Mode = "edit" | "version" | "new";

const toInput = (p: Product | null, today: string): ProductInput => ({
  name: p?.name ?? "",
  type: p?.type ?? "unit",
  price: p?.price ?? 0,
  hpp: p?.hpp ?? 0,
  commission_pct: p ? Math.round(p.commission_pct * 10000) / 100 : 0,
  max_discount: p ? Math.round(p.max_discount * 10000) / 100 : 0,
  bundle_items: p?.bundle_items ?? "",
  promo_price: p?.promo_price ?? 0,
  notes: p?.notes ?? "",
  valid_from: p ? p.valid_from : today,
  valid_to: p?.valid_to ?? "",
});

// Tombol + form ubah produk / versi harga baru / tambah produk (hanya admin & F&A).
export default function ProductEditor({ product, today }: { product: Product | null; today: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState<ProductInput>(toInput(product, today));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<ProductInput>) => setForm((f) => ({ ...f, ...patch }));
  const open = (m: Mode) => {
    setError("");
    setForm({ ...toInput(product, today), ...(m === "version" ? { valid_from: today, valid_to: "" } : {}) });
    setMode(m);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res =
      mode === "version" && product ? await newProductVersion(product.id, form) : await saveProduct(form, mode === "edit" ? (product?.id ?? null) : null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setMode(null);
    router.refresh();
  }

  if (!mode) {
    return product ? (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open("edit")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Ubah
        </button>
        {!product.valid_to && (
          <button type="button" onClick={() => open("version")} className="rounded-lg border border-brand-600 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            Versi harga baru
          </button>
        )}
      </div>
    ) : (
      <button type="button" onClick={() => open("new")} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
        + Tambah produk
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">
        {mode === "new" ? "Produk baru" : mode === "version" ? "Versi harga baru" : "Ubah produk"}
      </p>
      {mode === "version" && (
        <p className="text-sm text-slate-600">
          Versi lama otomatis berakhir sehari sebelum tanggal mulai versi baru. Klaim dengan tanggal closing sebelumnya tetap memakai harga lama.
        </p>
      )}
      {mode === "edit" && (
        <p className="text-sm text-slate-600">Untuk perubahan harga, sebaiknya pakai &quot;Versi harga baru&quot; supaya riwayat harga tersimpan.</p>
      )}
      <label className={labelClass}>
        Nama produk
        <input type="text" required value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Tipe
        <select value={form.type} onChange={(e) => set({ type: e.target.value as ProductType })} className={inputClass}>
          {(Object.entries(PRODUCT_TYPE_LABEL) as [ProductType, string][]).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={labelClass}>
          <span>Harga jual acuan (excl. VAT)</span>
          <RupiahInput value={form.price} onChange={(n) => set({ price: n })} />
        </div>
        <div className={labelClass}>
          <span>HPP per unit</span>
          <RupiahInput value={form.hpp} onChange={(n) => set({ hpp: n })} />
        </div>
        <label className={labelClass}>
          % komisi
          <PctInput value={form.commission_pct} onChange={(n) => set({ commission_pct: n })} />
        </label>
        <label className={labelClass}>
          Diskon maksimal (%)
          <PctInput value={form.max_discount} onChange={(n) => set({ max_discount: n })} />
        </label>
        <div className={labelClass}>
          <span>Harga promo brosur <span className="font-normal text-slate-500">(boleh 0)</span></span>
          <RupiahInput value={form.promo_price} onChange={(n) => set({ promo_price: n })} />
        </div>
        <label className={labelClass}>
          Komposisi bundle
          <input type="text" value={form.bundle_items} onChange={(e) => set({ bundle_items: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Berlaku mulai
          <input type="date" required value={form.valid_from} onChange={(e) => set({ valid_from: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Berlaku sampai <span className="font-normal text-slate-500">(kosong = seterusnya)</span>
          <input type="date" value={form.valid_to} onChange={(e) => set({ valid_to: e.target.value })} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        Catatan
        <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Menyimpan..." : "Simpan"}
        </button>
        <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Batal
        </button>
      </div>
    </form>
  );
}

// Isian persen dengan koma desimal (mis. 2,5). Teks disimpan sendiri supaya koma bisa diketik.
function PctInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value).replace(".", ","));
  return (
    <input
      type="text"
      inputMode="decimal"
      required
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9,.]/g, "");
        setText(t);
        onChange(t === "" ? 0 : Number(t.replace(",", ".")) || 0);
      }}
      className={inputClass}
    />
  );
}
