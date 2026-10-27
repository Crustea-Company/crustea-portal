"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import type { ReferralOwner } from "@/lib/commission";
import { LEAD_SOURCES, type LeadInput, type LeadSource } from "@/lib/sales";
import { saveLead } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

export type LeadFormProps = {
  meId: string;
  today: string;
  products: { code: string; name: string }[];
  referrals: ReferralOwner[];
  people: { id: string; full_name: string }[]; // pilihan PIC sales
  initial?: { id: string; input: LeadInput; locked: boolean }; // locked = sudah closing
};

export default function LeadForm({ meId, today, products, referrals, people, initial }: LeadFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<LeadInput>(
    initial?.input ?? {
      lead_date: today,
      source: "dm",
      referral_code: "",
      customer: "",
      contact: "",
      location: "",
      product_code: "",
      units: 1,
      value: 0,
      sales_id: meId,
      notes: "",
    },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = initial?.locked ?? false;
  const refName = new Map(referrals.map((r) => [r.code, r.name]));
  const code = form.referral_code.trim().toUpperCase();
  const set = (patch: Partial<LeadInput>) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (code && !refName.has(code)) return setError(`Kode referral "${code}" tidak dikenal.`);
    setPending(true);
    const res = await saveLead(form, initial?.id ?? null);
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      return;
    }
    router.push(`/penjualan/${res.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Tanggal lead masuk
          <input
            type="date"
            required
            max={today}
            value={form.lead_date}
            onChange={(e) => set({ lead_date: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Sumber lead
          <select value={form.source} onChange={(e) => set({ source: e.target.value as LeadSource })} className={inputClass}>
            {Object.entries(LEAD_SOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={labelClass}>
        <span>
          Kode referral{" "}
          <span className={hintClass}>{form.source === "referral" ? "(wajib untuk lead referral)" : "(boleh kosong)"}</span>
        </span>
        <input
          type="text"
          disabled={locked}
          value={form.referral_code}
          onChange={(e) => set({ referral_code: e.target.value.toUpperCase() })}
          placeholder="CRU-NAMA"
          list="referral-codes"
          className={`${inputClass} font-mono uppercase`}
        />
        <datalist id="referral-codes">
          {referrals.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </datalist>
        {code && (
          <span className={refName.has(code) ? "font-normal text-brand-700" : "font-normal text-red-700"}>
            {refName.get(code) ?? "Kode tidak dikenal"}
            {refName.has(code) ? " · berhak mengklaim komisi penjualan ini" : ""}
          </span>
        )}
      </label>

      <label className={labelClass}>
        Nama customer
        <input type="text" required value={form.customer} onChange={(e) => set({ customer: e.target.value })} className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span>
            Kontak <span className={hintClass}>(no. HP / WA)</span>
          </span>
          <input type="text" value={form.contact} onChange={(e) => set({ contact: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Lokasi <span className={hintClass}>(tambak / kota)</span>
          </span>
          <input type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} className={inputClass} />
        </label>
      </div>

      <label className={labelClass}>
        Produk yang diminati
        <select
          disabled={locked}
          value={form.product_code}
          onChange={(e) => set({ product_code: e.target.value })}
          className={inputClass}
        >
          <option value="">Belum tahu</option>
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Jumlah unit
          <input
            type="number"
            required
            min={1}
            step={1}
            inputMode="numeric"
            disabled={locked}
            value={form.units || ""}
            onChange={(e) => set({ units: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            className={inputClass}
          />
        </label>
        <div className={labelClass}>
          <label htmlFor="lead-value">
            Nilai penjualan <span className={hintClass}>(Rp, excl. VAT; perkiraan dulu)</span>
          </label>
          {locked ? (
            <input disabled value={`Rp${form.value.toLocaleString("id-ID")}`} className={inputClass} />
          ) : (
            <RupiahInput id="lead-value" value={form.value} onChange={(n) => set({ value: n })} />
          )}
        </div>
      </div>
      {locked && (
        <p className="-mt-2 text-xs text-slate-500">
          Produk, unit, nilai, dan kode referral terkunci setelah closing (dasar komisi dan realisasi penjualan).
        </p>
      )}

      <label className={labelClass}>
        PIC sales
        <select value={form.sales_id} onChange={(e) => set({ sales_id: e.target.value })} className={inputClass}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        <span>
          Catatan <span className={hintClass}>(kebutuhan, kondisi tambak, dll.)</span>
        </span>
        <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan..." : initial ? "Simpan perubahan" : "Simpan lead"}
      </button>
    </form>
  );
}
