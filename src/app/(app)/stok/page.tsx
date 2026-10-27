import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import { STOCK_MOVE_LABEL, canManageStock, type StockItem, type StockMoveKind } from "@/lib/sales";
import { loadLeadFormProps } from "@/lib/sales-data";
import { StockItemForm, StockMoveForm } from "./StockForms";

export const metadata: Metadata = { title: "Stok - Crustea Portal" };

type Move = {
  id: number;
  item_id: string;
  kind: StockMoveKind;
  qty: number;
  moved_on: string;
  reference: string | null;
  lead_id: string | null;
  note: string | null;
  actor: { full_name: string } | null;
};

export default async function StokPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const canEdit = canManageStock(me);
  const [itemRes, overviewRes, moveRes, { products }] = await Promise.all([
    supabase.from("stock_items").select("id, code, name, product_code, unit, min_qty, notes, is_active").order("code"),
    supabase.rpc("stock_overview"),
    supabase
      .from("stock_moves")
      .select("id, item_id, kind, qty, moved_on, reference, lead_id, note, actor:employees!stock_moves_actor_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(50),
    loadLeadFormProps(supabase),
  ]);
  const items = (itemRes.data ?? []) as StockItem[];
  const overview = new Map(
    ((overviewRes.data ?? []) as { item_id: string; on_hand: number; demand: number }[]).map((o) => [
      o.item_id,
      { onHand: Number(o.on_hand), demand: Number(o.demand) },
    ]),
  );
  const moves = (moveRes.data ?? []) as unknown as Move[];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const productName = new Map(products.map((p) => [p.code, p.name]));
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan</p>
          <h1 className="text-2xl font-bold text-slate-900">Stok: supply & demand</h1>
          <p className="mt-1 text-sm text-slate-600">
            Stok tersedia dibandingkan kebutuhan pipeline (lead di tahap quotation sampai lunas yang belum work order).
            Work order instalasi mengurangi stok otomatis.
          </p>
        </div>
        {canEdit && <StockItemForm products={products} />}
      </div>

      {active.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Belum ada barang stok.{canEdit ? " Tambahkan lewat tombol + Barang stok." : ""}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {active.map((i) => {
            const o = overview.get(i.id) ?? { onHand: 0, demand: 0 };
            const gap = o.onHand - o.demand;
            const low = o.onHand <= i.min_qty;
            return (
              <li key={i.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-500">{i.code}</p>
                    <p className="font-semibold text-slate-900">{i.name}</p>
                    <p className="text-xs text-slate-500">
                      {i.product_code ? `Produk: ${productName.get(i.product_code) ?? i.product_code}` : "Komponen (tanpa produk)"}
                      {i.min_qty ? ` · minimal ${formatNumber(i.min_qty)} ${i.unit}` : ""}
                    </p>
                  </div>
                  {canEdit && <StockItemForm item={i} products={products} />}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className={`rounded-xl p-2 ${o.onHand < 0 ? "bg-red-50" : low ? "bg-orange-50" : "bg-slate-50"}`}>
                    <dt className="text-xs text-slate-500">Tersedia</dt>
                    <dd className={`text-lg font-bold tabular-nums ${o.onHand < 0 ? "text-red-700" : "text-slate-900"}`}>{formatNumber(o.onHand)}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <dt className="text-xs text-slate-500">Kebutuhan</dt>
                    <dd className="text-lg font-bold tabular-nums text-slate-900">{formatNumber(o.demand)}</dd>
                  </div>
                  <div className={`rounded-xl p-2 ${gap < 0 ? "bg-red-50" : "bg-brand-50"}`}>
                    <dt className="text-xs text-slate-500">Selisih</dt>
                    <dd className={`text-lg font-bold tabular-nums ${gap < 0 ? "text-red-700" : "text-brand-800"}`}>
                      {gap > 0 ? "+" : ""}
                      {formatNumber(gap)}
                    </dd>
                  </div>
                </dl>
                {gap < 0 && <p className="text-xs font-medium text-red-700">Kurang {formatNumber(-gap)} {i.unit}: pertimbangkan pengadaan.</p>}
                {gap >= 0 && low && <p className="text-xs font-medium text-orange-800">Stok di bawah/sama dengan batas minimal.</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && active.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Catat mutasi stok</h2>
          <p className="text-sm text-slate-600">
            Masuk: dari penerimaan barang pengadaan (GRN). Keluar: selain work order (work order tercatat otomatis).
            Penyesuaian: hasil stock opname bulanan.
          </p>
          <StockMoveForm items={active} today={todayJakarta()} />
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Mutasi terakhir</h2>
        {moves.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada mutasi.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {moves.map((m) => {
              const item = itemById.get(m.item_id);
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-slate-900">
                      <span className="font-medium">{item ? `${item.code} · ${item.name}` : "-"}</span> · {STOCK_MOVE_LABEL[m.kind]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(m.moved_on)} · {m.actor?.full_name ?? "-"}
                      {m.reference ? " · " : ""}
                      {m.reference && m.lead_id ? (
                        <Link href={`/penjualan/${m.lead_id}`} className="text-brand-700 hover:underline">
                          {m.reference}
                        </Link>
                      ) : (
                        m.reference
                      )}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold tabular-nums ${m.qty < 0 ? "text-red-700" : "text-brand-800"}`}>
                    {m.qty > 0 ? "+" : ""}
                    {formatNumber(m.qty)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="flex flex-col gap-2 text-sm text-slate-500">
          <p className="text-xs font-medium">Barang tidak dipakai lagi</p>
          {inactive.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{i.code}</span> {i.name}
              {canEdit && <StockItemForm item={i} products={products} />}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
