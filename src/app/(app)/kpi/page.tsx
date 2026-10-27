import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatNumber } from "@/lib/format";
import { DEPT_ORDER, KPI_COLUMNS, canEditKpi, isMyKpi, pct, type KpiItem } from "@/lib/kpi";
import KpiItemRow from "./KpiItemRow";

export const metadata: Metadata = { title: "Monitoring KPI - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS = { semua: "Semua", belum: "Belum selesai", selesai: "Selesai" } as const;
type Status = keyof typeof STATUS;

export default async function KpiPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const dept = typeof sp.dept === "string" && DEPT_ORDER.includes(sp.dept) ? sp.dept : "";
  const status: Status = typeof sp.status === "string" && sp.status in STATUS ? (sp.status as Status) : "semua";
  const pic = typeof sp.pic === "string" ? sp.pic : "";

  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [{ data: rows }, { data: depts }] = await Promise.all([
    fetchAll(() => supabase.from("kpi_items").select(KPI_COLUMNS).order("objective_code").order("id")),
    supabase.from("departments").select("code, name"),
  ]);
  const all = rows as unknown as KpiItem[];
  const deptName = new Map((depts ?? []).map((d) => [d.code as string, d.name as string]));

  // Pilihan PIC: orang yang menjadi PIC item mana pun.
  const picOptions = [...new Map(all.flatMap((k) => (k.pic_id && k.pic ? [[k.pic_id, k.pic.full_name] as const] : []))).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );

  const matchPic = (k: KpiItem) =>
    !pic || (pic === "saya" ? isMyKpi(me, k) : pic === "departemen" ? k.pic_type === "department" : k.pic_id === pic);
  const list = all.filter(
    (k) =>
      (!dept || k.dept_code === dept) &&
      matchPic(k) &&
      (status === "semua" || (status === "selesai" ? k.is_done : !k.is_done)),
  );

  const doneAll = list.filter((k) => k.is_done).length;
  const byDept = DEPT_ORDER.map((code) => {
    const items = list.filter((k) => k.dept_code === code);
    const objectives = new Map<string, KpiItem[]>();
    for (const k of items) objectives.set(k.objective_code, [...(objectives.get(k.objective_code) ?? []), k]);
    return { code, items, objectives: [...objectives.entries()] };
  }).filter((d) => d.items.length > 0);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { dept: dept || null, status: status === "semua" ? null : status, pic: pic || null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/kpi?${s}` : "/kpi";
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Monitoring KPI</p>
          <h1 className="text-2xl font-bold text-slate-900">KPI departemen</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatNumber(doneAll)} dari {formatNumber(list.length)} item selesai ({pct(doneAll, list.length)}%).
          </p>
        </div>
        <Link href="/kpi/target" className="rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          Target kuartal →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ dept: null })} className={chip(!dept)}>
          Semua dept
        </Link>
        {DEPT_ORDER.map((d) => (
          <Link key={d} href={href({ dept: d })} className={chip(dept === d)}>
            {d}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS) as Status[]).map((s) => (
          <Link key={s} href={href({ status: s === "semua" ? null : s })} className={chip(status === s)}>
            {STATUS[s]}
          </Link>
        ))}
        <form action="/kpi" className="flex gap-1 sm:ml-auto">
          {dept && <input type="hidden" name="dept" value={dept} />}
          {status !== "semua" && <input type="hidden" name="status" value={status} />}
          <select
            name="pic"
            defaultValue={pic}
            aria-label="Filter PIC"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
          >
            <option value="">Semua PIC</option>
            <option value="saya">KPI saya</option>
            <option value="departemen">PIC departemen</option>
            {picOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
            Terapkan
          </button>
        </form>
      </div>

      {byDept.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Tidak ada item KPI yang cocok dengan filter.
        </p>
      ) : (
        byDept.map((d) => {
          const done = d.items.filter((k) => k.is_done).length;
          return (
            <section key={d.code} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">
                    {d.code} · {deptName.get(d.code) ?? d.code}
                  </h2>
                  <span className="text-sm text-slate-600">
                    {formatNumber(done)}/{formatNumber(d.items.length)} selesai · <b>{pct(done, d.items.length)}%</b>
                  </span>
                </div>
                <Bar value={pct(done, d.items.length)} />
              </div>
              {d.objectives.map(([code, items]) => {
                const od = items.filter((k) => k.is_done).length;
                return (
                  <details key={code} className="group rounded-xl border border-slate-200" open={od < items.length}>
                    <summary className="flex cursor-pointer list-none flex-col gap-1.5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm text-slate-800">
                          <span className="font-mono text-xs font-semibold text-slate-500">{code}</span> {items[0].objective}
                        </p>
                        <span className="shrink-0 text-xs font-medium text-slate-600">
                          {od}/{items.length}
                        </span>
                      </div>
                      <Bar value={pct(od, items.length)} small />
                    </summary>
                    <ul className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
                      {items.map((k) => (
                        <KpiItemRow key={k.id} item={k} canEdit={canEditKpi(me, k)} deptName={deptName.get(k.dept_code) ?? k.dept_code} />
                      ))}
                    </ul>
                  </details>
                );
              })}
            </section>
          );
        })
      )}
    </main>
  );
}

function Bar({ value, small }: { value: number; small?: boolean }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${small ? "h-1.5" : "h-2.5"}`}>
      <div className={`h-full rounded-full ${value >= 100 ? "bg-logo-leaf" : "bg-brand-600"}`} style={{ width: `${value}%` }} />
    </div>
  );
}
