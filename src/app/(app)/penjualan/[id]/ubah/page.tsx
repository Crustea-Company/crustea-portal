import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { LEAD_COLUMNS, WON_RANK, canEditLead, stageRank, toLead } from "@/lib/sales";
import { loadLeadFormProps } from "@/lib/sales-data";
import LeadForm from "../../LeadForm";

export const metadata: Metadata = { title: "Ubah Lead - Crustea Portal" };

export default async function LeadUbahPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [leadRes, props] = await Promise.all([
    supabase.from("sales_leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle(),
    loadLeadFormProps(supabase),
  ]);
  if (!leadRes.data) notFound();
  const lead = toLead(leadRes.data as Record<string, unknown>);
  if (!canEditLead(me, lead)) redirect(`/penjualan/${id}`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan · {lead.number}</p>
        <h1 className="text-2xl font-bold text-slate-900">Ubah data lead</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <LeadForm
          meId={me.id}
          today={todayJakarta()}
          {...props}
          initial={{
            id: lead.id,
            locked: lead.stage !== "lost" && stageRank(lead.stage) >= WON_RANK,
            input: {
              lead_date: lead.lead_date,
              source: lead.source,
              referral_code: lead.referral_code ?? "",
              customer: lead.customer,
              contact: lead.contact ?? "",
              location: lead.location ?? "",
              product_code: lead.product_code ?? "",
              units: lead.units,
              value: lead.value,
              sales_id: lead.sales_id,
              notes: lead.notes ?? "",
            },
          }}
        />
      </div>
      <Link href={`/penjualan/${lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Kembali ke lead
      </Link>
    </main>
  );
}
