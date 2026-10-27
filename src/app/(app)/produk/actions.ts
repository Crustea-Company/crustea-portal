"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/travel";
import type { ProductType } from "@/lib/commission";

type Result = { ok: true } | { ok: false; message: string };

export type ProductInput = {
  name: string;
  type: ProductType;
  price: number;
  hpp: number;
  commission_pct: number; // persen, mis. 2.5
  max_discount: number; // persen
  bundle_items: string;
  promo_price: number; // 0 = tidak ada
  notes: string;
  valid_from: string;
  valid_to: string; // "" = tanpa batas
};

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "produk"
  );
}

function parse(input: ProductInput): { error: string } | { row: Record<string, unknown> } {
  const name = input.name.trim();
  if (!name) return { error: "Nama produk belum diisi." };
  if (input.type !== "unit" && input.type !== "bundle") return { error: "Pilih tipe produk." };
  for (const [label, n] of [["Harga jual", input.price], ["HPP", input.hpp], ["Harga promo", input.promo_price]] as const) {
    if (!Number.isSafeInteger(n) || n < 0) return { error: `${label} tidak valid.` };
  }
  if (input.price <= 0) return { error: "Harga jual belum diisi." };
  for (const [label, n] of [["% komisi", input.commission_pct], ["Diskon maks", input.max_discount]] as const) {
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: `${label} harus 0-100%.` };
  }
  if (!isIsoDate(input.valid_from)) return { error: "Tanggal berlaku mulai belum diisi." };
  if (input.valid_to && (!isIsoDate(input.valid_to) || input.valid_to < input.valid_from)) {
    return { error: "Tanggal berlaku sampai harus setelah tanggal mulai." };
  }
  return {
    row: {
      name,
      type: input.type,
      price: input.price,
      hpp: input.hpp,
      commission_pct: Math.round(input.commission_pct * 100) / 10000,
      max_discount: Math.round(input.max_discount * 100) / 10000,
      bundle_items: input.bundle_items.trim() || null,
      promo_price: input.promo_price || null,
      notes: input.notes.trim() || null,
      valid_from: input.valid_from,
      valid_to: input.valid_to || null,
    },
  };
}

function done(): Result {
  revalidatePath("/produk");
  revalidatePath("/pengajuan/komisi/baru");
  return { ok: true };
}

// Tambah produk baru, atau ubah versi yang ada (id terisi). Hanya admin/F&A (dijaga RLS).
export async function saveProduct(input: ProductInput, id: string | null): Promise<Result> {
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("products").update(parsed.row).eq("id", id).select("id");
    if (error) return { ok: false, message: error.message };
    if (!data?.length) return { ok: false, message: "Anda tidak berhak mengubah master produk." };
  } else {
    const { error } = await supabase.from("products").insert({ ...parsed.row, code: `${slug(input.name)}-${Date.now().toString(36)}` });
    if (error) return { ok: false, message: error.message.includes("row-level") ? "Anda tidak berhak mengubah master produk." : error.message };
  }
  return done();
}

// Versi harga baru: versi lama ditutup sehari sebelum versi baru berlaku. Klaim dengan tanggal
// closing sebelum itu tetap memakai harga lama.
export async function newProductVersion(oldId: string, input: ProductInput): Promise<Result> {
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const supabase = await createClient();
  const { data: old } = await supabase.from("products").select("code, valid_from, valid_to").eq("id", oldId).maybeSingle();
  if (!old) return { ok: false, message: "Produk tidak ditemukan." };
  if (input.valid_from <= (old.valid_from as string)) {
    return { ok: false, message: "Versi baru harus berlaku setelah tanggal mulai versi lama." };
  }
  const d = new Date(`${input.valid_from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const close = d.toISOString().slice(0, 10);

  const { data: closed, error: closeErr } = await supabase
    .from("products")
    .update({ valid_to: close })
    .eq("id", oldId)
    .select("id");
  if (closeErr) return { ok: false, message: closeErr.message };
  if (!closed?.length) return { ok: false, message: "Anda tidak berhak mengubah master produk." };

  const { error } = await supabase.from("products").insert({ ...parsed.row, code: old.code });
  if (error) {
    await supabase.from("products").update({ valid_to: old.valid_to }).eq("id", oldId);
    return { ok: false, message: error.message };
  }
  return done();
}
