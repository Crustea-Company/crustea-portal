"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { budgetFromRab, type BudgetKind, type StockMoveKind, type TxKind } from "@/lib/project-ledger";
import type { RabData } from "@/lib/aquaculture";

type Result = { ok: true } | { ok: false; message: string };

const done = (): Result => {
  revalidatePath("/projects/dashboard");
  return { ok: true };
};
const fail = (message: string): Result => ({ ok: false, message });
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const TX_KINDS: TxKind[] = ["income", "expense", "capex", "capital_in"];
const BUDGET_KINDS: BudgetKind[] = ["capex", "expense", "income"];

async function session() {
  const me = await getCurrentEmployee();
  return me ? await createClient() : null;
}

// Pesan RLS yang lebih jelas.
const denied = (msg: string) =>
  msg.includes("row-level security") ? "Anda tidak boleh mengubah data proyek ini (pencatat: tim AQ, F&A, admin, CEO, PIC proyek)." : msg;

// ---------- Jurnal ----------
export type TxInput = {
  tx_date: string;
  kind: TxKind;
  category: string;
  budget_line_id: string;
  description: string;
  qty: number | null;
  uom: string;
  unit_price: number | null;
  amount: number;
  cycle: number | null;
  pond: string;
  kg_per_sack: number | null;
  fish_per_kg: number | null;
  status: "paid" | "unpaid";
  proof: string;
  note: string;
};

function txRow(i: TxInput): { row: Record<string, unknown> } | { error: string } {
  if (!isDate(i.tx_date)) return { error: "Tanggal belum diisi." };
  if (!TX_KINDS.includes(i.kind)) return { error: "Pilih jenis transaksi." };
  if (!i.category.trim()) return { error: "Kategori belum diisi." };
  if (!i.description.trim()) return { error: "Uraian belum diisi." };
  const pos = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
  const qty = pos(i.qty);
  const price = i.unit_price !== null && Number.isFinite(i.unit_price) && i.unit_price >= 0 ? i.unit_price : null;
  const amount = qty !== null && price !== null ? Math.round(qty * price) : Math.round(i.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: "Jumlah (Rp) harus lebih dari 0." };
  const proof = clean(i.proof);
  if (proof && !/^https?:\/\//i.test(proof)) return { error: "Bukti harus berupa link (diawali http:// atau https://)." };
  return {
    row: {
      tx_date: i.tx_date,
      kind: i.kind,
      category: i.category.trim(),
      budget_line_id: i.kind === "capital_in" ? null : i.budget_line_id || null,
      description: i.description.trim(),
      qty,
      uom: clean(i.uom),
      unit_price: qty !== null ? price : null,
      amount,
      cycle: i.cycle && i.cycle > 0 ? Math.round(i.cycle) : null,
      pond: clean(i.pond),
      kg_per_sack: pos(i.kg_per_sack),
      fish_per_kg: pos(i.fish_per_kg),
      status: i.status === "unpaid" ? "unpaid" : "paid",
      proof,
      note: clean(i.note),
    },
  };
}

export async function saveTransaction(projectId: string, input: TxInput, id: string | null): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const r = txRow(input);
  if ("error" in r) return fail(r.error);
  const { data, error } = id
    ? await sb.from("project_transactions").update(r.row).eq("id", id).select("id")
    : await sb.from("project_transactions").insert({ ...r.row, project_id: projectId }).select("id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh mengubah transaksi ini.");
  return done();
}

export async function deleteTransaction(id: string): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const { data, error } = await sb.from("project_transactions").delete().eq("id", id).select("id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh menghapus transaksi ini.");
  return done();
}

// Impor banyak baris sekaligus (template laporan budidaya). Semua atau tidak sama sekali.
export async function importTransactions(projectId: string, rows: TxInput[]): Promise<Result & { count?: number }> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  if (rows.length === 0) return fail("Tidak ada baris untuk diimpor.");
  if (rows.length > 2000) return fail("Maksimal 2.000 baris sekali impor.");
  const list: Record<string, unknown>[] = [];
  for (const [i, x] of rows.entries()) {
    const r = txRow(x);
    if ("error" in r) return fail(`Baris ${i + 1}: ${r.error}`);
    list.push({ ...r.row, project_id: projectId });
  }
  const { error } = await sb.from("project_transactions").insert(list);
  if (error) return fail(denied(error.message));
  revalidatePath("/projects/dashboard");
  return { ok: true, count: list.length };
}

// ---------- Anggaran ----------
export type BudgetInput = { kind: BudgetKind; grp: string; item: string; note: string; qty: number; uom: string; price: number; sort: number };

function budgetRow(i: BudgetInput): { row: Record<string, unknown> } | { error: string } {
  if (!BUDGET_KINDS.includes(i.kind)) return { error: "Pilih jenis pos." };
  if (!i.grp.trim()) return { error: "Kelompok belum diisi." };
  if (!i.item.trim()) return { error: "Nama item belum diisi." };
  if (!Number.isFinite(i.qty) || i.qty < 0 || !Number.isFinite(i.price) || i.price < 0) return { error: "Jumlah/harga tidak valid." };
  return {
    row: { kind: i.kind, grp: i.grp.trim(), item: i.item.trim(), note: clean(i.note), qty: i.qty, uom: clean(i.uom), price: i.price, sort: Math.round(i.sort) || 0 },
  };
}

export async function saveBudgetLine(projectId: string, input: BudgetInput, id: string | null): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const r = budgetRow(input);
  if ("error" in r) return fail(r.error);
  const { data, error } = id
    ? await sb.from("project_budget_lines").update(r.row).eq("id", id).select("id")
    : await sb.from("project_budget_lines").insert({ ...r.row, project_id: projectId }).select("id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh mengubah anggaran ini.");
  return done();
}

export async function deleteBudgetLine(id: string): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const { data, error } = await sb.from("project_budget_lines").delete().eq("id", id).select("item");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh menghapus pos ini.");
  return done();
}

// Salin baris Capex, Modal kerja, Opex, dan Pendapatan dari paket RAB proyek (hanya bila anggaran masih kosong).
export async function copyBudgetFromRab(projectId: string): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const [{ data: p }, { count }] = await Promise.all([
    sb.from("aqua_projects").select("plan_id").eq("id", projectId).maybeSingle(),
    sb.from("project_budget_lines").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  if (!p?.plan_id) return fail("Proyek ini belum punya paket kelayakan & RAB.");
  if ((count ?? 0) > 0) return fail("Anggaran sudah berisi. Hapus dulu semua pos bila ingin menyalin ulang dari RAB.");
  const { data: plan } = await sb.from("requests").select("data").eq("id", p.plan_id).maybeSingle();
  const rows = budgetFromRab((plan?.data ?? {}) as RabData);
  if (rows.length === 0) return fail("RAB proyek belum punya baris biaya/pendapatan.");
  const { error } = await sb.from("project_budget_lines").insert(rows.map((r) => ({ ...r, project_id: projectId })));
  if (error) return fail(denied(error.message));
  return done();
}

// ---------- Stok ----------
export type StockItemInput = { kind: "material" | "product"; name: string; size: string; unit: string; plan_qty: number; sale_price: number; sort: number };

export async function saveStockItem(projectId: string, input: StockItemInput, id: string | null): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  if (!input.name.trim()) return fail("Nama barang belum diisi.");
  if (!["material", "product"].includes(input.kind)) return fail("Pilih jenis barang.");
  const row = {
    kind: input.kind,
    name: input.name.trim(),
    size: clean(input.size),
    unit: input.unit.trim() || (input.kind === "material" ? "kg" : "unit"),
    plan_qty: Math.max(0, input.plan_qty || 0),
    sale_price: Math.max(0, Math.round(input.sale_price || 0)),
    sort: Math.round(input.sort) || 0,
  };
  const { data, error } = id
    ? await sb.from("project_stock_items").update(row).eq("id", id).select("id")
    : await sb.from("project_stock_items").insert({ ...row, project_id: projectId }).select("id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh mengubah stok proyek ini.");
  return done();
}

export async function deleteStockItem(id: string): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const { count } = await sb.from("project_stock_moves").select("id", { count: "exact", head: true }).eq("item_id", id);
  if ((count ?? 0) > 0) return fail("Barang ini sudah punya transaksi stok. Hapus transaksinya dulu.");
  const { data, error } = await sb.from("project_stock_items").delete().eq("id", id).select("id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh menghapus barang ini.");
  return done();
}

export type StockMoveInput = {
  item_id: string;
  move_date: string;
  kind: StockMoveKind;
  qty: number;
  material_item_id: string;
  material_qty: number | null;
  channel: string;
  reference: string;
  note: string;
  // Terjual: catat juga pemasukan di jurnal (opsional).
  income: { amount: number; category: string } | null;
};

export async function addStockMove(projectId: string, input: StockMoveInput): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const sb = await createClient();
  if (!isDate(input.move_date)) return fail("Tanggal belum diisi.");
  if (!Number.isFinite(input.qty) || input.qty === 0 || (input.kind !== "adjust" && input.qty < 0)) {
    return fail(input.kind === "adjust" ? "Isi selisih opname (boleh minus), bukan 0." : "Jumlah harus lebih dari 0.");
  }
  let transactionId: string | null = null;
  if (input.kind === "sold" && input.income && input.income.amount > 0) {
    const { data: item } = await sb.from("project_stock_items").select("name, size, unit").eq("id", input.item_id).maybeSingle();
    const label = item ? `${item.name}${item.size ? ` ${item.size}` : ""}` : "produk";
    const { data, error } = await sb
      .from("project_transactions")
      .insert({
        project_id: projectId,
        tx_date: input.move_date,
        kind: "income",
        category: input.income.category.trim() || "Penjualan",
        description: `Penjualan ${label}${input.channel.trim() ? ` · ${input.channel.trim()}` : ""}`,
        qty: input.qty,
        uom: item?.unit ?? null,
        unit_price: Math.round(input.income.amount / input.qty),
        amount: Math.round(input.income.amount),
        status: "paid",
        note: clean(input.reference),
      })
      .select("id")
      .single();
    if (error) return fail(denied(error.message));
    transactionId = data.id as string;
  }
  const { error } = await sb.from("project_stock_moves").insert({
    project_id: projectId,
    item_id: input.item_id,
    move_date: input.move_date,
    kind: input.kind,
    qty: input.qty,
    material_item_id: input.kind === "pack" ? input.material_item_id || null : null,
    material_qty: input.kind === "pack" ? input.material_qty : null,
    channel: clean(input.channel),
    reference: clean(input.reference),
    note: clean(input.note),
    transaction_id: transactionId,
  });
  if (error) {
    if (transactionId) await sb.from("project_transactions").delete().eq("id", transactionId);
    return fail(denied(error.message));
  }
  return done();
}

export async function deleteStockMove(id: number): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const { data, error } = await sb.from("project_stock_moves").delete().eq("id", id).select("id, transaction_id");
  if (error) return fail(denied(error.message));
  if (!data?.length) return fail("Anda tidak boleh menghapus transaksi stok ini.");
  // Pemasukan jurnal yang dibuat bersama penjualan ini ikut dihapus.
  if (data[0].transaction_id) await sb.from("project_transactions").delete().eq("id", data[0].transaction_id);
  return done();
}

// ---------- Kode investor ----------
export async function createAccessCode(projectId: string, label: string, expires: string): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.") as { ok: false; message: string };
  const { data, error } = await sb.rpc("create_project_access_code", {
    p_project: projectId,
    p_label: label,
    p_expires: expires || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/projects/dashboard");
  return { ok: true, code: data as string };
}

export async function revokeAccessCode(id: string): Promise<Result> {
  const sb = await session();
  if (!sb) return fail("Sesi login berakhir. Silakan masuk lagi.");
  const { error } = await sb.rpc("revoke_project_access_code", { p_id: id });
  if (error) return fail(error.message);
  return done();
}
