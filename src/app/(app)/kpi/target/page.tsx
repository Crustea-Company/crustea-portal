import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  OTHER_KEY,
  REVENUE_COLUMNS,
  REVENUE_STATUS,
  pct,
  quarterLabel,
  quarterMonths,
  realization,
  sourceProjection,
  sourceTarget,
  type QuarterTarget,
  type Revenue,
  type TargetSource,
} from "@/lib/kpi";
import RevenueEditor from "./RevenueEditor";
import TargetEditor from "./TargetEditor";
import NewQuarter from "./NewQuarter";

export const metadata: Metadata = { title: "Target kuartal - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${formatNumber(Math.abs(n))}`;
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export default async function TargetPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = (await getCurrentEmployee())!;
  const canManage = me.app_role === "admin" || me.app_role === "ceo";
  const canRecord = canManage || me.dept_code === "FA";
  const supabase = await createClient();

  const { data: targetRows } = await supabase
    .from("quarter_targets")
    .select("id, year, quarter, total, notes")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false });
  const targets = (targetRows ?? []) as QuarterTarget[];
  const today = todayJakarta();
  const nowQ = { year: Number(today.slice(0, 4)), quarter: Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1 };
  const picked =
    targets.find((t) => String(t.id) === sp.q) ??
    targets.find((t) => t.year === nowQ.year && t.quarter === nowQ.quarter) ??
    targets[0];

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Monitoring KPI</p>
        <h1 className="text-2xl font-bold text-slate-900">Target kuartal per divisi</h1>
        <p className="mt-1 text-sm text-slate-600">Realisasi = pendapatan berstatus lunas (PAID), dihitung pada bulan lunasnya.</p>
      </div>
      <Link href="/kpi" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
        ← KPI departemen
      </Link>
    </div>
  );

  if (!picked) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        {header}
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Belum ada target kuartal.</p>
        {canManage && <NewQuarter defaultYear={nowQ.year} defaultQuarter={nowQ.quarter} />}
      </main>
    );
  }

  const months = quarterMonths(picked);
  const from = `${months[0]}-01`;
  const end = new Date(Date.UTC(picked.year, picked.quarter * 3, 1)).toISOString().slice(0, 10); // awal kuartal berikutnya

  const [{ data: sourceRows }, { data: revRows }, { data: leadRows }] = await Promise.all([
    supabase
      .from("target_sources")
      .select("id, target_id, name, division, weight, alloc_label, from_sales, sort, strategies:target_strategies(id, source_id, strategy, projection, sort)")
      .eq("target_id", picked.id)
      .order("sort"),
    fetchAll(() => supabase.from("revenues").select(REVENUE_COLUMNS).gte("revenue_date", from).lt("revenue_date", end).order("revenue_date")),
    fetchAll(() =>
      supabase.from("sales_leads").select("number, customer, value, closed_on, paid_on").gte("paid_on", from).lt("paid_on", end).order("paid_on"),
    ),
  ]);
  const sources = ((sourceRows ?? []) as unknown as TargetSource[]).map((s) => ({
    ...s,
    weight: s.weight == null ? null : Number(s.weight),
    strategies: [...s.strategies].sort((a, b) => a.sort - b.sort),
  }));
  const revenues = revRows as unknown as Revenue[];
  const leads = leadRows as { number: string; customer: string; value: number; closed_on: string | null; paid_on: string | null }[];
  const real = realization(picked, sources, revenues, leads);
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

  // Ringkasan per divisi (urut kemunculan).
  const divisions = [...new Set(sources.map((s) => s.division))].map((division) => {
    const ss = sources.filter((s) => s.division === division);
    return {
      division,
      weight: ss.reduce((s, x) => s + (x.weight ?? 0), 0),
      target: ss.reduce((s, x) => s + sourceTarget(picked.total, x), 0),
      projection: ss.reduce((s, x) => s + sourceProjection(x), 0),
      strategies: ss.reduce((s, x) => s + x.strategies.length, 0),
      real: ss.reduce((s, x) => s + sum(real.get(String(x.id)) ?? []), 0),
    };
  });
  const totalWeight = sources.reduce((s, x) => s + (x.weight ?? 0), 0);
  const totalTarget = sources.reduce((s, x) => s + sourceTarget(picked.total, x), 0);
  const totalProjection = sources.reduce((s, x) => s + sourceProjection(x), 0);
  const other = real.get(OTHER_KEY) ?? [0, 0, 0];
  const monthTotals = months.map((_, i) => sum([...real.values()].map((r) => r[i])));
  const totalReal = sum(monthTotals);
  const salesSource = sources.find((s) => s.from_sales);
  const unpaid = revenues.filter((r) => r.status === "unpaid");

  const th = "py-1.5 pr-3 font-medium";
  const td = "py-1.5 pr-3 text-right tabular-nums";

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      {header}

      <div className="flex flex-wrap items-center gap-2">
        {targets.map((t) => (
          <Link
            key={t.id}
            href={`/kpi/target?q=${t.id}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t.id === picked.id ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {quarterLabel(t)}
          </Link>
        ))}
        {canManage && <NewQuarter defaultYear={picked.quarter === 4 ? picked.year + 1 : picked.year} defaultQuarter={(picked.quarter % 4) + 1} />}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`Target ${quarterLabel(picked)}`} value={rp(picked.total)} />
        <Stat label="Realisasi (lunas)" value={rp(totalReal)} sub={`${pct(totalReal, picked.total)}% dari target`} />
        <Stat label="Sisa target" value={rp(Math.max(picked.total - totalReal, 0))} />
        <Stat label="Proyeksi strategi" value={rp(totalProjection)} sub={`${pct(totalProjection, picked.total)}% dari target`} />
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(pct(totalReal, picked.total), 100)}%` }} />
      </div>

      {/* ---------- Target per divisi ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Target per divisi</h2>
          {canManage && <TargetEditor target={picked} sources={sources} />}
        </div>
        {picked.notes && <p className="text-xs text-slate-500">{picked.notes}</p>}
        {totalWeight !== 100 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Jumlah bobot {formatNumber(totalWeight)}%, belum 100%.</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className={th}>Sumber</th>
                <th className={th}>Divisi PIC</th>
                <th className={`${th} text-right`}>Bobot</th>
                <th className={`${th} text-right`}>Target alokasi</th>
                <th className={`${th} text-right`}>Proyeksi strategi</th>
                <th className={`${th} text-right`}>Selisih</th>
                <th className={`${th} text-right`}>Proyeksi/target</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const target = sourceTarget(picked.total, s);
                const proj = sourceProjection(s);
                return (
                  <tr key={s.id} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.strategies.length > 0 && (
                        <ul className="mt-0.5 text-xs text-slate-500">
                          {s.strategies.map((g) => (
                            <li key={g.id}>
                              • {g.strategy}: {rp(g.projection)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-700">{s.division}</td>
                    <td className={td}>{s.weight == null ? "—" : `${formatNumber(s.weight)}%`}</td>
                    <td className={td}>{s.weight == null ? "—" : rp(target)}</td>
                    <td className={td}>{rp(proj)}</td>
                    <td className={`${td} ${proj - target < 0 ? "text-red-600" : "text-slate-700"}`}>{rp(proj - target)}</td>
                    <td className={td}>{target > 0 ? `${pct(proj, target)}%` : "—"}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-1.5 pr-3" colSpan={2}>
                  Total
                </td>
                <td className={td}>{formatNumber(totalWeight)}%</td>
                <td className={td}>{rp(totalTarget)}</td>
                <td className={td}>{rp(totalProjection)}</td>
                <td className={td}>{rp(totalProjection - totalTarget)}</td>
                <td className={td}>{totalTarget > 0 ? `${pct(totalProjection, totalTarget)}%` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DivisionTable
          head={["Divisi", "Bobot", "Target", "Proyeksi", "Jumlah strategi"]}
          rows={divisions.map((d) => [d.division, `${formatNumber(d.weight)}%`, rp(d.target), rp(d.projection), formatNumber(d.strategies)])}
        />
      </section>

      {/* ---------- Realisasi per divisi ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Realisasi per divisi</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className={th}>Sumber</th>
                {months.map((m) => (
                  <th key={m} className={`${th} text-right`}>
                    {monthName(m)}
                  </th>
                ))}
                <th className={`${th} text-right`}>Total {quarterLabel(picked)}</th>
                <th className={`${th} text-right`}>Realisasi/target</th>
                <th className={`${th} text-right`}>Sisa target</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const r = real.get(String(s.id)) ?? [0, 0, 0];
                const target = sourceTarget(picked.total, s);
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {s.division}
                        {s.from_sales ? " · otomatis dari Penjualan" : ""}
                      </p>
                    </td>
                    {r.map((n, i) => (
                      <td key={i} className={td}>
                        {n ? rp(n) : "—"}
                      </td>
                    ))}
                    <td className={`${td} font-semibold`}>{rp(sum(r))}</td>
                    <td className={td}>{target > 0 ? `${pct(sum(r), target)}%` : "—"}</td>
                    <td className={td}>{target > 0 ? rp(Math.max(target - sum(r), 0)) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-slate-100 text-slate-600">
                <td className="py-1.5 pr-3 italic">Alokasi lain / belum dipilih</td>
                {other.map((n, i) => (
                  <td key={i} className={td}>
                    {n ? rp(n) : "—"}
                  </td>
                ))}
                <td className={td}>{rp(sum(other))}</td>
                <td className={td}>—</td>
                <td className={td}>—</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1.5 pr-3">Total</td>
                {monthTotals.map((n, i) => (
                  <td key={i} className={td}>
                    {rp(n)}
                  </td>
                ))}
                <td className={td}>{rp(totalReal)}</td>
                <td className={td}>{pct(totalReal, picked.total)}%</td>
                <td className={td}>{rp(Math.max(picked.total - totalReal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DivisionTable
          head={["Divisi", "Target", "Realisasi", "Realisasi/target", "Sisa target"]}
          rows={divisions.map((d) => [
            d.division,
            rp(d.target),
            rp(d.real),
            d.target > 0 ? `${pct(d.real, d.target)}%` : "—",
            rp(Math.max(d.target - d.real, 0)),
          ])}
        />
      </section>

      {/* ---------- Sumber data realisasi ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Penjualan lunas {quarterLabel(picked)}</h2>
        <p className="text-xs text-slate-500">
          Otomatis dari Pipeline penjualan (tahap Lunas), masuk ke {salesSource ? `"${salesSource.name}"` : "Alokasi lain"}.
        </p>
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada penjualan lunas di kuartal ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {leads.map((l) => (
              <li key={l.number} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="font-mono text-xs text-slate-500">{l.number}</span> {l.customer}
                  <span className="text-xs text-slate-500"> · lunas {formatDate(l.paid_on)}</span>
                </span>
                <span className="tabular-nums">{rp(l.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Pendapatan lain {quarterLabel(picked)}</h2>
          {canRecord && <RevenueEditor revenue={null} labels={sources.filter((s) => !s.from_sales).map((s) => s.alloc_label)} defaultDate={today} />}
        </div>
        <p className="text-xs text-slate-500">
          Proyek, trading, grant, dll. Dicatat F&A / admin / CEO. Hanya yang berstatus Lunas dihitung sebagai realisasi.
          {unpaid.length > 0 && ` Belum lunas: ${unpaid.length} catatan (${rp(sum(unpaid.map((r) => r.amount)))}).`}
        </p>
        {revenues.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada catatan pendapatan di kuartal ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {revenues.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-slate-900">{r.description}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(r.revenue_date)} · {r.allocation ?? "Alokasi belum dipilih"} ·{" "}
                    <span className={r.status === "paid" ? "font-medium text-logo-leaf" : "text-amber-700"}>{REVENUE_STATUS[r.status]}</span>
                    {r.creator ? ` · dicatat ${r.creator.full_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">{rp(r.amount)}</span>
                  {canRecord && (
                    <RevenueEditor revenue={r} labels={sources.filter((s) => !s.from_sales).map((s) => s.alloc_label)} defaultDate={today} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function DivisionTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-slate-50 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ringkasan per divisi</p>
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            {head.map((h, i) => (
              <th key={h} className={`py-1 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-slate-200">
              {r.map((c, i) => (
                <td key={i} className={`py-1 pr-3 ${i > 0 ? "text-right tabular-nums" : "font-medium text-slate-800"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
