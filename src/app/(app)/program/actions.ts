"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { HEALTH, PROGRAM_STATUS, sortPrograms, type Health, type ProgramStatus } from "@/lib/programs";
import { isIsoDate } from "@/lib/travel";
import { getCurrentEmployee } from "@/lib/auth";
import { rowValues, sameValue, type ApplyResult, type RowValues } from "@/lib/bulk-sheet";
import { MH, milestoneFromValues, milestoneSheetDef, type MilestoneSheetCtx, type MilestoneSheetOp, type MilestoneSheetRow } from "@/lib/bulk-milestones";
import type { Milestone } from "@/lib/programs";

type Result = { ok: true; id?: string } | { ok: false; message: string };
const denied = (msg: string) => (msg.includes("row-level") ? "Anda tidak berhak mengubah program ini." : msg);

function done(id?: string): Result {
  revalidatePath("/program");
  if (id) revalidatePath(`/program/${id}`);
  return { ok: true, id };
}

export type ProgramInput = {
  name: string;
  description: string;
  priority: number;
  status: ProgramStatus;
  start_date: string;
  end_date: string;
  people: { employee_id: string; role: string; is_lead: boolean }[];
};

// Buat (id null) atau ubah program beserta anggotanya. Prioritas dicek database (hanya pengatur prioritas).
export async function saveProgram(input: ProgramInput, id: string | null): Promise<Result> {
  if (!input.name.trim()) return { ok: false, message: "Nama program belum diisi." };
  if (!(input.status in PROGRAM_STATUS) || ![1, 2, 3].includes(input.priority)) return { ok: false, message: "Status/prioritas tidak valid." };
  for (const d of [input.start_date, input.end_date]) if (d && !isIsoDate(d)) return { ok: false, message: "Tanggal tidak valid." };
  if (input.start_date && input.end_date && input.end_date < input.start_date) return { ok: false, message: "Tanggal selesai sebelum tanggal mulai." };
  if (!input.people.some((p) => p.is_lead)) return { ok: false, message: "Pilih minimal satu ketua/PIC utama program." };
  const row = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    priority: input.priority,
    status: input.status,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
  };
  const supabase = await createClient();
  let programId = id;
  if (id) {
    const { data, error } = await supabase.from("programs").update(row).eq("id", id).select("id");
    if (error) return { ok: false, message: denied(error.message) };
    if (!data?.length) return { ok: false, message: "Anda tidak berhak mengubah program ini." };
  } else {
    const { data, error } = await supabase.from("programs").insert({ ...row, sort: 999 }).select("id").single();
    if (error) return { ok: false, message: denied(error.message) };
    programId = data.id as string;
  }
  // Simpan anggota dulu, baru keluarkan yang dihapus (ketua tidak kehilangan haknya di tengah jalan).
  const people = [...new Map(input.people.map((p) => [p.employee_id, p])).values()].map((p) => ({
    program_id: programId,
    employee_id: p.employee_id,
    role: p.role.trim() || null,
    is_lead: p.is_lead,
  }));
  const { error: upErr } = await supabase.from("program_people").upsert(people, { onConflict: "program_id,employee_id" });
  if (upErr) return { ok: false, message: denied(upErr.message) };
  const keep = people.map((p) => p.employee_id);
  const { error: delErr } = await supabase
    .from("program_people")
    .delete()
    .eq("program_id", programId!)
    .not("employee_id", "in", `(${keep.join(",")})`);
  if (delErr) return { ok: false, message: denied(delErr.message) };
  return done(programId!);
}

export async function deleteProgram(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("programs").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: denied(error.message) };
  if (!data?.length) return { ok: false, message: "Hanya admin, CEO, CTO, dan CMO yang boleh menghapus program." };
  return done();
}

// Naik/turun satu posisi di dalam kelompok prioritasnya (urutan dinomori ulang 1..n).
export async function moveProgram(id: string, dir: -1 | 1): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("programs").select("id, name, priority, sort").neq("status", "done").neq("status", "cancelled");
  if (error) return { ok: false, message: error.message };
  const me = data.find((p) => p.id === id);
  if (!me) return { ok: false, message: "Program tidak ditemukan." };
  const group = sortPrograms(data.filter((p) => p.priority === me.priority));
  const i = group.findIndex((p) => p.id === id);
  const j = i + dir;
  if (j < 0 || j >= group.length) return done();
  [group[i], group[j]] = [group[j], group[i]];
  for (const [k, p] of group.entries()) {
    if (p.sort === k + 1) continue;
    const { error: e } = await supabase.from("programs").update({ sort: k + 1 }).eq("id", p.id);
    if (e) return { ok: false, message: denied(e.message) };
  }
  return done();
}

export async function setPriority(id: string, priority: number): Promise<Result> {
  if (![1, 2, 3].includes(priority)) return { ok: false, message: "Prioritas tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.from("programs").update({ priority, sort: 999 }).eq("id", id);
  if (error) return { ok: false, message: denied(error.message) };
  return done(id);
}

export async function addProgramUpdate(id: string, health: Health, body: string): Promise<Result> {
  if (!(health in HEALTH)) return { ok: false, message: "Pilih kondisi program." };
  if (!body.trim()) return { ok: false, message: "Laporan status belum diisi." };
  const supabase = await createClient();
  const { error } = await supabase.from("program_updates").insert({ program_id: id, health, body: body.trim() });
  if (error) return { ok: false, message: error.message.includes("row-level") ? "Hanya anggota program yang bisa menulis laporan status." : error.message };
  return done(id);
}

export async function saveMilestone(programId: string, m: { title: string; due_date: string; pic_id: string }): Promise<Result> {
  if (!m.title.trim()) return { ok: false, message: "Judul milestone belum diisi." };
  if (m.due_date && !isIsoDate(m.due_date)) return { ok: false, message: "Tanggal tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("program_milestones")
    .insert({ program_id: programId, title: m.title.trim(), due_date: m.due_date || null, pic_id: m.pic_id || null });
  if (error) return { ok: false, message: error.message.includes("row-level") ? "Hanya anggota program yang bisa menambah milestone." : error.message };
  return done(programId);
}

export async function toggleMilestone(programId: string, milestoneId: number, isDone: boolean): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_milestones")
    .update({ done_at: isDone ? new Date().toISOString() : null })
    .eq("id", milestoneId)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Hanya anggota program yang bisa mengubah milestone." };
  return done(programId);
}

export async function deleteMilestone(programId: string, milestoneId: number): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("program_milestones").delete().eq("id", milestoneId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Hanya anggota program yang bisa menghapus milestone." };
  return done(programId);
}

// ---------- Impor Excel: milestone program (ekspor-ubah-impor massal) ----------
// Hak akses dijaga database (RLS write_program_milestones: anggota program / pengatur prioritas), sama dengan tombol di halaman.

const MS_SELECT = "id, title, due_date, pic_id, done_at, program_id, program:programs(name), pic:employees!program_milestones_pic_id_fkey(full_name)";
type MsRow = Milestone & { program_id: string; program: { name: string } | null };

export async function fetchMilestonesForSheet(ids: number[]): Promise<{ ok: true; rows: MilestoneSheetRow[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  const list = [...new Set(ids.filter((n) => Number.isInteger(n)))];
  const supabase = await createClient();
  const rows: MilestoneSheetRow[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.from("program_milestones").select(MS_SELECT).in("id", list.slice(i, i + 100));
    if (error) return { ok: false, message: `Gagal memuat milestone: ${error.message}` };
    for (const r of (data ?? []) as unknown as MsRow[]) rows.push({ m: r, programId: r.program_id, programName: r.program?.name ?? "" });
  }
  return { ok: true, rows };
}

export async function applyMilestoneSheet(ops: MilestoneSheetOp[]): Promise<{ ok: true; results: ApplyResult[] } | { ok: false; message: string }> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (ops.length > 25) return { ok: false, message: "Terlalu banyak sekaligus (maks. 25 per kiriman)." };
  const supabase = await createClient();
  const [progs, emps] = await Promise.all([supabase.from("programs").select("id, name"), supabase.from("employees").select("id, full_name").eq("is_active", true)]);
  if (progs.error || emps.error) return { ok: false, message: `Gagal memuat data pendukung: ${(progs.error ?? emps.error)!.message}` };
  const ctx: MilestoneSheetCtx = { programs: progs.data ?? [], employees: emps.data ?? [] };
  const def = milestoneSheetDef(ctx);
  const cur = await fetchMilestonesForSheet(ops.filter((o) => o.id).map((o) => Number(o.id)));
  if (!cur.ok) return cur;
  const byId = new Map(cur.rows.map((r) => [String(r.m.id), r]));
  const kindOf = (col: string) => def.columns.find((c) => c.header === col)?.kind ?? "text";
  const rightsMsg = "Hanya anggota program yang bisa mengubah milestone.";

  const results = await Promise.all(
    ops.map(async (op): Promise<ApplyResult> => {
      const res = (status: ApplyResult["status"], message: string): ApplyResult => ({ id: op.id, line: op.line, label: op.label, status, message });
      try {
        let v: RowValues;
        if (op.op === "add") {
          v = {};
          for (const c of def.columns) v[c.header] = c.kind === "bool" ? "Tidak" : "";
        } else {
          const row = byId.get(op.id);
          if (!row) return res("skipped", "Milestone sudah tidak ada atau tidak bisa Anda lihat.");
          v = rowValues(def, row);
          if (op.op === "delete") {
            const changed = op.baseline ? def.columns.filter((c) => !c.readOnly && !c.addOnly && !sameValue(c.kind, v[c.header] ?? "", op.baseline![c.header] ?? "")) : [];
            if (changed.length) return res("skipped", `Bentrok: diubah di aplikasi sejak ekspor (${changed.map((c) => c.header).join(", ")}).`);
            const r = await supabase.from("program_milestones").delete().eq("id", Number(op.id)).select("id");
            if (r.error) return res("failed", r.error.message);
            return r.data?.length ? res("ok", "Dihapus.") : res("skipped", rightsMsg);
          }
          for (const ch of op.changes) {
            if (!sameValue(kindOf(ch.col), v[ch.col] ?? "", ch.from)) return res("skipped", `Bentrok: kolom ${ch.col} sudah berubah di aplikasi sejak pratinjau.`);
          }
        }
        for (const ch of op.changes) v[ch.col] = ch.to;
        const parsed = milestoneFromValues(v, ctx, op.op === "add");
        if (!("input" in parsed)) return res("failed", parsed.problems.join(" "));
        const m = parsed.input;
        if (!m.title.trim()) return res("failed", "Judul milestone belum diisi.");
        if (m.due_date && !isIsoDate(m.due_date)) return res("failed", "Tanggal tidak valid.");
        const fields = { title: m.title.trim(), due_date: m.due_date || null, pic_id: m.pic_id || null };

        if (op.op === "add") {
          const r = await supabase.from("program_milestones").insert({ program_id: m.programId, ...fields, done_at: m.done ? new Date().toISOString() : null }).select("id");
          if (r.error) return r.error.message.includes("row-level") ? res("skipped", "Hanya anggota program yang bisa menambah milestone.") : res("failed", r.error.message);
          return res("ok", "Ditambahkan.");
        }
        // Ubah: hanya sentuh done_at bila kolom Selesai memang berubah (supaya tanggal selesai lama tidak tergeser).
        const patch: Record<string, unknown> = { ...fields };
        if (op.changes.some((c) => c.col === MH.done)) patch.done_at = m.done ? new Date().toISOString() : null;
        const r = await supabase.from("program_milestones").update(patch).eq("id", Number(op.id)).select("id");
        if (r.error) return res("failed", r.error.message);
        return r.data?.length ? res("ok", "Diubah.") : res("skipped", rightsMsg);
      } catch (e) {
        return res("failed", e instanceof Error ? e.message : "Kesalahan tak terduga.");
      }
    }),
  );
  revalidatePath("/program", "layout");
  return { ok: true, results };
}
