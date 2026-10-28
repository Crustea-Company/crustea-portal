import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  OTHER_KEY,
  REVENUE_COLUMNS,
  TARGET_DIVISIONS,
  hasTarget,
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
      .select(
        "id, target_id, name, division, weight, target_amount, alloc_label, from_sales, sort, strategies:target_strategies(id, source_id, strategy, projection, note, realization, realization_note, sort)",
      )
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
  const sourceReal = (s: TargetSource) => sum(real.get(String(s.id)) ?? []);

  // Filter divisi (?divisi=Bisdev). Kartu ringkasan di atas tetap untuk seluruh perusahaan.
  const division = TARGET_DIVISIONS.find((d) => d === sp.divisi) ?? null;
  const shown = division ? sources.filter((s) => s.division === division) : sources;
  const divisionHref = (d: string | null) => `/kpi/target?q=${picked.id}${d ? `&divisi=${encodeURIComponent(d)}` : ""}`;

  // Ringkasan per divisi, urut Bisdev, Aquaculture, TechOps.
  const divisions = TARGET_DIVISIONS.filter((d) => shown.some((s) => s.division === d)).map((d) => {
    const ss = shown.filter((s) => s.division === d);
    return {
      division: d,
      sources: ss,
      weight: ss.reduce((s, x) => s + (x.weight ?? 0), 0),
      target: ss.reduce((s, x) => s + sourceTarget(picked.total, x), 0),
      projection: ss.reduce((s, x) => s + sourceProjection(x), 0),
      strategies: ss.reduce((s, x) => s + x.strategies.length, 0),
      real: ss.reduce((s, x) => s + sourceReal(x), 0),
    };
  });
  const totalWeight = sources.reduce((s, x) => s + (x.weight ?? 0), 0);
  const shownWeight = shown.reduce((s, x) => s + (x.weight ?? 0), 0);
  const shownTarget = shown.reduce((s, x) => s + sourceTarget(picked.total, x), 0);
  const shownProjection = shown.reduce((s, x) => s + sourceProjection(x), 0);
  const totalProjection = sources.reduce((s, x) => s + sourceProjection(x), 0);
  const other = real.get(OTHER_KEY) ?? [0, 0, 0];
  const monthTotals = months.map((_, i) => sum([...real.values()].map((r) => r[i])));
  const totalReal = sum(monthTotals);
  const shownMonths = division ? months.map((_, i) => sum(shown.map((s) => (real.get(String(s.id)) ?? [0, 0, 0])[i]))) : monthTotals;
  const shownReal = sum(shownMonths);
  const shownTargetBase = division ? shownTarget : picked.total;
  const salesSource = sources.find((s) => s.from_sales);
  const showLeads = !division || (salesSource != null && salesSource.division === division);
  const shownLabels = new Set(shown.map((s) => s.alloc_label.trim().toLowerCase()));
  const shownRevenues = division ? revenues.filter((r) => shownLabels.has((r.allocation ?? "").trim().toLowerCase())) : revenues;
  const unpaid = shownRevenues.filter((r) => r.status === "unpaid");

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

      {/* ---------- Filter divisi ---------- */}
      <nav className="flex flex-wrap items-center gap-2" aria-label="Filter divisi">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Divisi</span>
        {[null, ...TARGET_DIVISIONS].map((d) => (
          <Link
            key={d ?? "semua"}
            href={divisionHref(d)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${d === division ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {d ?? "Semua"}
          </Link>
        ))}
      </nav>

      {/* ---------- Target per divisi ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Target per divisi{division ? ` · ${division}` : ""}</h2>
          {canManage && <TargetEditor target={picked} sources={sources} />}
        </div>
        {picked.notes && <p className="text-xs text-slate-500">{picked.notes}</p>}
        {!division && totalWeight !== 100 && sources.some(hasTarget) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Jumlah bobot {formatNumber(totalWeight)}%, belum 100%.</p>
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada sumber target untuk divisi ini.</p>
        ) : (
          <>
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
                  {shown.map((s) => {
                    const target = sourceTarget(picked.total, s);
                    const proj = sourceProjection(s);
                    return (
                      <tr key={s.id} className="border-b border-slate-100 align-top">
                        <td className="py-1.5 pr-3">
                          <p className="font-medium text-slate-900">{s.name}</p>
                          <p className="text-xs text-slate-500">{formatNumber(s.strategies.length)} strategi</p>
                        </td>
                        <td className="py-1.5 pr-3 text-slate-700">{s.division}</td>
                        <td className={td}>{s.weight == null ? "—" : `${formatNumber(s.weight)}%`}</td>
                        <td className={td}>{hasTarget(s) ? rp(target) : "—"}</td>
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
                    <td className={td}>{formatNumber(shownWeight)}%</td>
                    <td className={td}>{rp(shownTarget)}</td>
                    <td className={td}>{rp(shownProjection)}</td>
                    <td className={td}>{rp(shownProjection - shownTarget)}</td>
                    <td className={td}>{shownTarget > 0 ? `${pct(shownProjection, shownTarget)}%` : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <DivisionSummary
              open={division != null}
              head={["Divisi", "Bobot", "Target", "Proyeksi", "Jumlah strategi", "Proyeksi/target"]}
              rows={divisions.map((d) => ({
                key: d.division,
                cells: [
                  d.division,
                  `${formatNumber(d.weight)}%`,
                  rp(d.target),
                  rp(d.projection),
                  formatNumber(d.strategies),
                  d.target > 0 ? `${pct(d.projection, d.target)}%` : "—",
                ],
                detail: <StrategyPlan sources={d.sources} />,
              }))}
            />
          </>
        )}
      </section>

      {/* ---------- Realisasi per divisi ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Realisasi per divisi{division ? ` · ${division}` : ""}</h2>
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
              {shown.map((s) => {
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
              {!division && (
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
              )}
              <tr className="font-semibold">
                <td className="py-1.5 pr-3">Total</td>
                {shownMonths.map((n, i) => (
                  <td key={i} className={td}>
                    {rp(n)}
                  </td>
                ))}
                <td className={td}>{rp(shownReal)}</td>
                <td className={td}>{shownTargetBase > 0 ? `${pct(shownReal, shownTargetBase)}%` : "—"}</td>
                <td className={td}>{shownTargetBase > 0 ? rp(Math.max(shownTargetBase - shownReal, 0)) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {divisions.length > 0 && (
          <DivisionSummary
            open={division != null}
            head={["Divisi", "Target", "Realisasi", "Realisasi/target", "Sisa target"]}
            rows={divisions.map((d) => ({
              key: d.division,
              cells: [
                d.division,
                rp(d.target),
                rp(d.real),
                d.target > 0 ? `${pct(d.real, d.target)}%` : "—",
                d.target > 0 ? rp(Math.max(d.target - d.real, 0)) : "—",
              ],
              detail: <StrategyProgress sources={d.sources} realOf={sourceReal} />,
            }))}
          />
        )}
      </section>

      {/* ---------- Sumber data realisasi ---------- */}
      {showLeads && (
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
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">
            Pendapatan lain {quarterLabel(picked)}
            {division ? ` · ${division}` : ""}
          </h2>
          {canRecord && <RevenueEditor revenue={null} labels={sources.filter((s) => !s.from_sales).map((s) => s.alloc_label)} defaultDate={today} />}
        </div>
        <p className="text-xs text-slate-500">
          Proyek, trading, grant, dll. Dicatat F&A / admin / CEO. Hanya yang berstatus Lunas dihitung sebagai realisasi.
          {unpaid.length > 0 && ` Belum lunas: ${unpaid.length} catatan (${rp(sum(unpaid.map((r) => r.amount)))}).`}
        </p>
        {shownRevenues.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada catatan pendapatan di kuartal ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {shownRevenues.map((r) => (
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

// Ringkasan per divisi; klik baris divisi untuk membuka rincian strateginya.
function DivisionSummary({ head, rows, open }: { head: string[]; rows: { key: string; cells: string[]; detail: ReactNode }[]; open: boolean }) {
  const cols = { gridTemplateColumns: `minmax(8rem, 1.3fr) repeat(${head.length - 1}, minmax(6.5rem, 1fr))` };
  return (
    <div className="overflow-x-auto rounded-xl bg-slate-50 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Ringkasan per divisi <span className="font-normal normal-case tracking-normal">· klik divisi untuk melihat strateginya</span>
      </p>
      <div className="min-w-[600px] text-sm">
        <div className="grid gap-x-3 py-1 text-xs font-medium text-slate-500" style={cols}>
          {head.map((h, i) => (
            <span key={h} className={i > 0 ? "text-right" : ""}>
              {h}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <details key={r.key} open={open} className="group border-t border-slate-200">
            <summary className="grid cursor-pointer list-none gap-x-3 rounded py-1.5 hover:bg-slate-100 [&::-webkit-details-marker]:hidden" style={cols}>
              <span className="font-medium text-slate-800">
                <span className="mr-1 inline-block text-brand-700 transition-transform group-open:rotate-90">▸</span>
                {r.cells[0]}
              </span>
              {r.cells.slice(1).map((c, i) => (
                <span key={i} className="text-right tabular-nums">
                  {c}
                </span>
              ))}
            </summary>
            <div className="pb-3 pl-4">{r.detail}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

const sth = "py-1 pr-3 font-medium";
const std = "py-1 pr-3 align-top";

// Rincian strategi per divisi: sumber, strategi, proyeksi, catatan.
function StrategyPlan({ sources }: { sources: TargetSource[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className={sth}>Sumber</th>
          <th className={sth}>Strategi</th>
          <th className={`${sth} text-right`}>Proyeksi</th>
          <th className={sth}>Catatan</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((s) =>
          s.strategies.length === 0 ? (
            <tr key={s.id} className="border-t border-slate-200">
              <td className={`${std} font-medium text-slate-800`}>{s.name}</td>
              <td className={`${std} italic text-slate-500`} colSpan={3}>
                Belum ada strategi.
              </td>
            </tr>
          ) : (
            s.strategies.map((g, k) => (
              <tr key={g.id} className="border-t border-slate-200">
                <td className={`${std} font-medium text-slate-800`}>{k === 0 ? s.name : ""}</td>
                <td className={`${std} text-slate-800`}>{g.strategy}</td>
                <td className={`${std} text-right tabular-nums`}>{rp(g.projection)}</td>
                <td className={`${std} whitespace-pre-line text-slate-600`}>{g.note ?? ""}</td>
              </tr>
            ))
          ),
        )}
      </tbody>
    </table>
  );
}

// Progres per strategi: realisasi diisi manual per strategi; dibandingkan dengan realisasi lunas sumbernya.
function StrategyProgress({ sources, realOf }: { sources: TargetSource[]; realOf: (s: TargetSource) => number }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className={sth}>Sumber</th>
          <th className={sth}>Strategi</th>
          <th className={`${sth} text-right`}>Proyeksi</th>
          <th className={`${sth} text-right`}>Realisasi</th>
          <th className={`${sth} text-right`}>Realisasi/proyeksi</th>
          <th className={sth}>Progres / keterangan</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => {
          const sourceReal = realOf(s);
          const detailed = s.strategies.reduce((n, g) => n + (g.realization ?? 0), 0);
          return [
            ...s.strategies.map((g, k) => (
              <tr key={g.id} className="border-t border-slate-200">
                <td className={`${std} font-medium text-slate-800`}>{k === 0 ? s.name : ""}</td>
                <td className={`${std} text-slate-800`}>{g.strategy}</td>
                <td className={`${std} text-right tabular-nums`}>{rp(g.projection)}</td>
                <td className={`${std} text-right tabular-nums`}>{g.realization == null ? "—" : rp(g.realization)}</td>
                <td className={`${std} text-right tabular-nums`}>
                  {g.realization != null && g.projection > 0 ? `${pct(g.realization, g.projection)}%` : "—"}
                </td>
                <td className={`${std} whitespace-pre-line text-slate-600`}>{g.realization_note ?? ""}</td>
              </tr>
            )),
            <tr key={`${s.id}-sum`} className="border-t border-slate-200 text-slate-500">
              <td className={`${std} font-medium text-slate-800`}>{s.strategies.length === 0 ? s.name : ""}</td>
              <td className={std} colSpan={5}>
                Realisasi lunas sumber ini {rp(sourceReal)} · sudah dirinci ke strategi {rp(detailed)} · belum dirinci{" "}
                {rp(sourceReal - detailed)}
              </td>
            </tr>,
          ];
        })}
      </tbody>
    </table>
  );
}
