import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatNumber, todayJakarta } from "@/lib/format";
import { LEAD_COLUMNS, isSalesManager, toLead } from "@/lib/sales";
import CollapsibleSection from "@/components/CollapsibleSection";
import LeadBoard, { LEAD_GROUPS, type LeadGroup } from "./LeadBoard";

export const metadata: Metadata = { title: "Penjualan - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rp = (n: number) => `Rp${formatNumber(n)}`;

const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ym}-01T00:00:00Z`));

export default async function PenjualanPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const group: LeadGroup = str("tab") in LEAD_GROUPS ? (str("tab") as LeadGroup) : "aktif";
  const today = todayJakarta();
  const month = /^\d{4}-\d{2}$/.test(str("bulan")) ? str("bulan") : today.slice(0, 7);

  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [{ data: rows }, { data: productRows }] = await Promise.all([
    fetchAll(() => supabase.from("sales_leads").select(LEAD_COLUMNS).order("created_at", { ascending: false })),
    supabase.from("products").select("code, name, valid_from").order("valid_from"),
  ]);
  const all = (rows as unknown as Record<string, unknown>[]).map(toLead);
  // Nama produk per kode (versi terbaru).
  const productNames = Object.fromEntries(((productRows ?? []) as { code: string; name: string }[]).map((p) => [p.code, p.name]));

  // Laporan sales bulan terpilih.
  const inMonth = (d: string | null) => !!d && d.startsWith(month);
  const newLeads = all.filter((l) => inMonth(l.lead_date));
  const deals = all.filter((l) => inMonth(l.closed_on));
  const paid = all.filter((l) => inMonth(l.paid_on));
  const lost = all.filter((l) => l.stage === "lost" && inMonth(l.stage_since.slice(0, 10)));
  const perSales = new Map<string, { name: string; leads: number; deals: number; value: number; paid: number }>();
  for (const l of all) {
    const row = perSales.get(l.sales_id) ?? {
      name: l.sales?.full_name ?? "-",
      leads: 0,
      deals: 0,
      value: 0,
      paid: 0,
    };
    if (inMonth(l.lead_date)) row.leads++;
    if (inMonth(l.closed_on)) {
      row.deals++;
      row.value += l.value;
    }
    if (inMonth(l.paid_on)) row.paid += l.value;
    perSales.set(l.sales_id, row);
  }
  const salesRows = [...perSales.values()].filter((r) => r.leads || r.deals || r.paid).sort((a, b) => b.value - a.value);
  const months = [
    ...new Set([
      today.slice(0, 7),
      ...all.map((l) => l.lead_date.slice(0, 7)),
      ...all.flatMap((l) => (l.closed_on ? [l.closed_on.slice(0, 7)] : [])),
    ]),
  ]
    .sort()
    .reverse();

  // Ganti bulan laporan; pilihan daftar (tab, filter, urutan) ikut dibawa.
  const href = (bulan: string | null) => {
    const p = new URLSearchParams();
    for (const k of ["tab", "saya", "q", "tahap", "tek", "pic", "urut"]) if (str(k)) p.set(k, str(k));
    if (bulan) p.set("bulan", bulan);
    p.set("laporan", "1");
    return `/penjualan?${p}`;
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan</p>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline penjualan</h1>
          <p className="mt-1 text-sm text-slate-600">Aerator, EBII, Smart Energy, panel surya: dari lead sampai purna jual.</p>
        </div>
        <Link
          href="/penjualan/baru"
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          + Catat lead
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 pt-3 shadow-sm [&>details:not([open])]:pb-0 [&>details[open]]:pb-4">
        <CollapsibleSection
          title={`Laporan ${monthLabel(month)}`}
          summary={`${formatNumber(newLeads.length)} lead baru · ${formatNumber(deals.length)} deal · ${rp(deals.reduce((s, l) => s + l.value, 0))}`}
          defaultOpen={str("laporan") === "1"}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {months.slice(0, 6).map((m) => (
                <Link
                  key={m}
                  href={href(m === today.slice(0, 7) ? null : m)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${m === month ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {monthLabel(m)}
                </Link>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Lead baru" value={formatNumber(newLeads.length)} />
              <Stat label="Deal (closing)" value={formatNumber(deals.length)} sub={rp(deals.reduce((s, l) => s + l.value, 0))} />
              <Stat label="Lunas" value={formatNumber(paid.length)} sub={rp(paid.reduce((s, l) => s + l.value, 0))} />
              <Stat label="Gagal" value={formatNumber(lost.length)} />
            </div>
            {salesRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-1.5 pr-2 font-medium">PIC sales</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Lead baru</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Deal</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Nilai deal</th>
                      <th className="py-1.5 text-right font-medium">Lunas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesRows.map((r) => (
                      <tr key={r.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-2">{r.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(r.deals)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{rp(r.value)}</td>
                        <td className="py-1.5 text-right tabular-nums">{rp(r.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Target vs aktual per kuartal:{" "}
              <Link href="/kpi/target" className="font-medium text-brand-700 hover:underline">
                Monitoring KPI → Target kuartal
              </Link>
              .
            </p>
          </div>
        </CollapsibleSection>
      </section>

      <LeadBoard
        leads={all}
        productNames={productNames}
        meId={me.id}
        manager={isSalesManager(me)}
        initial={{
          group,
          mine: str("saya") === "1",
          q: str("q"),
          stage: str("tahap"),
          tech: str("tek"),
          pic: str("pic"),
          sort: str("urut"),
        }}
      />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs tabular-nums text-slate-600">{sub}</p>}
    </div>
  );
}
