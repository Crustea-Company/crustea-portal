"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/travel";
import { TARGET_DIVISIONS } from "@/lib/kpi";

type Result = { ok: true } | { ok: false; message: string };

const denied = (msg: string) => (msg.includes("row-level") ? "Anda tidak berhak mengubah data ini." : msg);

// Centang selesai & catatan realisasi (PIC, head departemen, admin, CEO; dicek database).
export async function updateKpiItem(id: number, isDone: boolean, note: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_kpi_item", { p_id: id, p_is_done: isDone, p_note: note });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/kpi");
  return { ok: true };
}

// ---------- Pendapatan (F&A, admin, CEO) ----------

export type RevenueInput = {
  revenue_date: string;
  amount: number;
  allocation: string; // "" = belum dipilih
  status: "paid" | "unpaid";
  description: string;
};

export async function saveRevenue(input: RevenueInput, id: string | null): Promise<Result> {
  if (!isIsoDate(input.revenue_date)) return { ok: false, message: "Tanggal belum diisi." };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { ok: false, message: "Nilai belum diisi." };
  if (input.status !== "paid" && input.status !== "unpaid") return { ok: false, message: "Pilih status." };
  if (!input.description.trim()) return { ok: false, message: "Keterangan belum diisi." };
  const row = {
    revenue_date: input.revenue_date,
    amount: input.amount,
    allocation: input.allocation.trim() || null,
    status: input.status,
    description: input.description.trim(),
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("revenues").update(row).eq("id", id).select("id")
    : await supabase.from("revenues").insert(row).select("id");
  if (error) return { ok: false, message: denied(error.message) };
  if (!data?.length) return { ok: false, message: "Anda tidak berhak mencatat pendapatan." };
  revalidatePath("/kpi/target");
  return { ok: true };
}

export async function deleteRevenue(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("revenues").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: denied(error.message) };
  if (!data?.length) return { ok: false, message: "Anda tidak berhak menghapus pendapatan." };
  revalidatePath("/kpi/target");
  return { ok: true };
}

// ---------- Target kuartal (admin, CEO) ----------

export type SourceInput = {
  id: number | null;
  name: string;
  division: string;
  weight: number | null; // persen
  target_amount: number | null; // target alokasi tetap (Rp), menggantikan bobot x total
  alloc_label: string;
  from_sales: boolean;
  strategies: {
    id: number | null;
    strategy: string;
    projection: number;
    note: string;
    realization: number | null;
    realization_note: string;
  }[];
};

export type TargetInput = { total: number; notes: string; sources: SourceInput[] };

function checkTarget(input: TargetInput): string | null {
  if (!Number.isSafeInteger(input.total) || input.total < 0) return "Target total tidak valid.";
  const labels = new Set<string>();
  for (const s of input.sources) {
    if (!s.name.trim()) return "Nama sumber belum diisi.";
    if (!(TARGET_DIVISIONS as readonly string[]).includes(s.division)) return `Divisi PIC untuk "${s.name}" belum dipilih.`;
    if (s.weight != null && (!Number.isFinite(s.weight) || s.weight < 0 || s.weight > 100)) return `Bobot "${s.name}" harus 0-100%.`;
    if (s.target_amount != null && (!Number.isSafeInteger(s.target_amount) || s.target_amount < 0)) return `Target alokasi "${s.name}" tidak valid.`;
    const label = (s.alloc_label.trim() || s.name.trim()).toLowerCase();
    if (labels.has(label)) return `Label alokasi "${label}" dipakai dua kali.`;
    labels.add(label);
    for (const g of s.strategies) {
      if (!g.strategy.trim()) return `Nama strategi di "${s.name}" belum diisi.`;
      if (!Number.isSafeInteger(g.projection) || g.projection < 0) return `Proyeksi di "${s.name}" tidak valid.`;
      if (g.realization != null && (!Number.isSafeInteger(g.realization) || g.realization < 0)) return `Realisasi di "${s.name}" tidak valid.`;
    }
  }
  if (input.sources.filter((s) => s.from_sales).length > 1) return "Hanya satu sumber yang boleh mengambil data Penjualan.";
  return null;
}

// Simpan seluruh isi satu kuartal: total, sumber, strategi. Yang dihapus dari form ikut dihapus.
export async function saveTarget(targetId: number, input: TargetInput): Promise<Result> {
  const err = checkTarget(input);
  if (err) return { ok: false, message: err };
  const supabase = await createClient();

  const { data: t, error: tErr } = await supabase
    .from("quarter_targets")
    .update({ total: input.total, notes: input.notes.trim() || null })
    .eq("id", targetId)
    .select("id");
  if (tErr) return { ok: false, message: denied(tErr.message) };
  if (!t?.length) return { ok: false, message: "Hanya admin dan CEO yang boleh mengubah target." };

  const { data: existing } = await supabase.from("target_sources").select("id").eq("target_id", targetId);
  const keep = new Set(input.sources.flatMap((s) => (s.id ? [s.id] : [])));
  const drop = (existing ?? []).map((r) => r.id as number).filter((id) => !keep.has(id));
  if (drop.length) {
    const { error } = await supabase.from("target_sources").delete().in("id", drop);
    if (error) return { ok: false, message: error.message };
  }
  // Lepas tanda from_sales dulu supaya indeks unik tidak bentrok saat dipindah ke sumber lain.
  await supabase.from("target_sources").update({ from_sales: false }).eq("target_id", targetId);

  for (const [i, s] of input.sources.entries()) {
    const row = {
      target_id: targetId,
      name: s.name.trim(),
      division: s.division,
      weight: s.weight,
      target_amount: s.target_amount,
      alloc_label: s.alloc_label.trim() || s.name.trim(),
      from_sales: s.from_sales,
      sort: i + 1,
    };
    const res = s.id
      ? await supabase.from("target_sources").update(row).eq("id", s.id).select("id").single()
      : await supabase.from("target_sources").insert(row).select("id").single();
    if (res.error) return { ok: false, message: res.error.message };
    const sourceId = res.data.id as number;

    const { data: oldG } = await supabase.from("target_strategies").select("id").eq("source_id", sourceId);
    const keepG = new Set(s.strategies.flatMap((g) => (g.id ? [g.id] : [])));
    const dropG = (oldG ?? []).map((r) => r.id as number).filter((id) => !keepG.has(id));
    if (dropG.length) await supabase.from("target_strategies").delete().in("id", dropG);
    for (const [j, g] of s.strategies.entries()) {
      const gRow = {
        source_id: sourceId,
        strategy: g.strategy.trim(),
        projection: g.projection,
        note: g.note.trim() || null,
        realization: g.realization,
        realization_note: g.realization_note.trim() || null,
        sort: j + 1,
      };
      const gRes = g.id
        ? await supabase.from("target_strategies").update(gRow).eq("id", g.id)
        : await supabase.from("target_strategies").insert(gRow);
      if (gRes.error) return { ok: false, message: gRes.error.message };
    }
  }
  revalidatePath("/kpi/target");
  return { ok: true };
}

// Kuartal baru: sumber, bobot, dan strategi disalin dari kuartal terakhir (proyeksi, realisasi, dan target tetap dikosongkan).
export async function createQuarter(year: number, quarter: number, total: number): Promise<Result & { id?: number }> {
  if (!Number.isInteger(year) || year < 2024 || year > 2100 || ![1, 2, 3, 4].includes(quarter)) {
    return { ok: false, message: "Tahun/kuartal tidak valid." };
  }
  if (!Number.isSafeInteger(total) || total < 0) return { ok: false, message: "Target total tidak valid." };
  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("quarter_targets")
    .select("id")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: t, error } = await supabase.from("quarter_targets").insert({ year, quarter, total }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, message: `Target Q${quarter} ${year} sudah ada.` };
    return { ok: false, message: denied(error.message) };
  }
  if (prev) {
    const { data: sources } = await supabase
      .from("target_sources")
      .select("name, division, weight, alloc_label, from_sales, sort, target_strategies(strategy, note, sort)")
      .eq("target_id", prev.id);
    for (const s of sources ?? []) {
      const { target_strategies: strategies, ...rest } = s as typeof s & { target_strategies: { strategy: string; note: string | null; sort: number }[] };
      const { data: ns } = await supabase.from("target_sources").insert({ ...rest, target_id: t.id }).select("id").single();
      if (ns && strategies.length) {
        await supabase.from("target_strategies").insert(strategies.map((g) => ({ ...g, source_id: ns.id, projection: 0 })));
      }
    }
  }
  revalidatePath("/kpi/target");
  return { ok: true, id: t.id as number };
}
