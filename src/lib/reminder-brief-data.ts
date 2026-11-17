// Pemuat data Reminder. Memakai client pengguna, jadi aturan akses (RLS) tetap berlaku.
// Hak "semua"/"departemen" dicek di sini (server), bukan hanya di tampilan.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee } from "@/lib/auth";
import {
  KIND_LABEL,
  REQUEST_COLUMNS,
  faReviewStage,
  statusLabel,
  type RequestRow,
} from "@/lib/requests";
import { addDays, SOON_WINDOW_DAYS, type FlashItem } from "@/lib/reminder-brief";

export type FlashScope = { mine: string } | { dept: string } | "all";
export type FlashScopeRequest = "saya" | "dept" | "semua";

const NO_DEPT = "PROGRAM";

/** Ubah permintaan tab (?flash=) menjadi cakupan yang benar-benar boleh dilihat orang ini. */
export function resolveScope(me: Employee, requested: FlashScopeRequest): FlashScope {
  const wide = me.app_role === "admin" || me.app_role === "ceo";
  if (requested === "semua" && wide) return "all";
  if (requested === "dept" && me.dept_code && (wide || me.app_role === "head")) {
    return { dept: me.dept_code };
  }
  return { mine: me.id };
}

/** Siapa/apa yang ditunggu pengajuan ini, diturunkan dari jenis dan statusnya. */
export function requestWaitingOn(r: Pick<RequestRow, "kind" | "status">): string {
  if (r.status === "ceo_review") return "Persetujuan CEO";
  if (r.status === "needs_revision") return "Perbaikan oleh pemohon";
  if (r.kind === "travel") {
    if (r.status === "submitted") return "Persetujuan penugas";
    if (r.status === "assigner_approved") return "Surat tugas (HR)";
  }
  if (r.kind === "procurement") {
    if (r.status === "submitted") return "Persetujuan head";
    if (r.status === "head_approved") return "Perbandingan vendor (TechOps)";
  }
  if (faReviewStage(r) === "now" || r.status === "in_review") return "Review F&A";
  return statusLabel(r.status, r.kind);
}

// Tindakan yang menunggu orang ini menurut perannya sendiri (sama dengan AttentionPanel).
function waitingOnMe(me: Employee, r: RequestRow): boolean {
  if (me.dept_code === "FA" && faReviewStage(r) === "now") return true;
  if (me.app_role === "ceo" && r.status === "ceo_review") return true;
  if (r.kind === "travel" && r.status === "submitted" && r.assigner_id === me.id) return true;
  if (r.kind === "procurement" && r.status === "submitted" && me.app_role === "head" && me.dept_code === r.dept_code) {
    return true;
  }
  if (r.kind === "procurement" && r.status === "head_approved" && me.dept_code === "TO") return true;
  return false;
}

// sla_due berupa waktu (UTC); tenggatnya dihitung menurut tanggal Jakarta (UTC+7).
function slaDate(sla: string): string {
  return new Date(Date.parse(sla) + 7 * 3_600_000).toISOString().slice(0, 10);
}

type EmpLite = { id: string; full_name: string; dept_code: string | null };

type TaskRow = {
  id: string;
  dept_code: string;
  title: string;
  deadline: string | null;
  task_people: { employee_id: string; role: "pic" | "support" }[];
};

type MilestoneRow = {
  id: number;
  program_id: string;
  title: string;
  due_date: string | null;
  pic_id: string | null;
  programs: { name: string; status: string } | null;
};

type ProgramRow = {
  id: string;
  name: string;
  end_date: string | null;
  program_people: { employee_id: string; is_lead: boolean }[];
};

const OPEN_PROGRAM = ["planned", "active", "on_hold"];

/**
 * Pekerjaan bertenggat sampai 3 hari ke depan (termasuk yang sudah lewat; yang lewat > 7 hari
 * tetap ikut dimuat supaya bisa dihitung jumlahnya oleh groupFlash). Lead dan proyek tidak
 * didaftar (tidak punya tenggat): tampilan hanya menaruh tautan tetap.
 */
export async function loadFlash(
  supabase: SupabaseClient,
  { me, today, scope }: { me: Employee; today: string; scope: FlashScope },
): Promise<FlashItem[]> {
  // Hak dicek ulang di server: cakupan lebih luas dari hak dipaksa menjadi "saya".
  let eff: FlashScope = scope;
  if (scope === "all" && !(me.app_role === "admin" || me.app_role === "ceo")) {
    eff = { mine: me.id };
  } else if (typeof scope === "object" && "dept" in scope) {
    const wide = me.app_role === "admin" || me.app_role === "ceo";
    const ownHead = me.app_role === "head" && me.dept_code === scope.dept;
    if (!wide && !ownHead) eff = { mine: me.id };
  } else if (typeof scope === "object" && "mine" in scope && scope.mine !== me.id) {
    eff = { mine: me.id };
  }

  const end = addDays(today, SOON_WINDOW_DAYS);

  const [tasksRes, msRes, progRes, reqRes, empRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, dept_code, title, deadline, task_people(employee_id, role)")
      .neq("status", "done")
      .not("deadline", "is", null)
      .lte("deadline", end),
    supabase
      .from("program_milestones")
      .select("id, program_id, title, due_date, pic_id, programs(name, status)")
      .is("done_at", null)
      .not("due_date", "is", null)
      .lte("due_date", end),
    supabase
      .from("programs")
      .select("id, name, end_date, program_people(employee_id, is_lead)")
      .in("status", OPEN_PROGRAM)
      .not("end_date", "is", null)
      .lte("end_date", end),
    supabase
      .from("requests")
      .select(REQUEST_COLUMNS)
      .not("status", "in", "(draft,completed,rejected)"),
    supabase.from("employees").select("id, full_name, dept_code"),
  ]);

  const emps = new Map<string, EmpLite>(
    ((empRes.data ?? []) as EmpLite[]).map((e) => [e.id, e]),
  );
  const nameOf = (id: string) => emps.get(id)?.full_name;
  const names = (ids: string[]) => ids.flatMap((id) => nameOf(id) ?? []);

  const mineId = typeof eff === "object" && "mine" in eff ? eff.mine : null;
  const deptOnly = typeof eff === "object" && "dept" in eff ? eff.dept : null;

  const items: FlashItem[] = [];

  // ----- Tugas -----
  for (const t of (tasksRes.data ?? []) as unknown as TaskRow[]) {
    const pics = t.task_people.filter((p) => p.role === "pic").map((p) => p.employee_id);
    if (mineId && !pics.includes(mineId)) continue;
    if (deptOnly && t.dept_code !== deptOnly) continue;
    items.push({
      kind: "task",
      id: t.id,
      code: "",
      title: t.title,
      dept_code: t.dept_code,
      people: names(pics),
      due: t.deadline as string,
      href: `/tugas?${new URLSearchParams({ dept: t.dept_code, sprint: "semua" })}#task-${t.id}`,
    });
  }

  // ----- Milestone program -----
  for (const m of (msRes.data ?? []) as unknown as MilestoneRow[]) {
    if (!m.programs || !OPEN_PROGRAM.includes(m.programs.status)) continue;
    const pic = m.pic_id ? emps.get(m.pic_id) : undefined;
    const dept = pic?.dept_code ?? NO_DEPT;
    if (mineId && m.pic_id !== mineId) continue;
    if (deptOnly && dept !== deptOnly) continue;
    items.push({
      kind: "milestone",
      id: `ms-${m.id}`,
      code: "",
      title: `${m.title} (${m.programs.name})`,
      dept_code: dept,
      people: pic ? [pic.full_name] : [],
      due: m.due_date as string,
      href: `/program/${m.program_id}`,
    });
  }

  // ----- Program (tenggat = tanggal selesai) -----
  for (const p of (progRes.data ?? []) as unknown as ProgramRow[]) {
    const leads = p.program_people.filter((x) => x.is_lead).map((x) => x.employee_id);
    if (mineId && !leads.includes(mineId)) continue;
    const dept = (leads.length ? emps.get(leads[0])?.dept_code : null) ?? NO_DEPT;
    if (deptOnly && dept !== deptOnly) continue;
    items.push({
      kind: "program",
      id: `pg-${p.id}`,
      code: "",
      title: p.name,
      dept_code: dept,
      people: names(leads),
      due: p.end_date as string,
      href: `/program/${p.id}`,
    });
  }

  // ----- Pengajuan (tenggat = batas SLA) -----
  for (const r of (reqRes.data ?? []) as unknown as RequestRow[]) {
    if (!r.sla_due) continue;
    const due = slaDate(r.sla_due);
    if (due > end) continue;
    const dept = r.dept_code ?? emps.get(r.requester_id)?.dept_code ?? NO_DEPT;
    if (mineId && r.requester_id !== mineId && !waitingOnMe(me, r)) continue;
    if (deptOnly && dept !== deptOnly) continue;
    items.push({
      kind: "request",
      id: r.id,
      code: r.number,
      title: KIND_LABEL[r.kind], // sengaja bukan judul bebas
      dept_code: dept,
      people: [],
      due,
      href: `/pengajuan/${r.id}`,
      waitingOn: requestWaitingOn(r),
    });
  }

  return items;
}
