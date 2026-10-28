"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TYPES, type AquaStage, type Investor, type ProjectType, type RabData } from "@/lib/aquaculture";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

export type ProjectInput = {
  type: ProjectType;
  name: string;
  location: string;
  partner: string;
  contact: string;
  source: string;
  description: string;
  estimated_value: number;
  estimated_start: string;
  pic_id: string;
};

function revalidateProject(id?: string) {
  revalidatePath("/aquaculture");
  if (id) revalidatePath(`/aquaculture/${id}`, "layout");
}

// Simpan peluang baru (id = null) atau ubah data peluang. Tahap tidak diubah di sini.
export async function saveProject(input: ProjectInput, id: string | null): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const row = {
    type: input.type,
    name: input.name.trim(),
    location: input.location.trim() || null,
    partner: input.partner.trim() || null,
    contact: input.contact.trim() || null,
    source: input.source.trim() || null,
    description: input.description.trim() || null,
    estimated_value: input.estimated_value,
    estimated_start: input.estimated_start || null,
    pic_id: input.pic_id || me.id,
  };
  if (!PROJECT_TYPES.includes(row.type)) return { ok: false, message: "Pilih jenis proyek." };
  if (!row.name) return { ok: false, message: "Nama proyek belum diisi." };
  if (!Number.isSafeInteger(row.estimated_value) || row.estimated_value < 0) {
    return { ok: false, message: "Perkiraan nilai tidak valid." };
  }

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("aqua_projects").update(row).eq("id", id).select("id");
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    if (!data?.length) return { ok: false, message: "Anda tidak boleh mengubah proyek ini." };
    revalidateProject(id);
    return { ok: true, id };
  }
  const { data, error } = await supabase.from("aqua_projects").insert(row).select("id").single();
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  revalidateProject(data.id as string);
  return { ok: true, id: data.id as string };
}

export async function deleteProject(id: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("aqua_projects").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Peluang ini tidak bisa dihapus." };
  revalidateProject();
  return { ok: true };
}

export async function changeAquaStage(
  id: string,
  to: AquaStage | "reopen",
  note: string,
  data: Record<string, unknown> | null,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_aqua_stage", {
    p_id: id,
    p_to: to,
    p_note: note.trim() || null,
    p_data: data,
  });
  if (error) return { ok: false, message: error.message };
  revalidateProject(id);
  return { ok: true };
}

export async function saveContract(id: string, investors: Investor[], note: string): Promise<SimpleResult> {
  return changeAquaStage(id, "contract", note, { investors });
}

export async function addAquaNote(
  id: string,
  note: string,
  report: { month: string; link: string } | null,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_aqua_note", {
    p_id: id,
    p_note: note.trim() || null,
    p_report: report !== null,
    p_month: report ? `${report.month}-01` : null,
    p_link: report?.link.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateProject(id);
  return { ok: true };
}

export async function recordAquaIncome(
  id: string,
  date: string,
  amount: number,
  allocation: string,
  note: string,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_aqua_income", {
    p_id: id,
    p_date: date,
    p_amount: amount,
    p_allocation: allocation.trim() || null,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateProject(id);
  revalidatePath("/kpi/target");
  return { ok: true };
}

// Simpan paket kelayakan finansial + RAB (pengajuan kind 'aqua_plan'); submit = kirim ke F&A.
export async function saveAquaPlan(
  projectId: string,
  planId: string | null,
  title: string,
  data: RabData,
  submit: boolean,
): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (!title.trim()) return { ok: false, message: "Judul paket belum diisi." };
  const clean: RabData = { ...data, project_id: projectId };
  if (submit) {
    if (clean.capex.length + clean.workcap.length + clean.opex.length === 0) {
      return { ok: false, message: "Isi minimal satu baris biaya (Capex, modal kerja, atau opex)." };
    }
    if (clean.revenue.length === 0) return { ok: false, message: "Isi minimal satu baris proyeksi pendapatan." };
    if ([...clean.capex, ...clean.workcap, ...clean.opex, ...clean.revenue].some((l) => !l.desc.trim())) {
      return { ok: false, message: "Setiap baris wajib punya uraian." };
    }
  }

  const supabase = await createClient();
  let id = planId;
  if (id) {
    const { data: rows, error } = await supabase
      .from("requests")
      .update({ title: title.trim(), data: clean })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    if (!rows?.length) return { ok: false, message: "Paket ini tidak bisa diubah (sudah dikirim atau Anda tidak berhak)." };
  } else {
    const { data: row, error } = await supabase
      .from("requests")
      .insert({ kind: "aqua_plan", title: title.trim(), data: clean, requester_id: me.id })
      .select("id")
      .single();
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    id = row.id as string;
  }
  if (submit) {
    const { error } = await supabase.rpc("change_request_status", { p_id: id, p_to: "submitted" });
    if (error) {
      revalidateProject(projectId);
      return { ok: false, message: `Tersimpan sebagai draf, tetapi gagal dikirim: ${error.message}` };
    }
  }
  revalidateProject(projectId);
  revalidatePath("/pengajuan");
  revalidatePath("/pengajuan/review");
  revalidatePath(`/pengajuan/${id}`);
  return { ok: true, id };
}
