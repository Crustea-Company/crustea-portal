"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProcedureInput = {
  title: string;
  sop_code: string;
  dept_code: string; // "" = umum
  sort_order: number;
  body: string;
};

type Result = { ok: true; id: string } | { ok: false; message: string };

// Hanya admin (database juga menolak selain admin). Perubahan tercatat di audit_log.
export async function saveProcedure(input: ProcedureInput, id: string | null): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh mengubah prosedur." };
  if (!input.title.trim()) return { ok: false, message: "Judul wajib diisi." };

  const row = {
    title: input.title.trim(),
    sop_code: input.sop_code.trim().toUpperCase() || null,
    dept_code: input.dept_code || null,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 0,
    body: input.body,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("procedures").update(row).eq("id", id).select("id")
    : await supabase.from("procedures").insert(row).select("id");
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? `Kode SOP ${row.sop_code} sudah dipakai prosedur lain.` : `Gagal menyimpan: ${error.message}`,
    };
  }
  if (!data?.length) return { ok: false, message: "Prosedur tidak ditemukan." };

  revalidatePath("/prosedur");
  return { ok: true, id: data[0].id as string };
}

export async function deleteProcedure(id: string): Promise<{ ok: boolean; message?: string }> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh menghapus prosedur." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("procedures").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: `Gagal menghapus: ${error.message}` };
  if (!data?.length) return { ok: false, message: "Prosedur tidak ditemukan." };
  revalidatePath("/prosedur");
  return { ok: true };
}
