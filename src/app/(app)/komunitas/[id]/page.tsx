import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CATEGORY_LABEL,
  PUBLIC_STEPS,
  STATUS_LABEL,
  STATUS_STYLE,
  isFeedbackReviewer,
  type CommunityPost,
  type FeedbackStatus,
} from "@/lib/feedback";
import { CommentForm, DeleteCommentButton } from "./CommentForm";

export const metadata: Metadata = { title: "Postingan Komunitas - Crustea Portal" };

type PostEvent = { id: number; status: FeedbackStatus | null; note: string | null; created_at: string; actor: { full_name: string } | null };
type Comment = { id: number; body: string; created_at: string; author_id: string; author: { full_name: string; dept_code: string | null } | null };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [postRes, eventRes, commentRes] = await Promise.all([
    supabase
      .from("community_posts")
      .select("feedback_id, title, summary, category, status, published_at, updated_at")
      .eq("feedback_id", id)
      .maybeSingle(),
    supabase
      .from("community_post_events")
      .select("id, status, note, created_at, actor:employees!community_post_events_actor_fkey(full_name)")
      .eq("feedback_id", id)
      .order("created_at"),
    supabase
      .from("community_comments")
      .select("id, body, created_at, author_id, author:employees!community_comments_author_id_fkey(full_name, dept_code)")
      .eq("feedback_id", id)
      .order("created_at"),
  ]);
  if (!postRes.data) notFound();
  const post = postRes.data as CommunityPost;
  const events = (eventRes.data ?? []) as unknown as PostEvent[];
  const comments = (commentRes.data ?? []) as unknown as Comment[];
  const reviewer = isFeedbackReviewer(me);
  const step = PUBLIC_STEPS.indexOf(post.status);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[post.status]}`}>{STATUS_LABEL[post.status]}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{CATEGORY_LABEL[post.category]}</span>
          <span className="text-slate-500">Terbit {formatDate(post.published_at.slice(0, 10))}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{post.title}</h1>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{post.summary}</p>
        {reviewer && (
          <Link href={`/komunitas/masukan/${post.feedback_id}`} className="self-start text-sm font-medium text-brand-700 hover:underline">
            Buka masukan asli (khusus CA) →
          </Link>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Progres</h2>
        <ol className="mb-4 grid grid-cols-3 gap-1 text-center text-xs">
          {PUBLIC_STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-1">
              <span className={`h-2 rounded-full ${i <= step ? "bg-brand-600" : "bg-slate-200"}`} />
              <span className={i <= step ? "font-semibold text-brand-800" : "text-slate-500"}>{STATUS_LABEL[s]}</span>
            </li>
          ))}
        </ol>
        <ol className="flex flex-col">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-white" />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{e.status ? STATUS_LABEL[e.status] : "Pembaruan"}</span>
                <span className="text-slate-500"> · Corporate Affairs{e.actor ? ` (${e.actor.full_name})` : ""}</span>
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
              {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Komentar ({comments.length})</h2>
        {comments.length === 0 && <p className="text-sm text-slate-500">Belum ada komentar. Jadilah yang pertama.</p>}
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">{c.author?.full_name ?? "-"}</span>
                  {c.author?.dept_code && <span className="text-slate-500"> · {c.author.dept_code}</span>}
                  <span className="block text-xs text-slate-500">{formatDateTime(c.created_at)}</span>
                </p>
                {(c.author_id === me.id || reviewer) && <DeleteCommentButton postId={post.feedback_id} commentId={c.id} />}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
        <CommentForm postId={post.feedback_id} />
      </section>

      <Link href="/komunitas" className="text-sm font-medium text-brand-700 hover:underline">
        ← Papan komunitas
      </Link>
    </main>
  );
}
