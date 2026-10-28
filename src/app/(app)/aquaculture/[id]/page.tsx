import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber, todayJakarta } from "@/lib/format";
import { canReviewRequests, statusLabel, STATUS_STYLE, type RequestStatus } from "@/lib/requests";
import {
  AQUA_STAGES,
  DEFAULT_ALLOCATION,
  PROJECT_COLUMNS,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_STYLE,
  TYPE_LABEL,
  computeRab,
  isAquaEditor,
  isAquaManager,
  stageRank,
  type AquaProject,
  type AquaStage,
  type RabData,
} from "@/lib/aquaculture";
import { DeleteProjectButton, IncomeForm, NoteForm, StagePanel } from "./ProjectPanels";

export const metadata: Metadata = { title: "Proyek Aquaculture - Crustea Portal" };

const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;
const pct = (n: number | null) => (n === null ? "-" : `${formatNumber(Math.round(n * 1000) / 10)}%`);

type ProjectEvent = {
  id: number;
  action: "create" | "edit" | "stage" | "plan" | "note" | "report" | "income";
  from_stage: AquaStage | null;
  to_stage: AquaStage | null;
  note: string | null;
  link: string | null;
  month: string | null;
  amount: number | null;
  created_at: string;
  actor: { full_name: string } | null;
};

const monthLabel = (d: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));

function describe(e: ProjectEvent): string {
  switch (e.action) {
    case "create":
      return "Mencatat peluang proyek";
    case "edit":
      return "Mengubah data peluang";
    case "stage":
      return e.from_stage === e.to_stage ? "Memperbarui form kontrak" : `Mengubah tahap menjadi ${e.to_stage ? STAGE_LABEL[e.to_stage] : "-"}`;
    case "plan":
      return `Paket kelayakan & RAB${e.to_stage && e.to_stage !== e.from_stage ? ` · tahap ${STAGE_LABEL[e.to_stage]}` : ""}`;
    case "note":
      return "Memberi catatan";
    case "report":
      return `Laporan bulanan ${e.month ? monthLabel(e.month) : ""}`;
    case "income":
      return `Mencatat dana masuk ${rp(e.amount ?? 0)}`;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function Num({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`tabular-nums ${strong ? "font-bold text-brand-800" : "font-semibold text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [projectRes, eventRes, incomeRes, labelRes] = await Promise.all([
    supabase.from("aqua_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("aqua_project_events")
      .select("id, action, from_stage, to_stage, note, link, month, amount, created_at, actor:employees!aqua_project_events_actor_fkey(full_name)")
      .eq("project_id", id)
      .order("created_at"),
    supabase.from("revenues").select("id, revenue_date, amount, allocation, description").eq("aqua_project_id", id).order("revenue_date"),
    supabase.from("target_sources").select("alloc_label, division"),
  ]);
  const p = projectRes.data as unknown as AquaProject | null;
  if (!p) notFound();
  const events = (eventRes.data ?? []) as unknown as ProjectEvent[];
  const incomes = (incomeRes.data ?? []) as { id: string; revenue_date: string; amount: number; allocation: string | null; description: string }[];
  const incomeTotal = incomes.reduce((s, r) => s + r.amount, 0);

  const plan = p.plan_id
    ? ((await supabase.from("requests").select("id, number, title, status, amount, data").eq("id", p.plan_id).maybeSingle()).data as {
        id: string;
        number: string;
        title: string;
        status: RequestStatus;
        amount: number;
        data: RabData;
      } | null)
    : null;
  const calc = plan ? computeRab(plan.data) : null;

  // Label alokasi target: divisi Aquaculture dulu, lalu label lain.
  const sources = (labelRes.data ?? []) as { alloc_label: string; division: string }[];
  const labels = [
    ...new Set([
      DEFAULT_ALLOCATION,
      ...sources.filter((s) => s.division === "Aquaculture").map((s) => s.alloc_label),
      ...sources.map((s) => s.alloc_label),
    ]),
  ];

  const editor = isAquaEditor(me);
  const manager = isAquaManager(me);
  const rank = stageRank(p.stage);
  const steps = AQUA_STAGES.filter((s) => s !== "harvest" || p.type === "aquagrowth" || p.type === "mini_ras");
  const canMakePlan = editor && (p.stage === "opportunity" || p.stage === "plan") && (!plan || plan.status === "rejected");
  const planEditable = editor && plan !== null && (plan.status === "draft" || plan.status === "needs_revision");
  const today = todayJakarta();
  const contracted = rank >= stageRank("signed") && p.stage !== "cancelled";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{p.number}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{TYPE_LABEL[p.type]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_STYLE[p.stage]}`}>{STAGE_LABEL[p.stage]}</span>
          <span>· sejak {formatDate(p.stage_since.slice(0, 10))}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{p.name}</h1>
        <p className="text-2xl font-bold text-brand-800">{rp(p.contract_value ?? p.estimated_value)}</p>
        <p className="-mt-1 text-xs text-slate-500">{p.contract_value !== null ? "Nilai kontrak" : "Perkiraan nilai"}</p>
        {STAGE_HINT[p.stage] && <p className="text-sm text-slate-600">{STAGE_HINT[p.stage]}</p>}
      </div>

      {p.stage === "cancelled" && p.cancel_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">Alasan batal:</p>
          <p className="whitespace-pre-wrap">{p.cancel_reason}</p>
        </div>
      )}

      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Tahap proyek">
        {steps.map((s) => (
          <li
            key={s}
            title={STAGE_LABEL[s]}
            className={`h-2 min-w-6 flex-1 rounded-full ${p.stage !== "cancelled" && stageRank(s) <= rank ? "bg-brand-600" : "bg-slate-200"}`}
          />
        ))}
      </ol>

      {editor && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/aquaculture/${p.id}/ubah`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ubah data peluang
          </Link>
          {manager && p.stage === "opportunity" && !p.plan_id && <DeleteProjectButton id={p.id} />}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Data peluang</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Lokasi">{p.location || "-"}</Field>
          <Field label="Mitra / investor / peserta">{p.partner || "-"}</Field>
          <Field label="Kontak">{p.contact || "-"}</Field>
          <Field label="Asal peluang">{p.source || "-"}</Field>
          <Field label="Perkiraan nilai">{rp(p.estimated_value)}</Field>
          <Field label="Perkiraan mulai">{formatDate(p.estimated_start)}</Field>
          <Field label="PIC proyek">{p.pic?.full_name ?? "-"}</Field>
          <Field label="Dicatat">{formatDate(p.created_at.slice(0, 10))}</Field>
        </dl>
        {p.description && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{p.description}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Kelayakan finansial & RAB</h2>
          {plan && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[plan.status]}`}>
              {statusLabel(plan.status, "aqua_plan")}
            </span>
          )}
        </div>
        {plan && calc ? (
          <>
            <p className="text-sm text-slate-600">
              <span className="font-mono font-semibold text-slate-800">{plan.number}</span> · {plan.title}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Num label="Total modal (A+B+C)" value={rp(calc.capital)} strong />
              <Num label="Pendapatan / siklus" value={rp(calc.revenue)} />
              <Num label="Laba bersih / siklus" value={rp(calc.netProfit)} />
              <Num label="Margin bersih" value={pct(calc.netMargin)} />
              <Num label="ROI / tahun" value={pct(calc.roiYear)} />
              <Num
                label="Payback"
                value={calc.paybackYears === null ? "-" : `${formatNumber(Math.round(calc.paybackYears * 10) / 10)} tahun`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/aquaculture/${p.id}/rab`}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  planEditable ? "bg-brand-700 text-white hover:bg-brand-800" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {planEditable ? (plan.status === "draft" ? "Lengkapi & kirim ke F&A" : "Perbaiki & kirim ulang") : "Lihat RAB lengkap"}
              </Link>
              <Link
                href={`/pengajuan/${plan.id}`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Review & riwayat paket
              </Link>
              {canMakePlan && (
                <Link
                  href={`/aquaculture/${p.id}/rab?baru=1`}
                  className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
                >
                  Susun paket baru
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Belum ada paket. Paket berisi RAB (Capex, modal kerja, opex, proyeksi pendapatan) dan analisis kelayakan
              finansial; direview F&A lalu disetujui CEO.
            </p>
            {canMakePlan && (
              <Link
                href={`/aquaculture/${p.id}/rab?baru=1`}
                className="self-start rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Susun kelayakan & RAB
              </Link>
            )}
          </>
        )}
      </section>

      {(rank >= stageRank("contract") || p.investors.length > 0) && p.stage !== "cancelled" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Kontrak</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nomor kontrak">{p.contract_number || "-"}</Field>
            <Field label="Ditandatangani">{formatDate(p.contract_signed_on)}</Field>
            <Field label="Nilai kontrak">{p.contract_value !== null ? rp(p.contract_value) : "-"}</Field>
          </dl>
          {p.type === "aquagrowth" && p.investors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">Investor</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Modal</th>
                    <th className="py-1.5 text-right font-medium">Persentase</th>
                  </tr>
                </thead>
                <tbody>
                  {p.investors.map((inv, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2">{inv.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{rp(inv.capital)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(inv.percent)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {contracted && (
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Dana masuk</h2>
            <p className="text-sm">
              Total <span className="font-bold tabular-nums text-brand-800">{rp(incomeTotal)}</span>
            </p>
          </div>
          {incomes.length > 0 ? (
            <ul className="flex flex-col divide-y divide-slate-100 text-sm">
              {incomes.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    {formatDate(r.revenue_date)} · <span className="text-slate-500">{r.allocation ?? "Tanpa alokasi"}</span>
                    <span className="block text-xs text-slate-500">{r.description}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{rp(r.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Belum ada dana masuk tercatat.</p>
          )}
          <p className="text-xs text-slate-500">
            Masuk otomatis ke realisasi{" "}
            <Link href="/kpi/target?divisi=Aquaculture" className="font-medium text-brand-700 hover:underline">
              Target kuartal
            </Link>{" "}
            pada bulan dana diterima. Salah catat: hapus/ubah di halaman Target kuartal (bagian pendapatan).
          </p>
          {(canReviewRequests(me) || me.app_role === "ceo") && (
            <IncomeForm id={p.id} today={today} labels={labels} defaultLabel={DEFAULT_ALLOCATION} />
          )}
        </section>
      )}

      <StagePanel
        key={p.stage}
        id={p.id}
        type={p.type}
        stage={p.stage}
        today={today}
        editor={editor}
        manager={manager}
        legal={me.dept_code === "CA" || me.app_role === "admin"}
        investors={p.investors}
        contractNumber={p.contract_number}
      />

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat & laporan</h2>
        <ol className="flex flex-col">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span
                className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${
                  e.action === "report" ? "bg-logo-leaf" : e.action === "note" ? "bg-logo-lime" : "bg-brand-600"
                }`}
              />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{e.actor?.full_name ?? "Sistem"}</span> · {describe(e)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
              {e.link && (
                <a href={e.link} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
                  Buka laporan ↗
                </a>
              )}
              {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>}
            </li>
          ))}
        </ol>
        <NoteForm
          id={p.id}
          canReport={editor && ["execution", "harvest", "completed"].includes(p.stage)}
          thisMonth={today.slice(0, 7)}
        />
      </section>

      <Link href={`/aquaculture?jenis=${p.type}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Project Management
      </Link>
    </main>
  );
}
