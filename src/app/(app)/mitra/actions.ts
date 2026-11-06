"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PARTNER_KINDS, PARTNER_STATUS, type PartnerKind, type PartnerStatus } from "@/lib/partners";

type Result = { ok: true } | { ok: false; message: string };

export type PartnerInput = {
  kind: PartnerKind;
  name: string;
  contact: string;
  location: string;
  commodity: string;
  pic_id: string;
  status: PartnerStatus;
  obligation: string;
  tech_note: string;
  notes: string;
};

const denied = (msg: string) => (msg.includes("row-level") ? "Anda tidak berhak mengubah data mitra." : msg);

export async function savePartner(input: PartnerInput, id: string | null): Promise<Result> {
  if (!(input.kind in PARTNER_KINDS)) return { ok: false, message: "Pilih jenis mitra." };
  if (!(input.status in PARTNER_STATUS)) return { ok: false, message: "Pilih status." };
  if (!input.name.trim()) return { ok: false, message: "Nama mitra belum diisi." };
  const t = (s: string) => s.trim() || null;
  const row = {
    kind: input.kind,
    name: input.name.trim(),
    contact: t(input.contact),
    location: t(input.location),
    commodity: t(input.commodity),
    pic_id: input.pic_id || null,
    status: input.status,
    obligation: t(input.obligation),
    tech_note: t(input.tech_note),
    notes: t(input.notes),
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("partners").update(row).eq("id", id).select("id")
    : await supabase.from("partners").insert(row).select("id");
  if (error) return { ok: false, message: denied(error.message) };
  if (!data?.length) return { ok: false, message: "Anda tidak berhak mengubah data mitra." };
  revalidatePath("/mitra");
  return { ok: true };
}

export async function deletePartner(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partners").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: denied(error.message) };
  if (!data?.length) return { ok: false, message: "Hanya head BDS, admin, dan CEO yang boleh menghapus mitra." };
  revalidatePath("/mitra");
  return { ok: true };
}
