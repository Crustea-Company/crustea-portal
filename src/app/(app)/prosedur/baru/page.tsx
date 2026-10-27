import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProcedureEditor from "../ProcedureEditor";

export default async function ProsedurBaru() {
  const me = (await getCurrentEmployee())!;
  if (me.app_role !== "admin") {
    return <main className="mx-auto max-w-4xl px-4 py-6 text-sm text-slate-600">Halaman ini khusus admin.</main>;
  }
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("code, name").order("code");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Tambah prosedur</h1>
      <ProcedureEditor
        id={null}
        departments={departments ?? []}
        initial={{ title: "", sop_code: "", dept_code: "", sort_order: 100, body: "" }}
      />
    </main>
  );
}
