import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  CATEGORY_LABEL,
  PUBLIC_STEPS,
  STATUS_LABEL,
  STATUS_STYLE,
  isFeedbackReviewer,
  type CommunityPost,
} from "@/lib/feedback";
import KomunitasNav from "./KomunitasNav";

export const metadata: Metadata = { title: "Komunitas - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = { berjalan: "Sedang berjalan", selesai: "Selesai", semua: "Semua" } as const;
type Tab = keyof typeof TABS;

// Papan publik: hanya judul, ringkasan, kategori, dan progres yang ditulis CA.
// Isi masukan, sasaran, dan pengirim tidak pernah ditampilkan di sini.
export default async function KomunitasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "berjalan";
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [postRes, commentRes] = await Promise.all([
    supabase
      .from("community_posts")
      .select("feedback_id, title, summary, category, status, published_at, updated_at")
      .order("published_at", { ascending: false }),
    supabase.from("community_comments").select("feedback_id"),
  ]);
  const posts = (postRes.data ?? []) as CommunityPost[];
  const comments = new Map<string, number>();
  for (const c of (commentRes.data ?? []) as { feedback_id: string }[]) {
    comments.set(c.feedback_id, (comments.get(c.feedback_id) ?? 0) + 1);
  }
  const list = posts.filter((p) => tab === "semua" || (tab === "selesai" ? p.status === "done" : p.status !== "done"));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <KomunitasNav active="papan" reviewer={isFeedbackReviewer(me)} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Papan komunitas</h1>
        <p className="text-sm text-slate-600">
          Masukan karyawan yang sedang ditindaklanjuti Corporate Affairs. Judul dan ringkasan ditulis CA; isi asli dan nama
          pengirim tetap rahasia.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "berjalan" ? "/komunitas" : `/komunitas?tab=${t}`}
            className={`rounded-lg px-3 py-1.5 ${tab === t ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {TABS[t]}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Belum ada postingan di sini.{" "}
          <Link href="/komunitas/kirim" className="font-medium text-brand-700 hover:underline">
            Kirim masukan
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((p) => {
            const step = PUBLIC_STEPS.indexOf(p.status);
            return (
              <li key={p.feedback_id}>
                <Link
                  href={`/komunitas/${p.feedback_id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{CATEGORY_LABEL[p.category]}</span>
                    <span className="text-slate-500">Terbit {formatDate(p.published_at.slice(0, 10))}</span>
                  </div>
                  <p className="font-semibold text-slate-900">{p.title}</p>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{p.summary}</p>
                  <div className="flex items-center gap-3">
                    <ol className="flex flex-1 gap-1">
                      {PUBLIC_STEPS.map((s, i) => (
                        <li key={s} title={STATUS_LABEL[s]} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-slate-200"}`} />
                      ))}
                    </ol>
                    <span className="text-xs text-slate-500">{comments.get(p.feedback_id) ?? 0} komentar</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
