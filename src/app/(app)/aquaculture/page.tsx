import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber } from "@/lib/format";
import {
  AQUA_STAGES,
  PROJECT_COLUMNS,
  PROJECT_TYPES,
  STAGE_LABEL,
  STAGE_STYLE,
  TYPE_LABEL,
  isAquaEditor,
  stageRank,
  type AquaProject,
  type AquaStage,
  type ProjectType,
} from "@/lib/aquaculture";

export const metadata: Metadata = { title: "Aquaculture - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;

const VIEWS = { aktif: "Berjalan", selesai: "Selesai", batal: "Batal", semua: "Semua" } as const;
type View = keyof typeof VIEWS;

function inView(p: AquaProject, view: View): boolean {
  if (view === "semua") return true;
  if (view === "batal") return p.stage === "cancelled";
  if (view === "selesai") return p.stage === "completed";
  return p.stage !== "cancelled" && p.stage !== "completed";
}

const daysSince = (ts: string) => Math.max(0, Math.floor((Date.now() - Date.parse(ts)) / 86_400_000));

// Pipeline proyek Aquaculture per jenis (Aquagrowth, Mini RAS, Workshop, Pelatihan), dikelompokkan per tahap.
export default async function AquaculturePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = typeof sp.jenis === "string" && (PROJECT_TYPES as readonly string[]).includes(sp.jenis) ? (sp.jenis as ProjectType) : null;
  const view: View = typeof sp.lihat === "string" && sp.lihat in VIEWS ? (sp.lihat as View) : "aktif";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [projectRes, incomeRes] = await Promise.all([
    fetchAll(() => supabase.from("aqua_projects").select(PROJECT_COLUMNS).order("created_at", { ascending: false })),
    fetchAll(() => supabase.from("revenues").select("aqua_project_id, amount").not("aqua_project_id", "is", null)),
  ]);
  const all = projectRes.data as unknown as AquaProject[];
  const income = new Map<string, number>();
  for (const r of incomeRes.data as { aqua_project_id: string; amount: number }[]) {
    income.set(r.aqua_project_id, (income.get(r.aqua_project_id) ?? 0) + r.amount);
  }

  const ofType = type ? all.filter((p) => p.type === type) : all;
  const list = ofType.filter(
    (p) => inView(p, view) && (!q || `${p.number} ${p.name} ${p.location ?? ""} ${p.partner ?? ""}`.toLowerCase().includes(q)),
  );

  // Ringkasan per jenis: proyek berjalan, nilai pipeline (perkiraan), nilai kontrak, dana masuk.
  const summary = PROJECT_TYPES.map((t) => {
    const ps = all.filter((p) => p.type === t && p.stage !== "cancelled");
    const active = ps.filter((p) => p.stage !== "completed");
    const contracted = ps.filter((p) => stageRank(p.stage) >= stageRank("signed"));
    return {
      type: t,
      active: active.length,
      pipeline: active.filter((p) => stageRank(p.stage) < stageRank("signed")).reduce((s, p) => s + p.estimated_value, 0),
      contracted: contracted.length,
      contractValue: contracted.reduce((s, p) => s + (p.contract_value ?? 0), 0),
      income: ps.reduce((s, p) => s + (income.get(p.id) ?? 0), 0),
    };
  });

  const stages: AquaStage[] = view === "batal" ? ["cancelled"] : [...AQUA_STAGES];
  const groups = stages.map((s) => ({ stage: s, rows: list.filter((p) => p.stage === s) })).filter((g) => g.rows.length > 0);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { jenis: type, lihat: view === "aktif" ? null : view, q: q || null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/aquaculture?${s}` : "/aquaculture";
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
      active ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
    }`;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Aquaculture</p>
          <h1 className="text-2xl font-bold text-slate-900">Project Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Dari identifikasi peluang, kelayakan finansial & RAB, kontrak, sampai eksekusi dan panen.
          </p>
        </div>
        {isAquaEditor(me) && (
          <Link
            href={type ? `/aquaculture/baru?jenis=${type}` : "/aquaculture/baru"}
            className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            + Catat peluang
          </Link>
        )}
      </div>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {summary.map((s) => (
          <Link
            key={s.type}
            href={href({ jenis: type === s.type ? null : s.type })}
            className={`flex flex-col gap-0.5 rounded-2xl border bg-white p-3 shadow-sm hover:border-brand-300 ${
              type === s.type ? "border-brand-600 ring-2 ring-brand-600/20" : "border-slate-200"
            }`}
          >
            <p className="font-semibold text-slate-900">{TYPE_LABEL[s.type]}</p>
            <p className="text-xs text-slate-600">
              {formatNumber(s.active)} berjalan · {formatNumber(s.contracted)} berkontrak
            </p>
            <p className="mt-1 text-xs text-slate-500">Pipeline (perkiraan)</p>
            <p className="font-bold tabular-nums text-slate-900">{rp(s.pipeline)}</p>
            <p className="text-xs text-slate-500">
              Kontrak <span className="tabular-nums text-slate-700">{rp(s.contractValue)}</span> · dana masuk{" "}
              <span className="tabular-nums font-semibold text-brand-800">{rp(s.income)}</span>
            </p>
          </Link>
        ))}
      </section>
      <p className="-mt-2 text-xs text-slate-500">
        Dana masuk dicatat F&A di halaman proyek dan otomatis masuk realisasi{" "}
        <Link href="/kpi/target?divisi=Aquaculture" className="font-medium text-brand-700 hover:underline">
          Target kuartal divisi Aquaculture
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ jenis: null })} className={chip(type === null)}>
          Semua jenis
        </Link>
        {PROJECT_TYPES.map((t) => (
          <Link key={t} href={href({ jenis: t })} className={chip(type === t)}>
            {TYPE_LABEL[t]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={href({ lihat: v === "aktif" ? null : v })} className={chip(v === view)}>
            {VIEWS[v]} ({ofType.filter((p) => inView(p, v)).length})
          </Link>
        ))}
        <form action="/aquaculture" className="ml-auto flex gap-1">
          {type && <input type="hidden" name="jenis" value={type} />}
          {view !== "aktif" && <input type="hidden" name="lihat" value={view} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cari proyek / lokasi / mitra"
            className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
          />
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Belum ada proyek di sini.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.stage} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className={`rounded-full px-2 py-0.5 text-xs ${STAGE_STYLE[g.stage]}`}>{STAGE_LABEL[g.stage]}</span>
              <span className="text-slate-500">{g.rows.length} proyek</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {g.rows.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/aquaculture/${p.id}`}
                    className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">{p.number}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{TYPE_LABEL[p.type]}</span>
                        {p.contract_number && <span>Kontrak {p.contract_number}</span>}
                      </div>
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {[p.location, p.partner].filter(Boolean).join(" · ")}
                        {p.location || p.partner ? " · " : ""}PIC {p.pic?.full_name ?? "-"} ·{" "}
                        {p.estimated_start ? `mulai ${formatDate(p.estimated_start)} · ` : ""}
                        {daysSince(p.stage_since)} hari di tahap ini
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums text-slate-900">{rp(p.contract_value ?? p.estimated_value)}</p>
                      <p className="text-xs text-slate-500">
                        {p.contract_value !== null ? "nilai kontrak" : "perkiraan nilai"}
                        {income.get(p.id) ? ` · masuk ${rp(income.get(p.id)!)}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
