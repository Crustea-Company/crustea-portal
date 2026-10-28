import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TYPES, isAquaEditor, type ProjectType } from "@/lib/aquaculture";
import ProjectForm from "../ProjectForm";

export const metadata: Metadata = { title: "Catat Peluang Proyek - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProjectBaruPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  if (!isAquaEditor(me)) redirect("/aquaculture");
  const sp = await searchParams;
  const type = typeof sp.jenis === "string" && (PROJECT_TYPES as readonly string[]).includes(sp.jenis) ? (sp.jenis as ProjectType) : undefined;
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Aquaculture</p>
        <h1 className="text-2xl font-bold text-slate-900">Catat peluang proyek</h1>
        <p className="mt-1 text-sm text-slate-600">
          Langkah 1 SOP: identifikasi peluang. Setelah tersimpan, susun paket kelayakan finansial & RAB dari halaman proyek.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ProjectForm
          meId={me.id}
          people={(data ?? []) as { id: string; full_name: string }[]}
          initial={{ id: null, input: type ? { type } : {}, typeLocked: false }}
        />
      </div>
      <Link href="/aquaculture" className="text-sm font-medium text-brand-700 hover:underline">
        ← Project Management
      </Link>
    </main>
  );
}
