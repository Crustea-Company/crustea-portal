"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/travel";
import { getCurrentEmployee } from "@/lib/auth";
import { PRODUCT_COLUMNS, toProduct, type Product, type ProductType } from "@/lib/commission";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { PH, productInputFromValues, productSheetDef, type ProductSheetOp } from "@/lib/bulk-products";

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

// ---------- Impor Excel: master produk (ekspor-ubah-impor massal) ----------
// Memakai saveProduct / newProductVersion yang sama dengan form; hak ubah dijaga database (admin/F&A).

export async function fetchProductsForSheet(ids: string[]): Promise<{ ok: true; products: Product[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const list = [...new Set(ids.filter(Boolean))];
  const supabase = await createClient();
  const products: Product[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).in("id", list.slice(i, i + 100));
    if (error) return { ok: false, message: `Gagal memuat produk: ${error.message}` };
    products.push(...(data ?? []).map((r) => toProduct(r as Record<string, unknown>)));
  }
  return { ok: true, products };
}

export async function applyProductSheet(ops: ProductSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (ops.length > 25) return { ok: false, message: "Terlalu banyak sekaligus (maks. 25 per kiriman)." };
  const def = productSheetDef();
  const cur = await fetchProductsForSheet(ops.filter((o) => o.id).map((o) => o.id));
  if (!cur.ok) return cur;
  const byId = new Map(cur.products.map((p) => [p.id, p]));
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";
  const supabase = await createClient();

  // Satu per satu (bukan paralel): beberapa baris bisa menyentuh produk yang sama (versi baru menutup versi lama).
  const results: ApplyResult[] = [];
  for (const op of ops) {
    const res = (status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
    try {
      let v: RowValues;
      if (op.op === "add") {
        v = {};
        for (const c of def.columns) v[c.header] = c.kind === "bool" ? "Tidak" : "";
      } else {
        const p = byId.get(op.id);
        if (!p) {
          results.push(res("skipped", "Versi produk sudah tidak ada atau tidak bisa Anda lihat."));
          continue;
        }
        v = rowValues(def, p);
        const stale = op.changes.find((ch) => !sameValue(kindOf(ch.col), v[ch.col] ?? "", ch.from));
        if (stale) {
          results.push(res("skipped", `Bentrok: kolom ${stale.col} sudah berubah di aplikasi sejak pratinjau.`));
          continue;
        }
      }
      for (const ch of op.changes) v[ch.col] = ch.to;
      const parsed = productInputFromValues(v);
      if (!("input" in parsed)) {
        results.push(res("failed", parsed.problems.join(" ")));
        continue;
      }
      let r: { ok: true } | { ok: false; message: string };
      let note = op.op === "add" ? "Ditambahkan." : "Diubah.";
      const code = (v[PH.code] ?? "").trim();
      if (op.op === "add" && code) {
        // Kode terisi = versi harga baru dari produk yang sudah ada.
        const { data: old, error } = await supabase.from("products").select("id").eq("code", code).order("valid_from", { ascending: false }).limit(1).maybeSingle();
        if (error) {
          results.push(res("failed", error.message));
          continue;
        }
        if (!old) {
          results.push(res("failed", `Kode produk "${code}" tidak dikenal. Kosongkan Kode untuk produk baru.`));
          continue;
        }
        r = await newProductVersion(old.id as string, parsed.input);
        note = "Versi harga baru ditambahkan (versi lama ditutup).";
      } else {
        r = await saveProduct(parsed.input, op.op === "add" ? null : op.id);
      }
      if (!r.ok) results.push(res(r.message.includes("tidak berhak") || r.message.includes("row-level") ? "skipped" : "failed", r.message));
      else results.push(res("ok", note));
    } catch (e) {
      results.push(res("failed", e instanceof Error ? e.message : "Kesalahan tak terduga."));
    }
  }
  return { ok: true, results };
}
