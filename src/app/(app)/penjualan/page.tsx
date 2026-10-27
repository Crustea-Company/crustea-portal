import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  LEAD_COLUMNS,
  LEAD_SOURCES,
  STAGE_LABEL,
  STAGE_STYLE,
  WON_RANK,
  daysSince,
  stageRank,
  toLead,
  type Lead,
} from "@/lib/sales";

export const metadata: Metadata = { title: "Penjualan - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rp = (n: number) => `Rp${formatNumber(n)}`;

const TABS = {
  aktif: "Prospek aktif",
  closing: "Closing & purna jual",
  gagal: "Gagal",
  semua: "Semua",
} as const;
type Tab = keyof typeof TABS;

function inTab(l: Lead, tab: Tab): boolean {
  if (tab === "semua") return true;
  if (tab === "gagal") return l.stage === "lost";
  if (l.stage === "lost") return false;
  return tab === "closing" ? stageRank(l.stage) >= WON_RANK : stageRank(l.stage) < WON_RANK;
}

const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export default async function PenjualanPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "aktif";
  const mine = sp.saya === "1";
  const today = todayJakarta();
  const month = typeof sp.bulan === "string" && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : today.slice(0, 7);
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const { data: rows } = await fetchAll(() =>
    supabase.from("sales_leads").select(LEAD_COLUMNS).order("created_at", { ascending: false }),
  );
  const all = (rows as unknown as Record<string, unknown>[]).map(toLead);
  const scoped = mine ? all.filter((l) => l.sales_id === me.id || l.referral_id === me.id) : all;
  const list = scoped.filter(
    (l) =>
      inTab(l, tab) &&
      (!q || `${l.number} ${l.customer} ${l.location ?? ""} ${l.referral_code ?? ""}`.toLowerCase().includes(q)),
  );

  // Laporan sales bulan terpilih.
  const inMonth = (d: string | null) => !!d && d.startsWith(month);
  const newLeads = scoped.filter((l) => inMonth(l.lead_date));
  const deals = scoped.filter((l) => inMonth(l.closed_on));
  const paid = scoped.filter((l) => inMonth(l.paid_on));
  const lost = scoped.filter((l) => l.stage === "lost" && inMonth(l.stage_since.slice(0, 10)));
  const perSales = new Map<string, { name: string; leads: number; deals: number; value: number; paid: number }>();
  for (const l of scoped) {
    const row = perSales.get(l.sales_id) ?? { name: l.sales?.full_name ?? "-", leads: 0, deals: 0, value: 0, paid: 0 };
    if (inMonth(l.lead_date)) row.leads++;
    if (inMonth(l.closed_on)) {
      row.deals++;
      row.value += l.value;
    }
    if (inMonth(l.paid_on)) row.paid += l.value;
    perSales.set(l.sales_id, row);
  }
  const salesRows = [...perSales.values()].filter((r) => r.leads || r.deals || r.paid).sort((a, b) => b.value - a.value);
  const months = [...new Set([today.slice(0, 7), ...all.map((l) => l.lead_date.slice(0, 7)), ...all.flatMap((l) => (l.closed_on ? [l.closed_on.slice(0, 7)] : []))])]
    .sort()
    .reverse();

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { tab, saya: mine ? "1" : null, bulan: month === today.slice(0, 7) ? null : month, q: q || null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/penjualan?${s}` : "/penjualan";
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan</p>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline penjualan</h1>
          <p className="mt-1 text-sm text-slate-600">Aerator, EBII, Smart Energy, panel surya: dari lead sampai purna jual.</p>
        </div>
        <Link href="/penjualan/baru" className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          + Catat lead
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Laporan {monthLabel(month)}</h2>
          <div className="flex flex-wrap gap-1">
            {months.slice(0, 6).map((m) => (
              <Link
                key={m}
                href={href({ bulan: m === today.slice(0, 7) ? null : m })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${m === month ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {monthLabel(m)}
              </Link>
            ))}
          </div>
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
        <p className="text-xs text-slate-500">Target vs aktual per kuartal ada di modul Monitoring KPI & target.</p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={href({ tab: t })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t === tab ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {TABS[t]} ({scoped.filter((l) => inTab(l, t)).length})
          </Link>
        ))}
        <Link
          href={href({ saya: mine ? null : "1" })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${mine ? "bg-logo-leaf text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
        >
          {mine ? "✓ " : ""}Lead saya
        </Link>
        <form action="/penjualan" className="ml-auto flex gap-1">
          <input type="hidden" name="tab" value={tab} />
          {mine && <input type="hidden" name="saya" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cari customer / no. lead"
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
          />
        </form>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Belum ada lead di sini.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((l) => (
            <li key={l.id}>
              <Link
                href={`/penjualan/${l.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">{l.number}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STAGE_STYLE[l.stage]}`}>{STAGE_LABEL[l.stage]}</span>
                    {l.stage !== "lost" && stageRank(l.stage) >= WON_RANK && !l.paid_on && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-800">Belum lunas</span>
                    )}
                    <span>{LEAD_SOURCES[l.source]}</span>
                    {l.referral_code && <span className="font-mono">{l.referral_code}</span>}
                  </div>
                  <p className="truncate font-semibold text-slate-900">{l.customer}</p>
                  <p className="text-xs text-slate-500">
                    {l.location ? `${l.location} · ` : ""}PIC {l.sales?.full_name ?? "-"} · masuk {formatDate(l.lead_date)} ·{" "}
                    {daysSince(l.stage_since)} hari di tahap ini
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold tabular-nums text-slate-900">{rp(l.value)}</p>
                  <p className="text-xs text-slate-500">{formatNumber(l.units)} unit</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
