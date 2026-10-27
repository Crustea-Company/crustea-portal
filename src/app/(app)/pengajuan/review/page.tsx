import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";
import {
  KIND_LABEL,
  REQUEST_COLUMNS,
  REVIEW_TABS,
  STATUS_LABEL,
  canReviewRequests,
  canSeeAllRequests,
  isOverdue,
  type RequestKind,
  type RequestRow,
  type RequestStatus,
} from "@/lib/requests";
import RequestList from "@/components/requests/RequestList";

export const metadata: Metadata = { title: "Review Pengajuan - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Antrian review F&A per status. CEO bisa membuka halaman ini tanpa tombol aksi.
export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  if (!canSeeAllRequests(me)) redirect("/pengajuan");

  const params = await searchParams;
  const status: RequestStatus = (REVIEW_TABS as string[]).includes(String(params.status))
    ? (params.status as RequestStatus)
    : "submitted";
  const kind = typeof params.jenis === "string" && params.jenis in KIND_LABEL ? (params.jenis as RequestKind) : "";

  const supabase = await createClient();
  let query = supabase.from("requests").select(REQUEST_COLUMNS).neq("status", "draft");
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("status_since", { ascending: true });
  const all = (data ?? []) as unknown as RequestRow[];

  const counts = Object.fromEntries(REVIEW_TABS.map((s) => [s, all.filter((r) => r.status === s).length]));
  const overdue = all.filter(isOverdue).length;
  let rows = all.filter((r) => r.status === status);
  // Antrian: yang paling lama menunggu di atas. Selesai/ditolak: terbaru di atas.
  if (status === "paid" || status === "rejected") rows = rows.reverse();
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const href = (s: string, k: string) => {
    const qs = new URLSearchParams({ status: s });
    if (k) qs.set("jenis", k);
    return `/pengajuan/review?${qs}`;
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Review Finance & Accounting</h1>
        {!canReviewRequests(me) && (
          <p className="mt-1 text-sm text-slate-600">Anda hanya bisa melihat. Peninjauan dilakukan oleh F&A.</p>
        )}
      </div>

      {overdue > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {overdue} pengajuan lewat SLA (lebih dari 2 hari kerja di status yang sama).
        </p>
      )}

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {REVIEW_TABS.map((s) => (
          <Link
            key={s}
            href={href(s, kind)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              s === status ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {STATUS_LABEL[s]} <span className="opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-slate-600">Jenis:</span>
        {[["", "Semua"], ...Object.entries(KIND_LABEL)].map(([k, label]) => (
          <Link
            key={k}
            href={href(status, k)}
            className={`rounded-lg px-2.5 py-1 ${
              k === kind ? "bg-brand-100 font-semibold text-brand-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat pengajuan: {error.message}
        </p>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-slate-600">
          {rows.length} pengajuan · total <span className="font-semibold text-slate-900">Rp{formatNumber(total)}</span>
        </p>
      )}
      <RequestList rows={rows} showRequester empty={`Tidak ada pengajuan berstatus ${STATUS_LABEL[status]}.`} />
    </main>
  );
}
