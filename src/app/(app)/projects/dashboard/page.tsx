import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { todayJakarta } from "@/lib/format";
import { STAGE_LABEL, STAGE_STYLE, TYPE_LABEL, isAquaEditor, type AquaStage, type ProjectType } from "@/lib/aquaculture";
import {
  BUDGET_COLUMNS,
  STOCK_ITEM_COLUMNS,
  STOCK_MOVE_COLUMNS,
  TX_COLUMNS,
  budgetReport,
  categorySuggestions,
  normalizeLedger,
  paramsFromPlan,
  profitReport,
  stockBalances,
} from "@/lib/project-ledger";
import AutoRefresh from "@/components/project-dashboard/AutoRefresh";
import { BudgetSection, ProfitSection, StockSection, SummaryCards, rp } from "@/components/project-dashboard/Views";
import { AccessPanel, BudgetEditor, JournalEditor, ProjectPicker, StockEditor, type AccessCode } from "./Editors";

export const metadata: Metadata = { title: "Dashboard realisasi - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = { ringkasan: "Ringkasan", jurnal: "Jurnal transaksi", anggaran: "Anggaran", stok: "Stok", akses: "Akses investor" } as const;
type Tab = keyof typeof TABS;

type ProjectRow = {
  id: string;
  number: string;
  name: string;
  type: ProjectType;
  category: string | null;
  stage: AquaStage;
  pic_id: string;
  plan_id: string | null;
  investors: { capital: number }[];
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProjectDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getCurrentEmployee();
  if (!me) return null;
  const supabase = await createClient();
  const projectId = first(sp.proyek);
  const tab: Tab = (Object.keys(TABS) as Tab[]).includes(first(sp.bagian) as Tab) ? (first(sp.bagian) as Tab) : "ringkasan";

  if (!projectId) {
    // Daftar proyek: yang sudah punya anggaran/jurnal di atas.
    const [projects, budgetIds, txIds] = await Promise.all([
      supabase.from("aqua_projects").select("id, number, name, type, category, stage, pic_id, plan_id, investors").order("created_at", { ascending: false }),
      fetchAll<{ project_id: string }>(() => supabase.from("project_budget_lines").select("project_id")),
      fetchAll<{ project_id: string; amount: number; kind: string }>(() => supabase.from("project_transactions").select("project_id, amount, kind")),
    ]);
    const list = ((projects.data ?? []) as ProjectRow[]).filter((p) => p.stage !== "cancelled");
    const withData = new Set([...budgetIds.data.map((r) => r.project_id), ...txIds.data.map((r) => r.project_id)]);
    const cost = new Map<string, number>();
    const income = new Map<string, number>();
    for (const t of txIds.data) {
      const m = t.kind === "income" ? income : t.kind === "expense" || t.kind === "capex" ? cost : null;
      m?.set(t.project_id, (m.get(t.project_id) ?? 0) + Number(t.amount));
    }
    const active = list.filter((p) => withData.has(p.id));
    const others = list.filter((p) => !withData.has(p.id));
    const item = (p: ProjectRow) => (
      <li key={p.id}>
        <Link
          href={`/projects/dashboard?proyek=${p.id}`}
          className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{p.number}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{p.category || TYPE_LABEL[p.type]}</span>
              <span className={`rounded-full px-2 py-0.5 ${STAGE_STYLE[p.stage]}`}>{STAGE_LABEL[p.stage]}</span>
            </div>
            <p className="mt-0.5 font-semibold text-slate-900">{p.name}</p>
          </div>
          {withData.has(p.id) && (
            <p className="text-xs text-slate-500 sm:text-right">
              Biaya <span className="font-semibold tabular-nums text-slate-800">{rp(cost.get(p.id) ?? 0)}</span>
              <br className="hidden sm:block" /> · Pemasukan <span className="font-semibold tabular-nums text-brand-800">{rp(income.get(p.id) ?? 0)}</span>
            </p>
          )}
        </Link>
      </li>
    );
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Project Management</p>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard realisasi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Anggaran vs realisasi, laba rugi, jurnal transaksi, dan stok per proyek. Pilih proyek untuk membuka dashboard-nya.
          </p>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Sudah berjalan ({active.length})</h2>
          {active.length ? (
            <ul className="flex flex-col gap-2">{active.map(item)}</ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              Belum ada proyek dengan anggaran atau jurnal. Pilih proyek di bawah untuk mulai mengisi.
            </p>
          )}
        </section>
        {others.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Belum diisi ({others.length})</h2>
            <ul className="flex flex-col gap-2">{others.map(item)}</ul>
          </section>
        )}
      </main>
    );
  }

  const [projectRes, listRes, budgetRes, txRes, itemsRes, movesRes, codesRes] = await Promise.all([
    supabase
      .from("aqua_projects")
      .select("id, number, name, type, category, stage, pic_id, plan_id, investors, plan:requests!aqua_projects_plan_id_fkey(params:data->params)")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("aqua_projects").select("id, number, name, stage").neq("stage", "cancelled").order("created_at", { ascending: false }),
    supabase.from("project_budget_lines").select(BUDGET_COLUMNS).eq("project_id", projectId).order("sort").order("created_at"),
    fetchAll(() => supabase.from("project_transactions").select(TX_COLUMNS).eq("project_id", projectId).order("tx_date").order("created_at")),
    supabase.from("project_stock_items").select(STOCK_ITEM_COLUMNS).eq("project_id", projectId).order("sort").order("name"),
    fetchAll(() => supabase.from("project_stock_moves").select(STOCK_MOVE_COLUMNS).eq("project_id", projectId).order("move_date").order("id")),
    supabase
      .from("project_access_codes")
      .select("id, label, code_hint, expires_on, revoked_at, created_at, last_used_at, use_count")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);
  const project = projectRes.data as (ProjectRow & { plan: { params: Record<string, number> | null } | null }) | null;
  if (!project) notFound();
  const error = budgetRes.error ?? txRes.error ?? itemsRes.error ?? movesRes.error;

  const data = normalizeLedger({
    budget: budgetRes.data,
    transactions: txRes.data,
    stockItems: itemsRes.data,
    stockMoves: movesRes.data,
  });
  const params = paramsFromPlan(project.plan?.params);
  const budget = budgetReport(data);
  const profit = profitReport(data, params);
  const balances = stockBalances(data);
  const isPic = project.pic_id === me.id;
  const canEdit = isAquaEditor(me) || me.dept_code === "FA" || isPic;
  const canAccess = isAquaEditor(me) || isPic;
  const tabs = (Object.keys(TABS) as Tab[]).filter((t) => t !== "akses" || canAccess);
  const lineNames = Object.fromEntries(data.budget.map((b) => [b.id, `${b.grp} · ${b.item}`]));
  const suggestions = categorySuggestions(project.type, project.category);
  const aquaculture = project.type === "aquagrowth" || project.type === "mini_ras";
  const fileBase = `${project.number}-${project.name}`.replace(/[^\w-]+/g, "-");

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/projects/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
            ← Semua dashboard proyek
          </Link>
          <ProjectPicker current={project.id} projects={(listRes.data ?? []) as { id: string; number: string; name: string }[]} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Dashboard realisasi</p>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{project.number}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{project.category || TYPE_LABEL[project.type]}</span>
            <span className={`rounded-full px-2 py-0.5 ${STAGE_STYLE[project.stage]}`}>{STAGE_LABEL[project.stage]}</span>
            <Link href={`/projects/${project.id}`} className="font-medium text-brand-700 hover:underline">
              Buka halaman proyek
            </Link>
          </div>
        </div>
        <AutoRefresh loadedAt={new Date().toISOString()} />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Gagal memuat data: {error.message}</p>}

      <SummaryCards budget={budget} profit={profit} />

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/projects/dashboard?proyek=${project.id}${t === "ringkasan" ? "" : `&bagian=${t}`}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              t === tab ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>

      {tab === "ringkasan" && (
        <>
          <BudgetSection report={budget} />
          <ProfitSection report={profit} showShares />
          <StockSection balances={balances} />
        </>
      )}
      {tab === "jurnal" && (
        <JournalEditor
          projectId={project.id}
          transactions={data.transactions}
          budget={data.budget}
          lineNames={lineNames}
          suggestions={suggestions}
          canEdit={canEdit}
          aquaculture={aquaculture}
          today={todayJakarta()}
          fileName={`Jurnal-${fileBase}.xlsx`}
        />
      )}
      {tab === "anggaran" && (
        <BudgetEditor projectId={project.id} budget={data.budget} canEdit={canEdit} hasPlan={!!project.plan_id} report={budget} />
      )}
      {tab === "stok" && (
        <>
          <StockSection balances={balances} />
          <StockEditor projectId={project.id} items={data.stockItems} moves={data.stockMoves} canEdit={canEdit} today={todayJakarta()} />
        </>
      )}
      {tab === "akses" && canAccess && (
        <AccessPanel
          projectId={project.id}
          codes={(codesRes.data ?? []) as AccessCode[]}
          today={todayJakarta()}
        />
      )}
    </main>
  );
}
