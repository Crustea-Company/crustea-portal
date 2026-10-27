"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatDate, formatNumber } from "@/lib/format";
import type { Lead } from "@/lib/sales";
import {
  MAX_COMMISSION_LINES,
  formatPct,
  isValidOn,
  previewLine,
  type CommissionLineInput,
  type Product,
  type ReferralOwner,
} from "@/lib/commission";
import { submitCommission } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${formatNumber(Math.abs(n))}`;

type Line = CommissionLineInput & { key: number };

export type CommissionInitial = { id: string; lines: CommissionLineInput[] };

export default function CommissionForm({
  fullName,
  myCode,
  products,
  referrals,
  today,
  initial,
  leads = [],
  initialLeadIds = [],
}: {
  fullName: string;
  myCode: string;
  products: Product[]; // semua versi, supaya tanggal closing lama tetap memakai harga saat itu
  referrals: ReferralOwner[];
  today: string;
  initial?: CommissionInitial; // terisi saat mengubah klaim "Perlu perbaikan" / draf
  leads?: Lead[]; // penjualan (modul Penjualan) yang boleh saya klaim
  initialLeadIds?: string[]; // ?lead= dari halaman lead
}) {
  const router = useRouter();
  const blank = (key: number): Line => ({
    key,
    customer: "",
    invoice: "",
    closing_date: today,
    product_code: "",
    units: 1,
    sales_total: 0,
    justification: "",
    referral_code: myCode,
  });
  const fromLead = (lead: Lead, key: number): Line => ({
    key,
    lead_id: lead.id,
    customer: lead.customer,
    invoice: lead.so_number ?? "",
    closing_date: lead.closed_on ?? today,
    product_code: lead.product_code ?? "",
    units: lead.units,
    sales_total: lead.value,
    justification: "",
    referral_code: lead.referral_code ?? "",
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const [lines, setLines] = useState<Line[]>(() => {
    if (initial?.lines.length) return initial.lines.map((l, i) => ({ ...l, referral_code: l.referral_code ?? "", key: i }));
    const picked = initialLeadIds.flatMap((id) => (leadById.has(id) ? [leadById.get(id) as Lead] : []));
    return picked.length ? picked.map((l, i) => fromLead(l, i)) : [blank(0)];
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Pilihan produk: satu per kode, nama dari versi terbaru.
  const choices = [...new Map([...products].sort((a, b) => a.valid_from.localeCompare(b.valid_from)).map((p) => [p.code, p])).values()];
  const refName = new Map(referrals.map((r) => [r.code, r.name]));

  const update = (key: number, patch: Partial<CommissionLineInput>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const nextKey = (list: Line[]) => Math.max(-1, ...list.map((l) => l.key)) + 1;
  const addLine = () => setLines((list) => [...list, blank(nextKey(list))]);
  // Penjualan dari modul Penjualan: baris kosong pertama diganti, selain itu ditambahkan.
  const addLead = (lead: Lead) =>
    setLines((list) => {
      const empty = list.length === 1 && !list[0].lead_id && !list[0].customer && !list[0].product_code;
      return empty ? [fromLead(lead, 0)] : [...list, fromLead(lead, nextKey(list))];
    });
  const usedLeads = new Set(lines.map((l) => l.lead_id).filter(Boolean));
  const availableLeads = leads.filter((l) => !usedLeads.has(l.id));
  const removeLine = (key: number) => setLines((list) => list.filter((l) => l.key !== key));

  const previews = lines.map((l) => previewLine(l, products));
  const total = previews.reduce((sum, p) => sum + (p?.commission ?? 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    for (const [i, l] of lines.entries()) {
      if (l.lead_id) continue; // diperiksa database dari data lead
      if (!l.product_code) return setError(`Baris ${i + 1}: pilih produk.`);
      if (!previews[i]) return setError(`Baris ${i + 1}: produk belum berlaku pada tanggal closing.`);
      if (l.sales_total <= 0) return setError(`Baris ${i + 1}: total penjualan belum diisi.`);
      const code = l.referral_code.trim().toUpperCase();
      if (code && !refName.has(code)) return setError(`Baris ${i + 1}: kode referral "${code}" tidak dikenal.`);
    }
    setPending(true);
    const res = await submitCommission(
      lines.map((l) => ({
        customer: l.customer,
        invoice: l.invoice,
        closing_date: l.closing_date,
        product_code: l.product_code,
        units: l.units,
        sales_total: l.sales_total,
        justification: l.justification,
        referral_code: l.referral_code,
        lead_id: l.lead_id ?? null,
      })),
      initial?.id ?? null,
    );
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      return;
    }
    router.push(`/pengajuan/${res.id}?terkirim=1`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Nama pengklaim: <span className="font-semibold text-slate-900">{fullName}</span>
      </div>

      {availableLeads.length > 0 && lines.length < MAX_COMMISSION_LINES && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-semibold text-brand-900">Ambil dari modul Penjualan</p>
          <p className="text-xs text-brand-900/80">
            Penjualan yang sudah closing dengan kode referral Anda (atau Anda PIC sales-nya). Isinya terisi otomatis.
          </p>
          <ul className="flex flex-col gap-1.5">
            {availableLeads.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-mono text-xs text-slate-500">{lead.number}</span>{" "}
                  <span className="font-medium text-slate-900">{lead.customer}</span>
                  <span className="block text-xs text-slate-500">
                    {rp(lead.value)} · {lead.paid_on ? "lunas" : "belum lunas"}
                  </span>
                </span>
                <button type="button" onClick={() => addLead(lead)} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
                  + Tambahkan
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lines.map((l, i) => {
        const pv = previews[i];
        const code = l.referral_code.trim().toUpperCase();
        if (l.lead_id) {
          const lead = leadById.get(l.lead_id);
          return (
            <fieldset key={l.key} className="flex flex-col gap-2 rounded-xl border border-brand-200 p-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-semibold text-slate-900">
                  Penjualan {i + 1} · <span className="font-mono">{lead?.number ?? "dari modul Penjualan"}</span>
                </legend>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(l.key)} className="text-sm font-medium text-red-700 hover:underline">
                    Hapus baris
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{l.customer}</span> · {pv?.product.name ?? l.product_code} · {formatNumber(l.units)} unit ·
                closing {formatDate(l.closing_date)} · SO {l.invoice} · {rp(l.sales_total)}
              </p>
              <p className="text-xs text-slate-500">
                Kode referral: {l.referral_code || "tanpa referral"} · {lead?.paid_on ? `lunas ${formatDate(lead.paid_on)}` : "belum lunas (klaim baru bisa diterima setelah lunas)"}
              </p>
              {pv && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  Profit {rp(pv.profit)} × {formatPct(pv.product.commission_pct)} = <span className="font-semibold">{rp(pv.commission)}</span>
                  {pv.no_profit ? " (profit ≤ 0, komisi 0)" : ""}
                </p>
              )}
            </fieldset>
          );
        }
        return (
          <fieldset key={l.key} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-semibold text-slate-900">Penjualan {i + 1}</legend>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(l.key)} className="text-sm font-medium text-red-700 hover:underline">
                  Hapus baris
                </button>
              )}
            </div>

            <label className={labelClass}>
              Nama customer
              <input type="text" required value={l.customer} onChange={(e) => update(l.key, { customer: e.target.value })} className={inputClass} />
            </label>
            <label className={labelClass}>
              No. Invoice / PO / Kontrak
              <input type="text" required value={l.invoice} onChange={(e) => update(l.key, { invoice: e.target.value })} className={inputClass} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Tanggal closing
                <input
                  type="date"
                  required
                  max={today}
                  value={l.closing_date}
                  onChange={(e) => update(l.key, { closing_date: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Jumlah unit
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={l.units || ""}
                  onChange={(e) => update(l.key, { units: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className={inputClass}
                />
              </label>
            </div>
            <label className={labelClass}>
              Produk
              <select
                required
                value={l.product_code}
                onChange={(e) => update(l.key, { product_code: e.target.value })}
                className={inputClass}
              >
                <option value="">Pilih produk</option>
                {choices.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={labelClass}>
              <label htmlFor={`sales-${l.key}`}>
                Total nominal penjualan <span className={hintClass}>(Rp, excl. VAT)</span>
              </label>
              <RupiahInput id={`sales-${l.key}`} value={l.sales_total} onChange={(n) => update(l.key, { sales_total: n })} />
            </div>
            <label className={labelClass}>
              Justifikasi <span className={hintClass}>(link bukti leads, mis. Google Drive)</span>
              <input
                type="url"
                required
                value={l.justification}
                onChange={(e) => update(l.key, { justification: e.target.value })}
                placeholder="https://"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Kode referral <span className={hintClass}>(asal lead; boleh kosong)</span>
              <input
                type="text"
                value={l.referral_code}
                onChange={(e) => update(l.key, { referral_code: e.target.value.toUpperCase() })}
                placeholder="CRU-NAMA"
                className={`${inputClass} font-mono uppercase`}
              />
              {code && (
                <span className={refName.has(code) ? "font-normal text-brand-700" : "font-normal text-red-700"}>
                  {refName.get(code) ?? "Kode tidak dikenal"}
                </span>
              )}
            </label>

            {l.product_code && !pv && (
              <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                Produk ini belum/tidak berlaku pada tanggal closing tersebut.
              </p>
            )}
            {pv && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                <dt className="text-slate-600">% komisi</dt>
                <dd className="text-right tabular-nums">{formatPct(pv.product.commission_pct)}</dd>
                <dt className="text-slate-600">HPP/unit</dt>
                <dd className="text-right tabular-nums">{rp(pv.product.hpp)}</dd>
                <dt className="text-slate-600">HPP penjualan</dt>
                <dd className="text-right tabular-nums">{rp(pv.hpp_total)}</dd>
                <dt className="text-slate-600">Profit</dt>
                <dd className={`text-right tabular-nums ${pv.no_profit ? "text-red-700" : ""}`}>{rp(pv.profit)}</dd>
                <dt className="font-semibold text-slate-900">Komisi</dt>
                <dd className="text-right font-semibold tabular-nums text-slate-900">{rp(pv.commission)}</dd>
                {pv.no_profit && (
                  <dd className="col-span-2 text-red-700">Profit ≤ 0: komisi baris ini 0.</dd>
                )}
                {pv.below_min && (
                  <dd className="col-span-2 text-orange-800">
                    Harga per unit di bawah harga minimal ({rp(Math.round(pv.product.price * (1 - pv.product.max_discount)))}).
                  </dd>
                )}
              </dl>
            )}
          </fieldset>
        );
      })}

      {lines.length < MAX_COMMISSION_LINES && (
        <button
          type="button"
          onClick={addLine}
          className="rounded-lg border border-dashed border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          + Tambah baris penjualan
        </button>
      )}

      <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-3">
        <span className="text-sm font-medium text-brand-900">Total komisi (perkiraan)</span>
        <span className="text-lg font-bold tabular-nums text-brand-900">{rp(total)}</span>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Angka final dihitung sistem dari master produk yang berlaku pada tanggal closing.
        {choices.some((p) => !isValidOn(p, today)) ? " Sebagian produk tidak berlaku hari ini." : ""}
      </p>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : initial ? "Simpan & kirim ulang" : "Kirim klaim komisi"}
      </button>
    </form>
  );
}
