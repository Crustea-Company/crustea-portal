"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { LEAD_SOURCES, type LeadInput, type LeadStage } from "@/lib/sales";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

function revalidateLead(id?: string) {
  revalidatePath("/penjualan");
  revalidatePath("/stok");
  if (id) revalidatePath(`/penjualan/${id}`);
}

// Simpan lead baru (id = null) atau ubah data lead. Tahap tidak diubah di sini.
export async function saveLead(input: LeadInput, id: string | null): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const row = {
    lead_date: input.lead_date,
    source: input.source,
    referral_code: input.referral_code.trim().toUpperCase() || null,
    customer: input.customer.trim(),
    contact: input.contact.trim() || null,
    location: input.location.trim() || null,
    product_code: input.product_code || null,
    units: input.units,
    value: input.value,
    sales_id: input.sales_id || me.id,
    notes: input.notes.trim() || null,
  };
  if (!(row.source in LEAD_SOURCES)) return { ok: false, message: "Pilih sumber lead." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.lead_date)) return { ok: false, message: "Tanggal lead masuk belum diisi." };
  if (row.lead_date > todayJakarta()) return { ok: false, message: "Tanggal lead masuk tidak boleh di masa depan." };
  if (!row.customer) return { ok: false, message: "Nama customer belum diisi." };
  if (row.source === "referral" && !row.referral_code) return { ok: false, message: "Lead dari referral wajib diisi kode referralnya." };
  if (!Number.isSafeInteger(row.units) || row.units < 1) return { ok: false, message: "Jumlah unit minimal 1." };
  if (!Number.isSafeInteger(row.value) || row.value < 0) return { ok: false, message: "Nilai penjualan tidak valid." };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("sales_leads").update(row).eq("id", id).select("id");
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    if (!data?.length) return { ok: false, message: "Anda tidak boleh mengubah lead ini." };
    revalidateLead(id);
    return { ok: true, id };
  }
  const { data, error } = await supabase.from("sales_leads").insert(row).select("id").single();
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  revalidateLead(data.id as string);
  return { ok: true, id: data.id as string };
}

export async function changeLeadStage(
  id: string,
  to: LeadStage,
  note: string,
  data: Record<string, unknown> | null,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_lead_stage", {
    p_id: id,
    p_to: to,
    p_note: note.trim() || null,
    p_data: data,
  });
  if (error) return { ok: false, message: error.message };
  revalidateLead(id);
  return { ok: true };
}

export async function addLeadNote(id: string, note: string, complaint: boolean): Promise<SimpleResult> {
  if (!note.trim()) return { ok: false, message: "Catatan kosong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_lead_note", { p_id: id, p_note: note.trim(), p_complaint: complaint });
  if (error) return { ok: false, message: error.message };
  revalidateLead(id);
  return { ok: true };
}
