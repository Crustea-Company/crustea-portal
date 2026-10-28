import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  BUCKET,
  KIND_LABEL,
  PAYMENT_CONTRACT,
  PAYMENT_PRIORITIES,
  REQUEST_COLUMNS,
  canApproveAsCeo,
  canReviewRequests,
  isFaHead,
  isProcurementHead,
  isTechOps,
  isUrgent,
  type PaymentData,
  type ProcurementData,
  type ReimburseData,
  type RequestFile,
  type RequestRow,
} from "@/lib/requests";
import RequestStatusBadge, { SlaLabel } from "@/components/requests/RequestStatusBadge";
import RequestTimeline, { type RequestEvent } from "@/components/requests/RequestTimeline";
import RequestFileList, { type ViewFile } from "@/components/requests/RequestFileList";
import { DeleteDraftButton, NoteForm, ReviewPanel, TravelReportForm, type ReviewMode } from "./ReviewPanel";
import { LOCAL_ZONE_NOTE, ZONE_LABEL, type TravelData } from "@/lib/travel";
import type { AttachmentItem } from "@/components/requests/FileOrLinkInput";
import { ChooseVendorForm, VendorCompareForm } from "./ProcurementPanels";
import { formatPct, type CommissionData } from "@/lib/commission";
import { isAquaEditor, type RabData } from "@/lib/aquaculture";
import AquaPlanDetails from "./AquaPlanDetails";

export const metadata: Metadata = { title: "Detail Pengajuan - Crustea Portal" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function ReimburseDetails({ data }: { data: ReimburseData }) {
  const categories = [...data.categories, ...(data.category_other ? [`Lainnya: ${data.category_other}`] : [])];
  return (
    <>
      <Field label="Tanggal transaksi">{formatDate(data.transaction_date)}</Field>
      <Field label="Kategori transaksi">{categories.join(", ") || "-"}</Field>
    </>
  );
}

function PaymentDetails({ data }: { data: PaymentData }) {
  return (
    <>
      <Field label="Prioritas">
        <span className={data.priority === "urgent" ? "font-semibold text-red-700" : ""}>
          {PAYMENT_PRIORITIES[data.priority] ?? data.priority}
        </span>
      </Field>
      <Field label="Tanggal pembayaran">{formatDate(data.payment_date)}</Field>
      <Field label="Metode pembayaran">{data.method}</Field>
      <Field label="Vendor / penerima">{data.vendor}</Field>
      <Field label="Nomor rekening / VA / QRIS">{data.account}</Field>
      <Field label="Terkait kontrak">{data.contract.map((c) => PAYMENT_CONTRACT[c] ?? c).join(", ")}</Field>
      <div className="sm:col-span-2">
        <Field label="Tujuan pembayaran">{data.purpose}</Field>
      </div>
    </>
  );
}

const rp = (n: number) => `Rp${formatNumber(n)}`;

function TravelDetails({ data, stNumber }: { data: TravelData; stNumber: string | null }) {
  return (
    <>
      <Field label="Ditugaskan oleh">
        {data.assigner_name}
        {data.assigner_title ? ` (${data.assigner_title})` : ""}
      </Field>
      <Field label="Golongan jabatan">{data.grade_label}</Field>
      <Field label="Tujuan / lokasi">{data.destination}</Field>
      <Field label="No. surat tugas">{stNumber ?? "Belum terbit"}</Field>
      <Field label="Berangkat – kembali">
        {formatDate(data.depart_date)} – {formatDate(data.return_date)} ({data.calc.days} hari)
      </Field>
      <Field label="Tanggal form">{formatDate(data.form_date)}</Field>
      <Field label="Memenuhi tenggat?">
        {data.calc.meets_notice ? (
          `Ya (${data.calc.notice_days} hari kerja sebelum berangkat)`
        ) : (
          <span className="text-orange-800">
            Tidak ({data.calc.notice_days} hari kerja). Alasan darurat: {data.emergency_reason}
          </span>
        )}
      </Field>
      <Field label="Uang muka diminta?">{data.advance ? "Ya" : "Tidak"}</Field>
      <Field label="Batas FPTD & laporan misi">{formatDate(data.calc.report_due)}</Field>
      <div className="sm:col-span-2">
        <Field label="Target tugas">{data.target}</Field>
      </div>
    </>
  );
}

function TravelCalcDetails({ data }: { data: TravelData }) {
  const c = data.calc;
  const pct = `${Math.round(c.factor * 100)}%`;
  const rows: [string, number][] = [
    [`Uang harian (${rp(data.rate.daily)} × ${pct} × ${c.days} hari)`, c.daily_total],
    [`Hotel (${rp(data.rate.hotel)} × ${c.nights} malam)`, c.hotel],
    [`Transport lokal (${rp(data.rate.local_transport)} × ${c.days} hari)`, c.local_transport],
    ["Tiket pesawat/kereta/bus", c.ticket],
    [`Kendaraan pribadi (${formatNumber(data.private_km)} km)`, c.private_vehicle],
    ["Representasi", c.representation],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Perhitungan estimasi</h2>
      <p className="mb-3 text-slate-600">
        Jarak {formatNumber(data.distance_km)} km · zona {ZONE_LABEL[c.zone]} · faktor uang harian {pct}
      </p>
      <dl className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-slate-600">{label}</dt>
            <dd className="text-right tabular-nums">{rp(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-bold text-slate-900">
          <dt>Total estimasi</dt>
          <dd className="tabular-nums">{rp(c.total)}</dd>
        </div>
      </dl>
      {c.zone === "local" && <p className="mt-2 text-slate-600">{LOCAL_ZONE_NOTE}</p>}
    </section>
  );
}

function ProcurementDetails({ data }: { data: ProcurementData }) {
  const vendor = data.selected !== undefined ? data.vendors?.[data.selected] : undefined;
  return (
    <>
      <Field label="Jumlah">
        {formatNumber(data.quantity)} {data.unit}
      </Field>
      <Field label="Tanggal dibutuhkan">{formatDate(data.needed_date)}</Field>
      <Field label="Estimasi harga (PR)">{rp(data.estimate)}</Field>
      <Field label="Sudah dianggarkan?">{data.budgeted ? "Sudah" : "Belum"}</Field>
      {vendor && <Field label="Vendor terpilih">{vendor.name}</Field>}
      {data.method && <Field label="Metode pengadaan">{data.method}</Field>}
      {data.po_number && <Field label="No. PO">{data.po_number}</Field>}
      <div className="sm:col-span-2">
        <Field label="Spesifikasi">{data.specification}</Field>
      </div>
    </>
  );
}

function VendorTable({ data }: { data: ProcurementData }) {
  if (!data.vendors?.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Perbandingan vendor (TechOps)</h2>
      <div className="flex flex-col gap-3">
        {data.vendors.map((v, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 text-sm ${i === data.selected ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {v.name}
                {v.avl && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">AVL</span>}
                {i === data.recommended && (
                  <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">Rekomendasi</span>
                )}
                {i === data.selected && (
                  <span className="ml-2 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">Dipilih</span>
                )}
              </p>
              <p className="font-bold tabular-nums text-slate-900">{rp(v.price)}</p>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {v.spec && <Field label="Spesifikasi">{v.spec}</Field>}
              {v.lead_time && <Field label="Lead time">{v.lead_time}</Field>}
              {v.warranty && <Field label="Garansi">{v.warranty}</Field>}
              {v.pros && <Field label="Kelebihan">{v.pros}</Field>}
              {v.cons && <Field label="Kekurangan">{v.cons}</Field>}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommissionLines({ data, leadPaid }: { data: CommissionData; leadPaid: Map<string, string | null> }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Rincian penjualan</h2>
      <p className="mb-3 text-sm text-slate-600">
        Penjualan lunas:{" "}
        {data.sales_paid ? (
          <span className="font-semibold text-brand-800">
            Sudah dikonfirmasi F&A{data.sales_paid_at ? ` (${formatDate(data.sales_paid_at.slice(0, 10))})` : ""}
          </span>
        ) : (
          <span className="font-semibold text-orange-800">Belum dikonfirmasi</span>
        )}
      </p>
      <div className="flex flex-col gap-3">
        {(data.lines ?? []).map((l, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{l.customer}</p>
                <p className="text-slate-600">
                  {l.product_name} · {formatNumber(l.units)} unit · closing {formatDate(l.closing_date)}
                </p>
              </div>
              <p className="font-bold tabular-nums text-slate-900">{rp(l.commission)}</p>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="No. Invoice / PO / Kontrak">{l.invoice}</Field>
              <Field label="Total penjualan">{rp(l.sales_total)}</Field>
              <Field label="HPP">
                {rp(l.hpp_unit)}/unit · total {rp(l.hpp_total)}
              </Field>
              <Field label="Profit × % komisi">
                <span className={l.no_profit ? "text-red-700" : ""}>
                  {l.profit < 0 ? "-" : ""}
                  {rp(Math.abs(l.profit))} × {formatPct(l.commission_pct)}
                </span>
              </Field>
              {l.lead_id && (
                <Field label="Dari modul Penjualan">
                  <Link href={`/penjualan/${l.lead_id}`} className="text-brand-700 hover:underline">
                    {l.lead_number ?? "Lihat lead"}
                  </Link>
                  {" · "}
                  {leadPaid.get(l.lead_id) ? (
                    <span className="font-semibold text-brand-800">lunas {formatDate(leadPaid.get(l.lead_id))}</span>
                  ) : (
                    <span className="font-semibold text-orange-800">belum lunas</span>
                  )}
                </Field>
              )}
              <Field label="Asal lead (kode referral)">
                {l.referral_code ? `${l.referral_code} · ${l.referral_name ?? "-"}` : "Tanpa kode referral"}
              </Field>
              <Field label="Justifikasi">
                {!l.justification ? (
                  "-"
                ) : (
                  <a href={l.justification} target="_blank" rel="noreferrer" className="break-all text-brand-700 hover:underline">
                    {l.justification}
                  </a>
                )}
              </Field>
            </dl>
            {(l.no_profit || l.below_min) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.no_profit && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Profit ≤ 0, komisi 0</span>
                )}
                {l.below_min && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    Di bawah harga minimal
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MissionDetails({ data }: { data: ReimburseData }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Mission report</h2>
      {data.mission ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kegiatan">{data.mission.activity}</Field>
          <Field label="Deskripsi kegiatan">{data.mission.description}</Field>
          <Field label="Hasil kegiatan">{data.mission.result}</Field>
          <Field label="Evaluasi dan rekomendasi">{data.mission.evaluation}</Field>
        </dl>
      ) : (
        <Field label="Tidak ada mission report. Alasan:">{data.no_mission_reason}</Field>
      )}
    </section>
  );
}

export default async function PengajuanDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  const { id } = await params;
  const sent = (await searchParams).terkirim === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [reqRes, eventRes, fileRes] = await Promise.all([
    supabase.from("requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("request_events")
      .select("id, action, from_status, to_status, note, at, actor:employees!request_events_actor_fkey(full_name)")
      .eq("request_id", id)
      .order("at")
      .order("id"),
    supabase
      .from("request_files")
      .select("id, kind, purpose, path, url, name, size_bytes")
      .eq("request_id", id)
      .order("created_at"),
  ]);

  // RLS: kalau tidak berhak melihat, pengajuan dianggap tidak ada.
  const req = reqRes.data as unknown as RequestRow | null;
  if (!req) notFound();

  // Link sementara (1 jam) untuk membuka file di Storage privat.
  const files = (fileRes.data ?? []) as RequestFile[];
  const paths = files.filter((f) => f.kind === "file" && f.path).map((f) => f.path as string);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  const viewFiles: ViewFile[] = files.map((f) => ({
    ...f,
    href: f.kind === "link" ? f.url : (signed.get(f.path ?? "") ?? null),
  }));
  const proofFiles = viewFiles.filter((f) => f.purpose === "proof");
  const reportFiles = viewFiles.filter((f) => f.purpose === "report");
  const transferFiles = viewFiles.filter((f) => f.purpose === "transfer");
  const documentFiles = viewFiles.filter((f) => f.purpose === "document");

  const isOwner = req.requester_id === me.id;
  const isReviewer = canReviewRequests(me) && (!isOwner || me.app_role === "admin");
  // Status "Menunggu CEO": CEO (atau admin) memutuskan; F&A hanya bisa memberi catatan.
  const isCeo = req.status === "ceo_review" && canApproveAsCeo(me) && (!isOwner || me.app_role === "admin");
  // Dinas: penugas menyetujui, HR/CA menerbitkan surat tugas, F&A memverifikasi.
  const travel = req.kind === "travel" ? (req.data as unknown as TravelData) : null;
  const isAssigner = req.assigner_id === me.id || me.app_role === "admin";
  const isHr = me.dept_code === "CA" || me.app_role === "admin";
  const notSelf = !isOwner || me.app_role === "admin";
  const procurement = req.kind === "procurement" ? (req.data as unknown as ProcurementData) : null;
  const isTo = isTechOps(me);
  const isProcHead = isProcurementHead(me, req.dept_code);
  let mode: ReviewMode | null = null;
  if (procurement) {
    const s = req.status;
    if (s === "submitted" && isProcHead && notSelf) mode = "head";
    else if (s === "head_approved" && isTo && notSelf) mode = "techops";
    else if ((s === "fa_verified" || s === "received") && isFaHead(me) && notSelf) mode = "fahead";
    else if (isCeo) mode = "ceo";
    else if ((s === "po_issued" || s === "returned") && (isTo || isOwner)) mode = "receiver";
    else if (isReviewer) mode = "fa";
    else if (s === "paid" && isTo && notSelf) mode = "techops";
    else if (!isOwner && (isTo || isProcHead)) mode = "viewer";
  } else if (travel) {
    if (req.status === "submitted" && isAssigner && (notSelf || me.app_role === "ceo")) mode = "assigner";
    else if (req.status === "assigner_approved" && isHr && notSelf) mode = "hr";
    else if (isReviewer) mode = "fa";
    else if (!isOwner && (isAssigner || isHr)) mode = "viewer";
  } else if (isCeo) mode = "ceo";
  else if (isReviewer) mode = "fa";
  const canNote =
    isReviewer ||
    (travel !== null && !isOwner && (isAssigner || isHr)) ||
    (procurement !== null && !isOwner && (isTo || isProcHead));
  const editable = isOwner && (req.status === "draft" || req.status === "needs_revision");
  const data = req.data as unknown as ReimburseData;
  const payment = req.data as unknown as PaymentData;
  const commission = req.kind === "commission" ? (req.data as unknown as CommissionData) : null;
  // Paket RAB Aquaculture: diubah di editor RAB oleh tim AQ; tim AQ, TechOps, DM boleh memberi catatan (review lintas tim).
  const aquaPlan = req.kind === "aqua_plan" ? (req.data as unknown as RabData) : null;
  const aquaEditable = aquaPlan !== null && isAquaEditor(me) && (req.status === "draft" || req.status === "needs_revision");
  const aquaNoter = aquaPlan !== null && (isAquaEditor(me) || me.dept_code === "TO" || me.dept_code === "DM");
  // Status lunas penjualan dari modul Penjualan (syarat diterima untuk baris dari lead).
  const leadIds = (commission?.lines ?? []).flatMap((l) => (l.lead_id ? [l.lead_id] : []));
  const leadPaid = new Map<string, string | null>();
  if (leadIds.length) {
    const { data: leadRows } = await supabase.from("sales_leads").select("id, paid_on").in("id", leadIds);
    for (const r of (leadRows ?? []) as { id: string; paid_on: string | null }[]) leadPaid.set(r.id, r.paid_on);
  }
  const manualSalesLines = (commission?.lines ?? []).some((l) => !l.lead_id);
  const lastRevisionNote =
    req.status === "needs_revision"
      ? [...((eventRes.data ?? []) as unknown as RequestEvent[])].reverse().find((e) => e.to_status === "needs_revision")?.note
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      {sent && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
          Pengajuan terkirim.{" "}
          {procurement
            ? "Head departemen Anda akan meninjau maksimal 1×24 jam"
            : `${travel ? "Penugas" : "F&A"} akan meninjau maksimal 2 hari kerja`}
          ; statusnya bisa dipantau di halaman ini.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{req.number}</span>
          <span>· {KIND_LABEL[req.kind]}</span>
          <RequestStatusBadge status={req.status} kind={req.kind} />
          {isUrgent(req) && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Segera</span>}
          <SlaLabel slaDue={req.sla_due} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{req.title}</h1>
        <p className="text-2xl font-bold text-brand-800">Rp{formatNumber(req.amount)}</p>
      </div>

      {lastRevisionNote && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <p className="font-semibold">Perlu perbaikan:</p>
          <p className="whitespace-pre-wrap">{lastRevisionNote}</p>
        </div>
      )}

      {editable && !aquaPlan && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/pengajuan/${req.id}/ubah`}
            className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            {req.status === "draft" ? "Lengkapi & kirim" : "Perbaiki & kirim ulang"}
          </Link>
          {req.status === "draft" && <DeleteDraftButton id={req.id} />}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pemohon">
            {req.requester?.full_name ?? "-"}
            {req.dept_code ? ` (${req.dept_code})` : ""}
          </Field>
          <Field label="Diajukan">{req.submitted_at ? formatDate(req.submitted_at.slice(0, 10)) : "Belum dikirim"}</Field>
          {req.kind === "reimburse" && <ReimburseDetails data={data} />}
          {req.kind === "payment" && <PaymentDetails data={payment} />}
          {travel && <TravelDetails data={travel} stNumber={req.st_number} />}
          {procurement && <ProcurementDetails data={procurement} />}
          {req.paid_on && (
            <Field label={travel ? "Tanggal uang muka dicairkan" : procurement ? "Tanggal bayar vendor" : "Tanggal transfer"}>
              {formatDate(req.paid_on)}
            </Field>
          )}
        </dl>
        {!travel && !commission && !aquaPlan && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              {req.kind === "payment" ? "Invoice / dokumen pendukung" : procurement ? "Lampiran PR" : "Bukti nota"}
            </p>
            <RequestFileList files={proofFiles} />
          </div>
        )}
        {documentFiles.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Dokumen pengadaan (PO, GRN/BAST, invoice)</p>
            <RequestFileList files={documentFiles} />
          </div>
        )}
        {transferFiles.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Bukti transfer</p>
            <RequestFileList files={transferFiles} />
          </div>
        )}
      </section>

      {req.kind === "reimburse" && <MissionDetails data={data} />}
      {commission && <CommissionLines data={commission} leadPaid={leadPaid} />}
      {aquaPlan && <AquaPlanDetails data={aquaPlan} editable={aquaEditable} />}
      {travel && <TravelCalcDetails data={travel} />}
      {procurement && <VendorTable data={procurement} />}
      {procurement && mode === "techops" && req.status === "head_approved" && <VendorCompareForm id={req.id} />}
      {procurement && mode === "fahead" && req.status === "fa_verified" && (
        <ChooseVendorForm id={req.id} vendors={procurement.vendors ?? []} recommended={procurement.recommended ?? null} />
      )}

      {travel && ["approved", "paid", "completed"].includes(req.status) && (
        <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">FPTD & laporan misi</h2>
          <p className="text-sm text-slate-600">
            Batas: <span className="font-semibold">{formatDate(travel.calc.report_due)}</span>
            {reportFiles.length === 0 && travel.calc.report_due < todayJakarta() && (
              <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Terlambat</span>
            )}
          </p>
          {isOwner && req.status !== "completed" ? (
            <TravelReportForm
              id={req.id}
              employeeId={me.id}
              initial={reportFiles.map(
                (f): AttachmentItem =>
                  f.kind === "file"
                    ? { key: f.id, kind: "file", id: f.id, path: f.path ?? "", name: f.name, size_bytes: f.size_bytes ?? 0 }
                    : { key: f.id, kind: "link", id: f.id, url: f.url ?? "", name: f.name },
              )}
            />
          ) : (
            <RequestFileList files={reportFiles} />
          )}
        </section>
      )}

      {mode && req.status !== "draft" && (
        <ReviewPanel
          id={req.id}
          status={req.status}
          employeeId={me.id}
          today={todayJakarta()}
          kind={req.kind}
          mode={mode}
          advance={travel?.advance ?? false}
          canNote={canNote}
          manualSalesLines={manualSalesLines}
        />
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat</h2>
        <RequestTimeline events={(eventRes.data ?? []) as unknown as RequestEvent[]} kind={req.kind} />
        {(isOwner || (aquaNoter && !mode)) && req.status !== "draft" && <NoteForm id={req.id} />}
      </section>

      <Link
        href={isOwner ? "/pengajuan" : "/pengajuan/review"}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        ← {isOwner ? "Pengajuan saya" : "Review F&A"}
      </Link>
    </main>
  );
}
