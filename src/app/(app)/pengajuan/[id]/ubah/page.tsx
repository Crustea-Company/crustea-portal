import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { PaymentData, ProcurementData, ReimburseData, RequestFile } from "@/lib/requests";
import type { AttachmentItem } from "@/components/requests/FileOrLinkInput";
import ReimburseForm from "../../reimburse/ReimburseForm";
import PaymentForm from "../../pembayaran/PaymentForm";
import TravelForm from "../../dinas/TravelForm";
import ProcurementForm from "../../pengadaan/ProcurementForm";
import { loadTravelFormProps } from "@/lib/travel-data";
import type { TravelData } from "@/lib/travel";
import CommissionForm from "../../komisi/CommissionForm";
import { loadCommissionFormProps } from "@/lib/commission-data";
import { loadClaimableLeads } from "@/lib/sales-data";
import type { CommissionData } from "@/lib/commission";

export const metadata: Metadata = { title: "Ubah Pengajuan - Crustea Portal" };

type Params = Promise<{ id: string }>;

// Ubah pengajuan milik sendiri yang berstatus Draf / Perlu perbaikan, lalu kirim ulang.
export default async function UbahPengajuanPage({ params }: { params: Params }) {
  const me = (await getCurrentEmployee())!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [reqRes, fileRes] = await Promise.all([
    supabase.from("requests").select("id, kind, requester_id, assigner_id, title, amount, status, data").eq("id", id).maybeSingle(),
    supabase
      .from("request_files")
      .select("id, kind, purpose, path, url, name, size_bytes")
      .eq("request_id", id)
      .eq("purpose", "proof")
      .order("created_at"),
  ]);
  const req = reqRes.data;
  if (!req) notFound();
  if (req.requester_id !== me.id || !["draft", "needs_revision"].includes(req.status) || !["reimburse", "payment", "travel", "procurement", "commission"].includes(req.kind)) {
    redirect(`/pengajuan/${id}`);
  }

  const attachments: AttachmentItem[] = ((fileRes.data ?? []) as RequestFile[]).map((f) =>
    f.kind === "file"
      ? { key: f.id, kind: "file", id: f.id, path: f.path ?? "", name: f.name, size_bytes: f.size_bytes ?? 0 }
      : { key: f.id, kind: "link", id: f.id, url: f.url ?? "", name: f.name },
  );

  const travelProps = req.kind === "travel" ? await loadTravelFormProps(supabase, me.id, todayJakarta()) : null;
  const travel = req.data as TravelData;
  const procurement = req.data as ProcurementData;
  const commissionProps =
    req.kind === "commission"
      ? { ...(await loadCommissionFormProps(supabase, me.id)), leads: await loadClaimableLeads(supabase, me.id, req.id as string) }
      : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">
          {req.kind === "payment"
            ? "Perbaiki permintaan pembayaran"
            : req.kind === "travel"
              ? "Perbaiki penugasan dinas"
              : req.kind === "procurement"
                ? "Perbaiki permohonan pengadaan"
              : req.kind === "commission"
                ? "Perbaiki klaim komisi"
              : "Perbaiki klaim reimburse"}
        </h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {travelProps ? (
          <TravelForm
            meId={me.id}
            fullName={me.full_name}
            {...travelProps}
            initial={{
              id: req.id as string,
              input: {
                assigner_id: (req.assigner_id as string | null) ?? "",
                destination: travel.destination,
                target: travel.target,
                depart_date: travel.depart_date,
                return_date: travel.return_date,
                distance_km: travel.distance_km,
                province_factor: travel.province_factor,
                ticket: travel.ticket,
                private_km: travel.private_km,
                representation: travel.representation,
                advance: travel.advance,
                emergency_reason: travel.emergency_reason,
              },
            }}
          />
        ) : commissionProps ? (
          <CommissionForm
            fullName={me.full_name}
            today={todayJakarta()}
            {...commissionProps}
            initial={{
              id: req.id as string,
              lines: ((req.data as CommissionData).lines ?? []).map((l) => ({
                customer: l.customer,
                invoice: l.invoice,
                closing_date: l.closing_date,
                product_code: l.product_code,
                units: l.units,
                sales_total: l.sales_total,
                justification: l.justification,
                referral_code: l.referral_code ?? "",
                lead_id: l.lead_id ?? null,
              })),
            }}
          />
        ) : req.kind === "procurement" ? (
          <ProcurementForm
            employeeId={me.id}
            fullName={me.full_name}
            deptCode={me.dept_code}
            today={todayJakarta()}
            initial={{
              id: req.id as string,
              input: {
                title: req.title as string,
                specification: procurement.specification,
                quantity: procurement.quantity,
                unit: procurement.unit,
                estimate: procurement.estimate,
                budgeted: procurement.budgeted,
                needed_date: procurement.needed_date,
              },
              attachments,
            }}
          />
        ) : req.kind === "payment" ? (
          <PaymentForm
            employeeId={me.id}
            fullName={me.full_name}
            initial={{
              id: req.id as string,
              input: { ...(req.data as PaymentData), amount: Number(req.amount) },
              attachments,
            }}
          />
        ) : (
          <ReimburseForm
            employeeId={me.id}
            fullName={me.full_name}
            today={todayJakarta()}
            initial={{
              id: req.id as string,
              input: { ...(req.data as ReimburseData), description: req.title as string, amount: Number(req.amount) },
              attachments,
            }}
          />
        )}
      </div>
      <Link href={`/pengajuan/${id}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Kembali ke detail
      </Link>
    </main>
  );
}
