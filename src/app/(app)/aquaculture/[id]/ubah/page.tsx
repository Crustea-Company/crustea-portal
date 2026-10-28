import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLUMNS, isAquaEditor, type AquaProject } from "@/lib/aquaculture";
import ProjectForm from "../../ProjectForm";

export const metadata: Metadata = { title: "Ubah Proyek - Crustea Portal" };

export default async function ProjectUbahPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!isAquaEditor(me)) redirect(`/aquaculture/${id}`);
  const supabase = await createClient();
  const [projectRes, peopleRes] = await Promise.all([
    supabase.from("aqua_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const p = projectRes.data as unknown as AquaProject | null;
  if (!p) notFound();
  const people = (peopleRes.data ?? []) as { id: string; full_name: string }[];
  if (!people.some((x) => x.id === p.pic_id)) people.push({ id: p.pic_id, full_name: p.pic?.full_name ?? "PIC lama" });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Aquaculture · {p.number}</p>
        <h1 className="text-2xl font-bold text-slate-900">Ubah data peluang</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ProjectForm
          meId={me.id}
          people={people}
          initial={{
            id: p.id,
            typeLocked: p.plan_id !== null,
            input: {
              type: p.type,
              name: p.name,
              location: p.location ?? "",
              partner: p.partner ?? "",
              contact: p.contact ?? "",
              source: p.source ?? "",
              description: p.description ?? "",
              estimated_value: p.estimated_value,
              estimated_start: p.estimated_start ?? "",
              pic_id: p.pic_id,
            },
          }}
        />
      </div>
      <Link href={`/aquaculture/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Kembali ke proyek
      </Link>
    </main>
  );
}
