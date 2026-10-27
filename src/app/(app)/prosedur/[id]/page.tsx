import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import Markdown from "@/components/Markdown";
import DeleteProcedureButton from "./DeleteProcedureButton";

export const metadata: Metadata = { title: "Prosedur - Crustea Portal" };

export default async function ProsedurDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("procedures")
    .select("id, sop_code, title, dept_code, body, updated_at, updated_by")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const { data: editor } = p.updated_by
    ? await supabase.from("employees").select("full_name").eq("id", p.updated_by).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <Link href="/prosedur" className="text-sm text-brand-700 hover:underline">
        ← Semua prosedur
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">
            {p.dept_code ? `Prosedur ${p.dept_code}` : "Prosedur umum"}
            {p.sop_code && ` · ${p.sop_code}`}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{p.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Diperbarui {formatDateTime(p.updated_at)}
            {editor?.full_name && ` oleh ${editor.full_name}`}
          </p>
        </div>
        {me.app_role === "admin" && (
          <div className="flex gap-2">
            <Link
              href={`/prosedur/${p.id}/ubah`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Ubah
            </Link>
            <DeleteProcedureButton id={p.id} title={p.title} />
          </div>
        )}
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        {p.body.trim() ? (
          <Markdown>{p.body}</Markdown>
        ) : (
          <p className="text-sm text-slate-500">Isi prosedur ini belum ditulis.</p>
        )}
      </article>
    </main>
  );
}
