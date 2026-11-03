import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CATEGORY_LABEL,
  FEEDBACK_COLUMNS,
  STATUS_LABEL,
  STATUS_STYLE,
  isFeedbackReviewer,
  targetText,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback";
import { NoteForm, PostEditor, ReviewPanel } from "./ReviewPanel";

export const metadata: Metadata = { title: "Detail Masukan - Crustea Portal" };

type FeedbackEvent = {
  id: number;
  action: "create" | "status" | "note" | "post_edit";
  by_sender: boolean;
  from_status: FeedbackStatus | null;
  to_status: FeedbackStatus | null;
  note: string | null;
  internal: boolean;
  created_at: string;
  actor: { full_name: string } | null;
};

function describe(e: FeedbackEvent): string {
  switch (e.action) {
    case "create":
      return "Mengirim masukan";
    case "status":
      return `Mengubah status menjadi ${e.to_status ? STATUS_LABEL[e.to_status] : "-"}`;
    case "note":
      return e.internal ? "Catatan internal CA" : "Memberi catatan";
    case "post_edit":
      return "Mengubah postingan publik";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

// Halaman privat: hanya pengirim dan Corporate Affairs (RLS feedback_items).
export default async function MasukanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const reviewer = isFeedbackReviewer(me);
  const supabase = await createClient();
  const [itemRes, eventRes, mineRes, postRes] = await Promise.all([
    supabase.from("feedback_items").select(FEEDBACK_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("feedback_events")
      .select("id, action, by_sender, from_status, to_status, note, internal, created_at, actor:employees!feedback_events_actor_fkey(full_name)")
      .eq("feedback_id", id)
      .order("created_at"),
    supabase.rpc("my_feedback_ids"),
    supabase.from("community_posts").select("title, summary").eq("feedback_id", id).maybeSingle(),
  ]);
  if (!itemRes.data) notFound();
  const f = itemRes.data as unknown as FeedbackItem;
  const events = (eventRes.data ?? []) as unknown as FeedbackEvent[];
  const mine = ((mineRes.data ?? []) as string[]).includes(f.id);
  const post = postRes.data as { title: string; summary: string } | null;

  const senderText = mine
    ? f.is_anonymous
      ? "Anda (anonim: nama Anda tidak terlihat oleh CA)"
      : "Anda"
    : f.is_anonymous
      ? "Anonim"
      : (f.sender?.full_name ?? "-");
  const who = (e: FeedbackEvent) =>
    e.by_sender ? (mine ? "Anda" : f.is_anonymous ? "Pengirim (anonim)" : `${e.actor?.full_name ?? "-"} (pengirim)`) : (e.actor?.full_name ?? "Sistem");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{f.number}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{CATEGORY_LABEL[f.category]}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{f.subject}</h1>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Rahasia: halaman ini hanya bisa dibuka pengirim dan tim Corporate Affairs.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Tentang">{targetText(f)}</Field>
          <Field label="Pengirim">{senderText}</Field>
          <Field label="Dikirim">{formatDate(f.created_at.slice(0, 10))}</Field>
        </dl>
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{f.body}</p>
      </section>

      {post && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-900">Tampil di papan komunitas</h2>
            <Link href={`/komunitas/${f.id}`} className="text-sm font-medium text-brand-700 hover:underline">
              Lihat postingan →
            </Link>
          </div>
          {reviewer ? (
            <PostEditor id={f.id} title={post.title} summary={post.summary} />
          ) : (
            <>
              <p className="font-medium text-slate-900">{post.title}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{post.summary}</p>
            </>
          )}
        </section>
      )}

      {reviewer && <ReviewPanel key={f.status} id={f.id} status={f.status} subject={f.subject} />}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat & catatan</h2>
        <ol className="flex flex-col">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span
                className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${
                  e.internal ? "bg-slate-400" : e.action === "note" ? "bg-logo-lime" : "bg-brand-600"
                }`}
              />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{who(e)}</span> · {describe(e)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
              {e.note && (
                <p className={`mt-1 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${e.internal ? "bg-slate-100 italic text-slate-600" : "bg-slate-50 text-slate-700"}`}>
                  {e.note}
                </p>
              )}
            </li>
          ))}
        </ol>
        <NoteForm id={f.id} canInternal={reviewer && !mine} />
      </section>

      <Link href={reviewer && !mine ? "/komunitas/tinjau" : "/komunitas/masukan"} className="text-sm font-medium text-brand-700 hover:underline">
        ← {reviewer && !mine ? "Tinjauan CA" : "Masukan saya"}
      </Link>
    </main>
  );
}
