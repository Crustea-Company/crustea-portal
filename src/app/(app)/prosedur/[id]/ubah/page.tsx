import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProcedureEditor from "../../ProcedureEditor";

export default async function UbahProsedur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  if (me.app_role !== "admin") {
    return <main className="mx-auto max-w-4xl px-4 py-6 text-sm text-slate-600">Halaman ini khusus admin.</main>;
  }
  const supabase = await createClient();
  const [{ data: p }, { data: departments }] = await Promise.all([
    supabase.from("procedures").select("id, sop_code, title, dept_code, sort_order, body").eq("id", id).maybeSingle(),
    supabase.from("departments").select("code, name").order("code"),
  ]);
  if (!p) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Ubah prosedur</h1>
      <ProcedureEditor
        id={p.id}
        departments={departments ?? []}
        initial={{
          title: p.title,
          sop_code: p.sop_code ?? "",
          dept_code: p.dept_code ?? "",
          sort_order: p.sort_order,
          body: p.body,
        }}
      />
    </main>
  );
}
