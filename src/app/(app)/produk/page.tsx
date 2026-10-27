import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import { canReviewRequests } from "@/lib/requests";
import {
  PRODUCT_COLUMNS,
  PRODUCT_TYPE_LABEL,
  formatPct,
  isValidOn,
  productMetrics,
  toProduct,
  type Product,
} from "@/lib/commission";
import ProductEditor from "./ProductEditor";

export const metadata: Metadata = { title: "Produk & Komisi - Crustea Portal" };

const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${formatNumber(Math.abs(n))}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-semibold text-slate-900" : ""}`}>{value}</dd>
    </div>
  );
}

function ProductCard({ p, canEdit, today, current }: { p: Product; canEdit: boolean; today: string; current: boolean }) {
  const m = productMetrics(p);
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm ${current ? "border-slate-200" : "border-dashed border-slate-300 opacity-80"}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{p.name}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{PRODUCT_TYPE_LABEL[p.type]}</span>
        </div>
        <p className="text-xs text-slate-500">
          Berlaku {formatDate(p.valid_from)}
          {p.valid_to ? ` – ${formatDate(p.valid_to)}` : " – seterusnya"}
        </p>
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

export default async function ProdukPage() {
  const me = (await getCurrentEmployee())!;
  const canEdit = canReviewRequests(me);
  const today = todayJakarta();
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(PRODUCT_COLUMNS).order("name").order("valid_from", { ascending: false });
  const products = (data ?? []).map((r) => toProduct(r as Record<string, unknown>));
  const current = products.filter((p) => isValidOn(p, today));
  const others = products.filter((p) => !isValidOn(p, today));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Master data</p>
          <h1 className="text-2xl font-bold text-slate-900">Produk & komisi</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Komisi = (total penjualan − HPP) × % komisi. Profit ≤ 0 berarti komisi 0. Jual di bawah harga minimal mengurangi
            komisi. {canEdit ? "Anda (admin/F&A) bisa mengubah data ini." : "Data diubah oleh admin/F&A."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/profil" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Kode referral saya
          </Link>
          <Link href="/pengajuan/komisi/baru" className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            + Klaim komisi
          </Link>
        </div>
      </div>

      {canEdit && <ProductEditor product={null} today={today} />}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Berlaku hari ini ({current.length})</h2>
      {current.length === 0 && <p className="text-sm text-slate-600">Belum ada produk yang berlaku.</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {current.map((p) => (
          <ProductCard key={p.id} p={p} canEdit={canEdit} today={today} current />
        ))}
      </div>

      {others.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">
            Versi lain / belum atau sudah tidak berlaku ({others.length})
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {others.map((p) => (
              <ProductCard key={p.id} p={p} canEdit={canEdit} today={today} current={false} />
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
