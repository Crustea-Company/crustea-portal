import type { Metadata } from "next";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isFeedbackReviewer } from "@/lib/feedback";
import KomunitasNav from "../KomunitasNav";
import FeedbackForm from "./FeedbackForm";

export const metadata: Metadata = { title: "Kirim Masukan - Crustea Portal" };

export default async function KirimMasukanPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [empRes, deptRes] = await Promise.all([
    supabase.from("employees").select("id, full_name, dept_code").eq("is_active", true).neq("id", me.id).order("full_name"),
    supabase.from("departments").select("code, name").order("code"),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <KomunitasNav active="kirim" reviewer={isFeedbackReviewer(me)} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Kirim masukan</h1>
        <p className="text-sm text-slate-600">
          Masukan hanya dibaca Anda dan tim Corporate Affairs. Bila ditindaklanjuti, CA menuliskan ringkasan umum di papan
          komunitas tanpa isi asli dan tanpa nama.
        </p>
      </div>
      <FeedbackForm
        employees={(empRes.data ?? []) as { id: string; full_name: string; dept_code: string | null }[]}
        departments={(deptRes.data ?? []) as { code: string; name: string }[]}
      />
    </main>
  );
}
