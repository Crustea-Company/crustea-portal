import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_COLUMNS, isFeedbackReviewer, type FeedbackItem } from "@/lib/feedback";
import KomunitasNav from "../KomunitasNav";
import FeedbackList from "../FeedbackList";

export const metadata: Metadata = { title: "Masukan Saya - Crustea Portal" };

export default async function MasukanSayaPage() {
  const me = (await getCurrentEmployee())!;
  const reviewer = isFeedbackReviewer(me);
  const supabase = await createClient();
  // CA/admin bisa membaca semua masukan, jadi disaring dengan daftar milik sendiri (termasuk yang anonim).
  const [itemRes, mineRes] = await Promise.all([
    supabase.from("feedback_items").select(FEEDBACK_COLUMNS).order("created_at", { ascending: false }),
    supabase.rpc("my_feedback_ids"),
  ]);
  const mine = new Set((mineRes.data ?? []) as string[]);
  const items = ((itemRes.data ?? []) as unknown as FeedbackItem[]).filter((f) => mine.has(f.id));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <KomunitasNav active="saya" reviewer={reviewer} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Masukan saya</h1>
          <p className="text-sm text-slate-600">Hanya Anda yang melihat daftar ini, termasuk masukan yang dikirim anonim.</p>
        </div>
        <Link href="/komunitas/kirim" className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          Kirim masukan
        </Link>
      </div>
      <FeedbackList items={items} showSender={false} empty="Anda belum pernah mengirim masukan." />
    </main>
  );
}
