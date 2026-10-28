import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_STYLE, statusLabel, type RequestStatus } from "@/lib/requests";
import { PROJECT_COLUMNS, TYPE_LABEL, emptyRab, isAquaEditor, type AquaProject, type RabData } from "@/lib/aquaculture";
import RabEditor from "./RabEditor";

export const metadata: Metadata = { title: "Kelayakan & RAB - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Isi lama yang belum punya bagian tertentu tetap bisa dibuka.
function withDefaults(base: RabData, data: Partial<RabData>): RabData {
  return {
    ...base,
    ...data,
    general: { ...base.general, ...data.general },
    commodity: { ...base.commodity, ...data.commodity },
    params: { ...base.params, ...data.params },
    capex: data.capex ?? [],
    workcap: data.workcap ?? [],
    opex: data.opex ?? [],
    revenue: data.revenue ?? [],
    timeline: data.timeline ?? [],
    summary: data.summary ?? "",
  };
}

export default async function RabPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const fresh = (await searchParams).baru === "1";
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const { data } = await supabase.from("aqua_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  const p = data as unknown as AquaProject | null;
  if (!p) notFound();

  const plan = p.plan_id
    ? ((await supabase.from("requests").select("id, number, title, status, requester_id, data").eq("id", p.plan_id).maybeSingle()).data as {
        id: string;
        number: string;
        title: string;
        status: RequestStatus;
        requester_id: string;
        data: Partial<RabData>;
      } | null)
    : null;

  const editor = isAquaEditor(me);
  const base = emptyRab(p.id, p.type, p.name, p.location ?? "");
  // Paket baru: belum ada paket, atau paket lama ditolak.
  const makeNew = editor && (p.stage === "opportunity" || p.stage === "plan") && (!plan || plan.status === "rejected");
  const useNew = makeNew && (fresh || !plan);
  const editable = useNew || (editor && plan !== null && (plan.status === "draft" || plan.status === "needs_revision"));

  if (!useNew && !plan) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Proyek ini belum punya paket kelayakan & RAB.
        </p>
        <Link href={`/aquaculture/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Kembali ke proyek
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">
          Aquaculture · {p.number} · {TYPE_LABEL[p.type]}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Kelayakan finansial & RAB</h1>
        <p className="mt-1 text-sm text-slate-600">{p.name}</p>
        {!useNew && plan && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-mono font-semibold text-slate-800">{plan.number}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[plan.status]}`}>
              {statusLabel(plan.status, "aqua_plan")}
            </span>
            <Link href={`/pengajuan/${plan.id}`} className="font-medium text-brand-700 hover:underline">
              Review & riwayat →
            </Link>
          </p>
        )}
        {editable && (
          <p className="mt-2 text-sm text-slate-600">
            Isi seperti template Excel RAB: semua total, laba rugi, BEP, payback, ROI investor, dan skenario dihitung
            otomatis. Simpan draf kapan saja, lalu kirim ke F&A. Setelah diterima F&A, paket otomatis menunggu persetujuan CEO.
          </p>
        )}
      </div>
      <RabEditor
        projectId={p.id}
        planId={useNew ? null : (plan?.id ?? null)}
        initialTitle={useNew ? `Kelayakan & RAB ${p.name}` : plan!.title}
        initial={useNew ? base : withDefaults(base, plan!.data)}
        readOnly={!editable}
        canSubmit={useNew || plan?.requester_id === me.id}
        isAquagrowth={p.type === "aquagrowth"}
        submitLabel={!useNew && plan?.status === "needs_revision" ? "Kirim ulang ke F&A" : "Kirim ke F&A"}
      />
      <Link href={`/aquaculture/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Kembali ke proyek
      </Link>
    </main>
  );
}
