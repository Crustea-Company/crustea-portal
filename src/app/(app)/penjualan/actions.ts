"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { LEAD_COLUMNS, LEAD_SOURCES, MAX_LEAD_ITEMS, toLead, type Lead, type LeadInput, type LeadStage } from "@/lib/sales";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { LH, leadInputFromValues, leadSheetDef, type LeadSheetCtx, type LeadSheetOp } from "@/lib/bulk-leads";

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
    // Database menghitung ringkasan (produk pertama, total unit, total nilai) dari baris produk.
    items: input.items.map((it) => ({ product_code: it.product_code || null, units: it.units, value: it.value })),
    sales_id: input.sales_id || me.id,
    notes: input.notes.trim() || null,
  };
  if (!(row.source in LEAD_SOURCES)) return { ok: false, message: "Pilih sumber lead." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.lead_date)) return { ok: false, message: "Tanggal lead masuk belum diisi." };
  if (row.lead_date > todayJakarta()) return { ok: false, message: "Tanggal lead masuk tidak boleh di masa depan." };
  if (!row.customer) return { ok: false, message: "Nama customer belum diisi." };
  if (row.source === "referral" && !row.referral_code) return { ok: false, message: "Lead dari referral wajib diisi kode referralnya." };
  if (row.items.length === 0) return { ok: false, message: "Isi minimal satu produk." };
  if (row.items.length > MAX_LEAD_ITEMS) return { ok: false, message: `Maksimal ${MAX_LEAD_ITEMS} produk per lead.` };
  for (const [i, it] of row.items.entries()) {
    if (!Number.isSafeInteger(it.units) || it.units < 1) return { ok: false, message: `Produk ${i + 1}: jumlah unit minimal 1.` };
    if (!Number.isSafeInteger(it.value) || it.value < 0) return { ok: false, message: `Produk ${i + 1}: nilai tidak valid.` };
  }

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

// ---------- Impor Excel: lead penjualan (ekspor-ubah-impor massal) ----------
// Memakai saveLead yang sama dengan form (validasi lengkap; hak ubah dijaga database). Tahap & hapus tidak bisa lewat file.

export async function fetchLeadsForSheet(ids: string[]): Promise<{ ok: true; leads: Lead[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const list = [...new Set(ids.filter(Boolean))];
  const supabase = await createClient();
  const leads: Lead[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.from("sales_leads").select(LEAD_COLUMNS).in("id", list.slice(i, i + 100));
    if (error) return { ok: false, message: `Gagal memuat lead: ${error.message}` };
    leads.push(...(data as unknown as Record<string, unknown>[]).map(toLead));
  }
  return { ok: true, leads };
}

export async function applyLeadSheet(ops: LeadSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (ops.length > 25) return { ok: false, message: "Terlalu banyak sekaligus (maks. 25 per kiriman)." };
  const supabase = await createClient();
  const [prods, emps] = await Promise.all([
    supabase.from("products").select("code, name, valid_from").order("valid_from"),
    supabase.from("employees").select("id, full_name").eq("is_active", true),
  ]);
  if (prods.error || emps.error) return { ok: false, message: `Gagal memuat data pendukung: ${(prods.error ?? emps.error)!.message}` };
  // Nama produk per kode = versi terbaru (sama dengan halaman Penjualan).
  const latest = new Map<string, string>();
  for (const p of (prods.data ?? []) as { code: string; name: string }[]) latest.set(p.code, p.name);
  const ctx: LeadSheetCtx = { products: [...latest].map(([code, name]) => ({ code, name })), employees: emps.data ?? [] };
  const def = leadSheetDef(ctx);
  const cur = await fetchLeadsForSheet(ops.filter((o) => o.id).map((o) => o.id));
  if (!cur.ok) return cur;
  const byId = new Map(cur.leads.map((l) => [l.id, l]));
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";

  const results = await Promise.all(
    ops.map(async (op): Promise<ApplyResult> => {
      const res = (status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
      try {
        let v: RowValues;
        let keepItems: Lead["items"] | null = null;
        if (op.op === "add") {
          v = {};
          for (const c of def.columns) v[c.header] = c.kind === "bool" ? "Tidak" : "";
        } else {
          const lead = byId.get(op.id);
          if (!lead) return res("skipped", "Lead sudah tidak ada atau tidak bisa Anda lihat.");
          v = rowValues(def, lead);
          for (const ch of op.changes) {
            if (!sameValue(kindOf(ch.col), v[ch.col] ?? "", ch.from)) return res("skipped", `Bentrok: kolom ${ch.col} sudah berubah di aplikasi sejak pratinjau.`);
          }
          // Lead banyak produk / sudah closing: baris produk dibiarkan seperti di database.
          if (def.lockedColumns?.(v).includes(LH.product)) keepItems = lead.items;
        }
        for (const ch of op.changes) v[ch.col] = ch.to;
        if (op.op === "update" && !(v[LH.sales] ?? "").trim()) return res("failed", "PIC sales tidak boleh dikosongkan.");
        const parsed = leadInputFromValues(v, ctx, keepItems);
        if (!("input" in parsed)) return res("failed", parsed.problems.join(" "));
        const r = await saveLead(parsed.input, op.op === "add" ? null : op.id);
        if (!r.ok) return res(r.message.includes("tidak boleh mengubah") ? "skipped" : "failed", r.message);
        return res("ok", op.op === "add" ? "Ditambahkan." : "Diubah.");
      } catch (e) {
        return res("failed", e instanceof Error ? e.message : "Kesalahan tak terduga.");
      }
    }),
  );
  return { ok: true, results };
}
