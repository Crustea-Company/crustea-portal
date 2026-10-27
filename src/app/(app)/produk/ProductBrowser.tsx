"use client";

import { useEffect, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import { PRODUCT_TYPE_LABEL, formatPct, productMetrics, type Product, type ProductMetrics } from "@/lib/commission";
import ProductEditor from "./ProductEditor";

const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${formatNumber(Math.abs(n))}`;

type View = "grid" | "table";
type Item = { p: Product; m: ProductMetrics };

const SORTS: { key: string; label: string; value: (i: Item) => number | string }[] = [
  { key: "name", label: "Nama (A-Z)", value: (i) => i.p.name.toLowerCase() },
  { key: "price", label: "Harga jual tertinggi", value: (i) => -i.p.price },
  { key: "price_asc", label: "Harga jual terendah", value: (i) => i.p.price },
  { key: "commission", label: "Komisi/unit tertinggi", value: (i) => -i.m.commission },
  { key: "pct", label: "% komisi tertinggi", value: (i) => -i.p.commission_pct },
  { key: "margin", label: "Gross margin tertinggi", value: (i) => -i.m.margin },
  { key: "profit", label: "Profit/unit tertinggi", value: (i) => -i.m.profit },
  { key: "type", label: "Tipe (Satuan dulu)", value: (i) => `${i.p.type === "unit" ? 0 : 1}${i.p.name.toLowerCase()}` },
];

const VIEW_KEY = "produk-view";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-semibold text-slate-900" : ""}`}>{value}</dd>
    </div>
  );
}

function period(p: Product) {
  return `${formatDate(p.valid_from)}${p.valid_to ? ` – ${formatDate(p.valid_to)}` : " – seterusnya"}`;
}

function ProductCard({ p, m, canEdit, today, current }: Item & { canEdit: boolean; today: string; current: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm ${current ? "border-slate-200" : "border-dashed border-slate-300 opacity-80"}`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{p.name}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{PRODUCT_TYPE_LABEL[p.type]}</span>
        </div>
        <p className="text-xs text-slate-500">Berlaku {period(p)}</p>
        {p.bundle_items && <p className="mt-1 text-sm text-slate-600">Isi: {p.bundle_items}</p>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Row label="Harga jual (excl. VAT)" value={rp(p.price)} strong />
        <Row label="HPP/unit" value={rp(p.hpp)} />
        <Row label="Profit/unit" value={rp(m.profit)} />
        <Row label="Gross margin" value={formatPct(m.margin)} />
        <Row label="% komisi" value={formatPct(p.commission_pct)} />
        <Row label="Komisi standar/unit" value={rp(m.commission)} strong />
        <Row label="Diskon maks" value={formatPct(p.max_discount)} />
        <Row label="Harga minimal" value={rp(m.min_price)} />
        <Row label="Profit di harga minimal" value={rp(m.min_profit)} />
        <Row label="Komisi/unit di harga minimal" value={rp(m.min_commission)} />
        {p.promo_price !== null && <Row label="Harga promo brosur (info)" value={rp(p.promo_price)} />}
      </dl>
      {p.notes && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">{p.notes}</p>}
      {canEdit && <ProductEditor product={p} today={today} />}
    </div>
  );
}

const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-600";
const TD = "whitespace-nowrap px-3 py-2 text-right tabular-nums";

function ProductTable({ items, current }: { items: Item[]; current: boolean }) {
  return (
    <div className={`overflow-x-auto rounded-2xl border bg-white shadow-sm ${current ? "border-slate-200" : "border-dashed border-slate-300"}`}>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={`${TH} sticky left-0 bg-slate-50`}>Produk</th>
            <th className={TH}>Tipe</th>
            <th className={`${TH} text-right`}>Harga jual</th>
            <th className={`${TH} text-right`}>HPP/unit</th>
            <th className={`${TH} text-right`}>Profit/unit</th>
            <th className={`${TH} text-right`}>GM</th>
            <th className={`${TH} text-right`}>% komisi</th>
            <th className={`${TH} text-right`}>Komisi/unit</th>
            <th className={`${TH} text-right`}>Diskon maks</th>
            <th className={`${TH} text-right`}>Harga minimal</th>
            <th className={`${TH} text-right`}>Komisi di harga min.</th>
            <th className={`${TH} text-right`}>Promo brosur</th>
            <th className={TH}>Berlaku</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(({ p, m }) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="sticky left-0 max-w-[14rem] bg-white px-3 py-2 font-medium text-slate-900">
                {p.name}
                {p.notes && <span className="block text-xs font-normal text-orange-800">{p.notes}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{PRODUCT_TYPE_LABEL[p.type]}</td>
              <td className={`${TD} font-semibold text-slate-900`}>{rp(p.price)}</td>
              <td className={TD}>{rp(p.hpp)}</td>
              <td className={TD}>{rp(m.profit)}</td>
              <td className={TD}>{formatPct(m.margin)}</td>
              <td className={TD}>{formatPct(p.commission_pct)}</td>
              <td className={`${TD} font-semibold text-slate-900`}>{rp(m.commission)}</td>
              <td className={TD}>{formatPct(p.max_discount)}</td>
              <td className={TD}>{rp(m.min_price)}</td>
              <td className={TD}>{rp(m.min_commission)}</td>
              <td className={TD}>{p.promo_price !== null ? rp(p.promo_price) : "-"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{period(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Daftar produk: pilihan tampilan Grid / Tabel dan urutan. Tampilan terakhir diingat di browser ini.
export default function ProductBrowser({
  current,
  others,
  canEdit,
  today,
}: {
  current: Product[];
  others: Product[];
  canEdit: boolean;
  today: string;
}) {
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState(SORTS[0].key);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "table") setView(v);
    } catch {
      // penyimpanan browser tidak tersedia
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // abaikan
    }
  };

  const by = SORTS.find((s) => s.key === sort) ?? SORTS[0];
  const arrange = (list: Product[]): Item[] =>
    list
      .map((p) => ({ p, m: productMetrics(p) }))
      .sort((a, b) => {
        const x = by.value(a);
        const y = by.value(b);
        return x < y ? -1 : x > y ? 1 : a.p.name.localeCompare(b.p.name);
      });

  const section = (items: Item[], isCurrent: boolean) =>
    view === "table" ? (
      <ProductTable items={items} current={isCurrent} />
    ) : (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((i) => (
          <ProductCard key={i.p.id} {...i} canEdit={canEdit} today={today} current={isCurrent} />
        ))}
      </div>
    );

  const btn = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => chooseView(v)}
      aria-pressed={view === v}
      className={`px-3 py-2 text-sm font-medium ${view === v ? "bg-brand-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
          {btn("grid", "Grid")}
          {btn("table", "Tabel")}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Urutkan
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === "table" && canEdit && (
        <p className="-mt-2 text-xs text-slate-500">Untuk mengubah produk, pindah ke tampilan Grid.</p>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Berlaku hari ini ({current.length})</h2>
      {current.length === 0 ? <p className="text-sm text-slate-600">Belum ada produk yang berlaku.</p> : section(arrange(current), true)}

      {others.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">
            Versi lain / belum atau sudah tidak berlaku ({others.length})
          </summary>
          <div className="mt-3">{section(arrange(others), false)}</div>
        </details>
      )}
    </div>
  );
}
