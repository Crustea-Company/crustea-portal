"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { getCurrentEmployee } from "@/lib/auth";
import { ASSET_CATEGORIES, ASSET_COLUMNS, toAsset, type Asset, type AssetCategory } from "@/lib/sales";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { assetInputFromValues, assetSheetDef, type AssetSheetOp } from "@/lib/bulk-assets";

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

// ---------- Impor Excel: aset (ekspor-ubah-impor massal) ----------
// Memakai saveAsset yang sama dengan form; hak ubah dijaga database (TechOps/Finance/admin). Status & hapus tidak bisa lewat file.

export async function fetchAssetsForSheet(ids: string[]): Promise<{ ok: true; assets: Asset[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const list = [...new Set(ids.filter(Boolean))];
  const supabase = await createClient();
  const assets: Asset[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.from("assets").select(ASSET_COLUMNS).in("id", list.slice(i, i + 100));
    if (error) return { ok: false, message: `Gagal memuat aset: ${error.message}` };
    assets.push(...(data as unknown as Record<string, unknown>[]).map(toAsset));
  }
  return { ok: true, assets };
}

export async function applyAssetSheet(ops: AssetSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (ops.length > 25) return { ok: false, message: "Terlalu banyak sekaligus (maks. 25 per kiriman)." };
  const def = assetSheetDef();
  const cur = await fetchAssetsForSheet(ops.filter((o) => o.id).map((o) => o.id));
  if (!cur.ok) return cur;
  const byId = new Map(cur.assets.map((a) => [a.id, a]));
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";

  const results = await Promise.all(
    ops.map(async (op): Promise<ApplyResult> => {
      const res = (status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
      try {
        let v: RowValues;
        if (op.op === "add") {
          v = {};
          for (const c of def.columns) v[c.header] = c.kind === "bool" ? "Tidak" : "";
        } else {
          const a = byId.get(op.id);
          if (!a) return res("skipped", "Aset sudah tidak ada atau tidak bisa Anda lihat.");
          v = rowValues(def, a);
          const stale = op.changes.find((ch) => !sameValue(kindOf(ch.col), v[ch.col] ?? "", ch.from));
          if (stale) return res("skipped", `Bentrok: kolom ${stale.col} sudah berubah di aplikasi sejak pratinjau.`);
        }
        for (const ch of op.changes) v[ch.col] = ch.to;
        const parsed = assetInputFromValues(v);
        if (!("input" in parsed)) return res("failed", parsed.problems.join(" "));
        const r = await saveAsset(parsed.input, op.op === "add" ? null : op.id);
        if (!r.ok) return res(r.message.includes("Hanya TechOps") ? "skipped" : "failed", r.message);
        return res("ok", op.op === "add" ? "Ditambahkan." : "Diubah.");
      } catch (e) {
        return res("failed", e instanceof Error ? e.message : "Kesalahan tak terduga.");
      }
    }),
  );
  return { ok: true, results };
}
