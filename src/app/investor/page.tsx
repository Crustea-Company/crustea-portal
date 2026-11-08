import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import AuthCard from "@/components/AuthCard";
import AutoRefresh from "@/components/project-dashboard/AutoRefresh";
import JournalTable from "@/components/project-dashboard/JournalTable";
import { BudgetSection, ProfitSection, StockSection, SummaryCards, rp } from "@/components/project-dashboard/Views";
import { STAGE_LABEL, STAGE_STYLE, TYPE_LABEL } from "@/lib/aquaculture";
import { formatDate } from "@/lib/format";
import { budgetReport, paramsFromPlan, profitReport, stockBalances } from "@/lib/project-ledger";
import { leaveDashboard } from "./actions";
import CodeForm from "./CodeForm";
import { INVESTOR_COOKIE, loadInvestorDashboard } from "./data";

export const metadata: Metadata = {
  title: "Dashboard investor - Crustea",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Dashboard proyek untuk investor (tanpa login karyawan). Kode dicek ke database setiap kali halaman dimuat,
// jadi kode yang dicabut/kedaluwarsa langsung tidak berlaku.
export default async function InvestorPage() {
  const code = (await cookies()).get(INVESTOR_COOKIE)?.value ?? "";
  const res = code ? await loadInvestorDashboard(code) : null;

  if (!res || !res.ok) {
    return (
      <AuthCard title="Dashboard Investor" subtitle="Pantau realisasi proyek Crustea">
        <CodeForm notice={res && !res.ok ? res.message : null} />
      </AuthCard>
    );
  }

  const { project, ledger, label } = res.data;
  const params = paramsFromPlan(project.params);
  const budget = budgetReport(ledger);
  const profit = profitReport(ledger, params);
  const balances = stockBalances(ledger);
  const lineNames = Object.fromEntries(ledger.budget.map((b) => [b.id, `${b.grp} · ${b.item}`]));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/brand/crustea-logo.png" alt="Crustea" width={24} height={32} className="h-8 w-auto" />
            <div>
              <p className="text-sm font-bold text-slate-900">Crustea</p>
              <p className="text-xs text-slate-500">Dashboard investor</p>
            </div>
          </div>
          <form action={leaveDashboard}>
            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Keluar
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Realisasi proyek</p>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{project.number}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{project.category || TYPE_LABEL[project.type]}</span>
            <span className={`rounded-full px-2 py-0.5 ${STAGE_STYLE[project.stage]}`}>{STAGE_LABEL[project.stage]}</span>
            {project.location && <span>{project.location}</span>}
          </div>
          <p className="text-sm text-slate-600">
            Untuk: <span className="font-medium text-slate-800">{label}</span>
            {project.investor_capital > 0 && (
              <>
                {" "}
                · Total modal investor {rp(project.investor_capital)} ({project.investor_count} investor)
              </>
            )}
            {project.contract_signed_on && <> · Kontrak {formatDate(project.contract_signed_on)}</>}
          </p>
          <AutoRefresh seconds={60} loadedAt={res.data.updatedAt} />
        </div>

        <SummaryCards budget={budget} profit={profit} />
        <BudgetSection report={budget} />
        <ProfitSection report={profit} showShares />
        <StockSection balances={balances} />
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Jurnal transaksi</h2>
          <JournalTable transactions={ledger.transactions} lineNames={lineNames} fileName={`Jurnal-${project.number}.xlsx`} />
        </section>
        <p className="pb-6 text-center text-xs text-slate-400">
          Data dicatat langsung oleh tim Crustea. Pertanyaan tentang angka di halaman ini dapat disampaikan ke PIC proyek.
        </p>
      </main>
    </div>
  );
}
