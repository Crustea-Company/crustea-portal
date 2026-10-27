import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber, todayJakarta } from "@/lib/format";
import { canReviewRequests, isTechOps, statusLabel, type RequestStatus } from "@/lib/requests";
import {
  LEAD_COLUMNS,
  LEAD_SOURCES,
  LEAD_STAGES,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_STYLE,
  WON_RANK,
  canEditLead,
  commissionOwner,
  daysSince,
  isSalesManager,
  stageRank,
  toLead,
  type LeadEvent,
} from "@/lib/sales";
import { loadLeadClaims } from "@/lib/sales-data";
import { LeadNoteForm, StagePanel } from "./StagePanel";

export const metadata: Metadata = { title: "Detail Lead - Crustea Portal" };

const rp = (n: number) => `Rp${formatNumber(n)}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function describe(e: LeadEvent): string {
  switch (e.action) {
    case "create":
      return "Mencatat lead";
    case "stage":
      return `Mengubah tahap menjadi ${e.to_stage ? STAGE_LABEL[e.to_stage] : "-"}`;
    case "note":
      return "Memberi catatan";
    case "complaint":
      return "Mencatat keluhan customer";
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [leadRes, eventRes, productRes] = await Promise.all([
    supabase.from("sales_leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("sales_lead_events")
      .select("id, action, from_stage, to_stage, note, created_at, actor:employees!sales_lead_events_actor_fkey(full_name)")
      .eq("lead_id", id)
      .order("created_at"),
    supabase.from("products").select("code, name, valid_from").order("valid_from"),
  ]);
  if (!leadRes.data) notFound();
  const lead = toLead(leadRes.data as Record<string, unknown>);
  const events = (eventRes.data ?? []) as unknown as LeadEvent[];
  const productName = new Map(((productRes.data ?? []) as { code: string; name: string }[]).map((p) => [p.code, p.name]));
  const claims = await loadLeadClaims(supabase, [lead.id]);

  const manager = isSalesManager(me);
  const own = lead.sales_id === me.id || manager;
  const closed = lead.stage !== "lost" && stageRank(lead.stage) >= WON_RANK;
  const canClaim = closed && claims.length === 0 && commissionOwner(lead) === me.id;
  const complaints = events.filter((e) => e.action === "complaint");
  const rank = stageRank(lead.stage);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{lead.number}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_STYLE[lead.stage]}`}>{STAGE_LABEL[lead.stage]}</span>
          <span>· {daysSince(lead.stage_since)} hari di tahap ini</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{lead.customer}</h1>
        <p className="text-2xl font-bold text-brand-800">{rp(lead.value)}</p>
        {STAGE_HINT[lead.stage] && <p className="text-sm text-slate-600">{STAGE_HINT[lead.stage]}</p>}
      </div>

      {lead.stage === "lost" && lead.lost_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">Alasan gagal:</p>
          <p className="whitespace-pre-wrap">{lead.lost_reason}</p>
        </div>
      )}

      {/* Langkah pipeline */}
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {LEAD_STAGES.map((s, i) => (
          <li
            key={s}
            title={STAGE_LABEL[s]}
            className={`h-2 min-w-6 flex-1 rounded-full ${lead.stage !== "lost" && i <= rank ? "bg-brand-600" : "bg-slate-200"}`}
          />
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {canEditLead(me, lead) && (
          <Link href={`/penjualan/${lead.id}/ubah`} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Ubah data
          </Link>
        )}
        {canClaim && (
          <Link href={`/pengajuan/komisi/baru?lead=${lead.id}`} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
            Buat klaim komisi
          </Link>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tanggal lead masuk">{formatDate(lead.lead_date)}</Field>
          <Field label="Sumber">{LEAD_SOURCES[lead.source]}</Field>
          <Field label="Kode referral (asal lead)">
            {lead.referral_code ? `${lead.referral_code} · ${lead.referral?.full_name ?? "-"}` : "Tanpa kode referral"}
          </Field>
          <Field label="PIC sales">{lead.sales?.full_name ?? "-"}</Field>
          <Field label="Kontak">{lead.contact || "-"}</Field>
          <Field label="Lokasi">{lead.location || "-"}</Field>
          <Field label="Produk">{lead.product_code ? productName.get(lead.product_code) ?? lead.product_code : "Belum dipilih"}</Field>
          <Field label="Jumlah unit">{formatNumber(lead.units)}</Field>
          {lead.so_number && <Field label="No. Sales Order / invoice">{lead.so_number}</Field>}
          {lead.closed_on && <Field label="Tanggal closing">{formatDate(lead.closed_on)}</Field>}
          {closed && (
            <Field label="Pelunasan">
              {lead.paid_on ? (
                <span className="font-semibold text-brand-800">Lunas {formatDate(lead.paid_on)}</span>
              ) : (
                <span className="font-semibold text-orange-800">Belum lunas</span>
              )}
            </Field>
          )}
          {lead.installed_on && <Field label="Instalasi & BAST">{formatDate(lead.installed_on)}</Field>}
          {closed && (
            <Field label="Klaim komisi">
              {claims.length
                ? claims.map((c) => `${c.number} · ${statusLabel(c.status as RequestStatus, "commission")} · ${c.requester_name}`).join("\n")
                : "Belum diklaim"}
            </Field>
          )}
        </dl>
        {lead.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{lead.notes}</p>}
      </section>

      {complaints.length > 0 && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <h2 className="mb-2 font-semibold text-orange-900">Log keluhan ({complaints.length})</h2>
          <ul className="flex flex-col gap-2 text-sm text-orange-900">
            {complaints.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{formatDateTime(c.created_at)}</span> · {c.actor?.full_name ?? "-"}: {c.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <StagePanel
        key={lead.stage}
        id={lead.id}
        stage={lead.stage}
        today={todayJakarta()}
        own={own}
        manager={manager}
        finance={canReviewRequests(me)}
        techops={isTechOps(me)}
      />

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat</h2>
        <ol className="flex flex-col">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span
                className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${
                  e.action === "complaint" ? "bg-orange-500" : e.action === "note" ? "bg-logo-lime" : "bg-brand-600"
                }`}
              />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{e.actor?.full_name ?? "Sistem"}</span> · {describe(e)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
              {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>}
            </li>
          ))}
        </ol>
        <LeadNoteForm id={lead.id} />
      </section>

      <Link href="/penjualan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pipeline penjualan
      </Link>
    </main>
  );
}
