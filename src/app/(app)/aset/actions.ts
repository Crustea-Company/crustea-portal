"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { ASSET_CATEGORIES, type AssetCategory } from "@/lib/sales";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

export type AssetInput = {
  name: string;
  category: AssetCategory;
  received_on: string;
  location: string;
  holder: string;
  value: number;
  useful_life_months: number;
  reference: string;
  notes: string;
};

function revalidateAsset(id?: string) {
  revalidatePath("/aset");
  if (id) revalidatePath(`/aset/${id}`);
}

// Serah terima aset baru (TechOps) atau ubah data aset. Status hanya lewat changeAssetStatus.
export async function saveAsset(input: AssetInput, id: string | null): Promise<Result> {
  const row = {
    name: input.name.trim(),
    category: input.category,
    received_on: input.received_on,
    location: input.location.trim() || null,
    holder: input.holder.trim() || null,
    value: input.value > 0 ? input.value : null,
    useful_life_months: input.useful_life_months > 0 ? input.useful_life_months : null,
    reference: input.reference.trim() || null,
    notes: input.notes.trim() || null,
  };
  if (!row.name) return { ok: false, message: "Nama aset belum diisi." };
  if (!(row.category in ASSET_CATEGORIES)) return { ok: false, message: "Pilih kategori aset." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.received_on) || row.received_on > todayJakarta()) {
    return { ok: false, message: "Tanggal serah terima belum diisi atau di masa depan." };
  }
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("assets").update(row).eq("id", id).select("id")
    : await supabase.from("assets").insert(row).select("id");
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  if (!data?.length) return { ok: false, message: "Hanya TechOps / Finance yang bisa mengubah data aset." };
  const savedId = data[0].id as string;
  revalidateAsset(savedId);
  return { ok: true, id: savedId };
}

export async function changeAssetStatus(
  id: string,
  to: string,
  note: string,
  data: Record<string, unknown> | null,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_asset_status", { p_id: id, p_to: to, p_note: note.trim() || null, p_data: data });
  if (error) return { ok: false, message: error.message };
  revalidateAsset(id);
  return { ok: true };
}

export async function addAssetLog(id: string, action: "maintenance" | "opname" | "note", note: string, doneOn: string): Promise<SimpleResult> {
  if (!note.trim()) return { ok: false, message: "Keterangan wajib diisi." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_asset_log", { p_id: id, p_action: action, p_note: note.trim(), p_done_on: doneOn || null });
  if (error) return { ok: false, message: error.message };
  revalidateAsset(id);
  return { ok: true };
}
