import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  BUCKET,
  KIND_LABEL,
  REQUEST_COLUMNS,
  canReviewRequests,
  type ReimburseData,
  type RequestFile,
  type RequestRow,
} from "@/lib/requests";
import RequestStatusBadge, { SlaLabel } from "@/components/requests/RequestStatusBadge";
import RequestTimeline, { type RequestEvent } from "@/components/requests/RequestTimeline";
import RequestFileList, { type ViewFile } from "@/components/requests/RequestFileList";
import { DeleteDraftButton, NoteForm, ReviewPanel } from "./ReviewPanel";

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
  const transferFiles = viewFiles.filter((f) => f.purpose === "transfer");

  const isOwner = req.requester_id === me.id;
  const isReviewer = canReviewRequests(me) && (!isOwner || me.app_role === "admin");
  const editable = isOwner && (req.status === "draft" || req.status === "needs_revision");
  const data = req.data as unknown as ReimburseData;
  const lastRevisionNote =
    req.status === "needs_revision"
      ? [...((eventRes.data ?? []) as unknown as RequestEvent[])].reverse().find((e) => e.to_status === "needs_revision")?.note
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      {sent && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
          Pengajuan terkirim. F&A akan meninjau maksimal 2 hari kerja; statusnya bisa dipantau di halaman ini.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{req.number}</span>
          <span>· {KIND_LABEL[req.kind]}</span>
          <RequestStatusBadge status={req.status} />
          <SlaLabel slaDue={req.sla_due} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{req.title}</h1>
        <p className="text-2xl font-bold text-brand-800">Rp{formatNumber(req.amount)}</p>
      </div>

      {lastRevisionNote && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <p className="font-semibold">Perlu perbaikan dari F&A:</p>
          <p className="whitespace-pre-wrap">{lastRevisionNote}</p>
        </div>
      )}

      {editable && (
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
          {req.paid_on && <Field label="Tanggal transfer">{formatDate(req.paid_on)}</Field>}
        </dl>
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-slate-500">Bukti nota</p>
          <RequestFileList files={proofFiles} />
        </div>
        {transferFiles.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Bukti transfer</p>
            <RequestFileList files={transferFiles} />
          </div>
        )}
      </section>

      {req.kind === "reimburse" && <MissionDetails data={data} />}

      {isReviewer && req.status !== "draft" && (
        <ReviewPanel id={req.id} status={req.status} employeeId={me.id} today={todayJakarta()} />
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat</h2>
        <RequestTimeline events={(eventRes.data ?? []) as unknown as RequestEvent[]} />
        {isOwner && req.status !== "draft" && <NoteForm id={req.id} />}
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
