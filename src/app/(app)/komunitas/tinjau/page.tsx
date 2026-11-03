import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_COLUMNS, isFeedbackReviewer, type FeedbackItem, type FeedbackStatus } from "@/lib/feedback";
import KomunitasNav from "../KomunitasNav";
import FeedbackList from "../FeedbackList";

export const metadata: Metadata = { title: "Tinjauan Masukan - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS: Record<string, { label: string; statuses: FeedbackStatus[] }> = {
  antrian: { label: "Perlu ditinjau", statuses: ["new", "reviewed"] },
  berjalan: { label: "Ditindaklanjuti", statuses: ["followed_up", "in_progress"] },
  selesai: { label: "Selesai", statuses: ["done"] },
  ditutup: { label: "Ditolak / tidak ditindaklanjuti", statuses: ["rejected", "not_followed"] },
};

// Antrian Corporate Affairs: semua masukan (pengirim anonim tetap tanpa nama).
export default async function TinjauPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  if (!isFeedbackReviewer(me)) notFound();
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "antrian";

  const supabase = await createClient();
  const { data } = await supabase.from("feedback_items").select(FEEDBACK_COLUMNS).order("created_at", { ascending: false });
  const all = (data ?? []) as unknown as FeedbackItem[];
  const count = (t: string) => all.filter((f) => TABS[t].statuses.includes(f.status)).length;
  const list = all.filter((f) => TABS[tab].statuses.includes(f.status));
  // Antrian: yang paling lama menunggu di atas.
  if (tab === "antrian") list.reverse();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <KomunitasNav active="tinjau" reviewer />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tinjauan masukan (Corporate Affairs)</h1>
        <p className="text-sm text-slate-600">Isi masukan bersifat rahasia. Nama pengirim anonim tidak bisa dilihat siapa pun lewat aplikasi.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 text-sm">
        {Object.entries(TABS).map(([key, t]) => (
          <Link
            key={key}
            href={key === "antrian" ? "/komunitas/tinjau" : `/komunitas/tinjau?tab=${key}`}
            className={`shrink-0 rounded-lg px-3 py-1.5 ${tab === key ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {t.label} ({count(key)})
          </Link>
        ))}
      </div>
      <FeedbackList items={list} showSender empty="Tidak ada masukan di sini." />
    </main>
  );
}
