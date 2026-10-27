"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { StockMoveKind } from "@/lib/sales";

type SimpleResult = { ok: true } | { ok: false; message: string };

export type StockItemInput = {
  code: string;
  name: string;
  product_code: string;
  unit: string;
  min_qty: number;
  notes: string;
  is_active: boolean;
};

export async function saveStockItem(input: StockItemInput, id: string | null): Promise<SimpleResult> {
  const row = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    product_code: input.product_code || null,
    unit: input.unit.trim() || "unit",
    min_qty: input.min_qty,
    notes: input.notes.trim() || null,
    is_active: input.is_active,
  };
  if (!/^[A-Z0-9-]+$/.test(row.code)) return { ok: false, message: "Kode barang hanya huruf, angka, dan tanda minus (mis. AER-MINI)." };
  if (!row.name) return { ok: false, message: "Nama barang belum diisi." };
  if (!Number.isSafeInteger(row.min_qty) || row.min_qty < 0) return { ok: false, message: "Stok minimal tidak valid." };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("stock_items").update(row).eq("id", id).select("id")
    : await supabase.from("stock_items").insert(row).select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Kode barang sudah dipakai, atau produk ini sudah punya barang stok aktif." };
    return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  }
  if (!data?.length) return { ok: false, message: "Hanya TechOps / Finance yang bisa mengubah stok." };
  revalidatePath("/stok");
  return { ok: true };
}

// qty selalu positif dari form; tanda +/- ditentukan jenis mutasi (penyesuaian memakai tanda dari form).
export async function addStockMove(
  itemId: string,
  kind: StockMoveKind,
  qty: number,
  movedOn: string,
  reference: string,
  note: string,
): Promise<SimpleResult> {
  if (!Number.isSafeInteger(qty) || qty === 0) return { ok: false, message: "Jumlah tidak boleh 0." };
  if (kind !== "adjust" && qty < 0) return { ok: false, message: "Jumlah harus positif." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movedOn) || movedOn > todayJakarta()) {
    return { ok: false, message: "Tanggal belum diisi atau di masa depan." };
  }
  if (kind === "adjust" && !note.trim()) return { ok: false, message: "Tuliskan alasan penyesuaian (hasil stock opname)." };
  const supabase = await createClient();
  const { error } = await supabase.from("stock_moves").insert({
    item_id: itemId,
    kind,
    qty: kind === "out" ? -qty : qty,
    moved_on: movedOn,
    reference: reference.trim() || null,
    note: note.trim() || null,
  });
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  revalidatePath("/stok");
  return { ok: true };
}
