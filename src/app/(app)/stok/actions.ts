"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { getCurrentEmployee } from "@/lib/auth";
import type { StockItem, StockMoveKind } from "@/lib/sales";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { OPNAME_REF, SH, stockInputFromValues, stockSheetDef, type StockSheetCtx, type StockSheetOp, type StockSheetRow } from "@/lib/bulk-stock";

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

// ---------- Impor Excel: barang stok + stok opname (ekspor-ubah-impor massal) ----------
// Memakai saveStockItem dan addStockMove (penyesuaian) yang sama dengan form; hak ubah dijaga database (TechOps/Finance/admin).

async function loadStockCtx(): Promise<{ ok: true; ctx: StockSheetCtx } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("code, name, valid_from").order("valid_from");
  if (error) return { ok: false, message: `Gagal memuat produk: ${error.message}` };
  const latest = new Map<string, string>();
  for (const p of (data ?? []) as { code: string; name: string }[]) latest.set(p.code, p.name);
  return { ok: true, ctx: { products: [...latest].map(([code, name]) => ({ code, name })) } };
}

// Barang + stok tercatat saat ini (untuk mendeteksi bentrok dan menghitung selisih opname).
export async function fetchStockForSheet(ids: string[]): Promise<{ ok: true; rows: StockSheetRow[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const list = [...new Set(ids.filter(Boolean))];
  const supabase = await createClient();
  const [items, overview] = await Promise.all([
    supabase.from("stock_items").select("id, code, name, product_code, unit, min_qty, notes, is_active").in("id", list),
    supabase.rpc("stock_overview"),
  ]);
  if (items.error) return { ok: false, message: `Gagal memuat barang: ${items.error.message}` };
  if (overview.error) return { ok: false, message: `Gagal memuat stok: ${overview.error.message}` };
  const onHand = new Map(((overview.data ?? []) as { item_id: string; on_hand: number }[]).map((o) => [o.item_id, Number(o.on_hand)]));
  return { ok: true, rows: ((items.data ?? []) as StockItem[]).map((item) => ({ item, onHand: onHand.get(item.id) ?? 0 })) };
}

export async function applyStockSheet(ops: StockSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (ops.length > 25) return { ok: false, message: "Terlalu banyak sekaligus (maks. 25 per kiriman)." };
  const ctxRes = await loadStockCtx();
  if (!ctxRes.ok) return ctxRes;
  const ctx = ctxRes.ctx;
  const def = stockSheetDef(ctx);
  const cur = await fetchStockForSheet(ops.filter((o) => o.id).map((o) => o.id));
  if (!cur.ok) return cur;
  const byId = new Map(cur.rows.map((r) => [r.item.id, r]));
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";
  const rightsMsg = "Hanya TechOps / Finance yang bisa mengubah stok.";
  const isRights = (m: string) => m.includes("Hanya TechOps") || m.includes("row-level");

  const results = await Promise.all(
    ops.map(async (op): Promise<ApplyResult> => {
      const res = (status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
      try {
        let v: RowValues;
        let row: StockSheetRow | undefined;
        if (op.op === "add") {
          v = {};
          for (const c of def.columns) v[c.header] = c.kind === "bool" ? "Tidak" : "";
          if (op.changes.some((c) => c.col === SH.count && c.to !== "")) return res("failed", "Hitung fisik tidak bisa diisi untuk barang baru (stok awal 0; catat stok awal lewat Catat mutasi).");
        } else {
          row = byId.get(op.id);
          if (!row) return res("skipped", "Barang sudah tidak ada atau tidak bisa Anda lihat.");
          v = rowValues(def, row);
          const stale = op.changes.find((ch) => !sameValue(kindOf(ch.col), v[ch.col] ?? "", ch.from));
          if (stale) return res("skipped", `Bentrok: kolom ${stale.col} sudah berubah di aplikasi sejak pratinjau.`);
        }
        for (const ch of op.changes) v[ch.col] = ch.to;

        // Hitung fisik (opname): selisih terhadap stok tercatat SEKARANG; dilewati bila stok sudah bergerak sejak ekspor.
        const countText = (op.changes.find((c) => c.col === SH.count)?.to ?? "").trim();
        let physical: number | null = null;
        if (countText !== "") {
          physical = Number(countText);
          if (!Number.isSafeInteger(physical) || physical < 0) return res("failed", "Hitung fisik harus bilangan bulat 0 atau lebih.");
          if (row && op.expectOnHand !== undefined && Number(op.expectOnHand) !== row.onHand) {
            return res("skipped", `Stok tercatat berubah sejak ekspor (${op.expectOnHand} -> ${row.onHand}); hitungan fisik dilewati. Ekspor ulang lalu hitung lagi.`);
          }
        }

        const parsed = stockInputFromValues(v, ctx);
        if (!("input" in parsed)) return res("failed", parsed.problems.join(" "));
        const itemChanged = op.op === "add" || op.changes.some((c) => c.col !== SH.count);
        const parts: string[] = [];
        if (itemChanged) {
          const r = await saveStockItem(parsed.input, op.op === "add" ? null : op.id);
          if (!r.ok) return res(isRights(r.message) ? "skipped" : "failed", r.message);
          parts.push(op.op === "add" ? "Barang ditambahkan" : "Data barang diubah");
        }
        if (physical !== null && row) {
          const delta = physical - row.onHand;
          if (delta === 0) parts.push(`stok sudah sesuai (${physical})`);
          else {
            const r = await addStockMove(op.id, "adjust", delta, todayJakarta(), OPNAME_REF, `Opname via Excel: hitung fisik ${physical}, tercatat ${row.onHand}`);
            if (!r.ok) return res(isRights(r.message) ? "skipped" : "failed", parts.length ? `${r.message} (${parts.join(", ")} sudah tersimpan)` : r.message || rightsMsg);
            parts.push(`penyesuaian ${delta > 0 ? "+" : ""}${delta} (fisik ${physical}, tercatat ${row.onHand})`);
          }
        }
        return res("ok", parts.length ? `${parts.join("; ")}.` : "Tidak ada perubahan.");
      } catch (e) {
        return res("failed", e instanceof Error ? e.message : "Kesalahan tak terduga.");
      }
    }),
  );
  return { ok: true, results };
}
