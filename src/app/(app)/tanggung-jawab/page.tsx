import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayJakarta } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE, isOverdue, type TaskStatus } from "@/lib/tasks";
import { PROGRAM_STATUS, type ProgramStatus } from "@/lib/programs";
import { STAGE_LABEL, TYPE_LABEL, type AquaStage, type ProjectType } from "@/lib/aquaculture";
import { jobdescTerms, matchesJobdesc, type JobdescItem } from "@/lib/jobdesc";
import JobdescEditor from "./JobdescEditor";

export const metadata: Metadata = { title: "Tanggung Jawab - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskRow = {
  role: "pic" | "support";
  task: { id: string; code: string | null; title: string; workstream: string | null; status: TaskStatus; deadline: string | null; dept_code: string } | null;
};
type ProgramRow = { role: string | null; is_lead: boolean; program: { id: string; name: string; status: ProgramStatus } | null };
type ProjectRow = { id: string; number: string; name: string; type: ProjectType; stage: AquaStage };
type KpiRow = { id: number; objective_code: string; item: string; dept_code: string; is_done: boolean };
type Flag = { kind: string; label: string; href: string; note: string };

// Tanggung jawab per orang: jobdesc, program & peran, proyek, KPI, tugas berjalan, riwayat tugas selesai.
// Admin & CEO juga melihat penugasan yang tidak cocok dengan jobdesc.
export default async function TanggungJawabPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = (await getCurrentEmployee())!;
  const id = typeof sp.orang === "string" && /^[0-9a-f-]{36}$/i.test(sp.orang) ? sp.orang : me.id;
  const supabase = await createClient();
  const [empRes, jobRes, taskRes, progRes, projRes, kpiRes] = await Promise.all([
    supabase.from("employees").select("id, full_name, dept_code, job_title").eq("is_active", true).order("full_name"),
    supabase.from("employee_jobdesc").select("id, item, keywords, sort").eq("employee_id", id).order("sort"),
    supabase.from("task_people").select("role, task:tasks(id, code, title, workstream, status, deadline, dept_code)").eq("employee_id", id),
    supabase.from("program_people").select("role, is_lead, program:programs(id, name, status)").eq("employee_id", id),
    supabase.from("aqua_projects").select("id, number, name, type, stage").eq("pic_id", id).not("stage", "in", "(completed,cancelled)"),
    supabase.from("kpi_items").select("id, objective_code, item, dept_code, is_done").eq("pic_type", "person").eq("pic_id", id).order("objective_code"),
  ]);
  const people = (empRes.data ?? []) as { id: string; full_name: string; dept_code: string | null; job_title: string | null }[];
  const person = people.find((p) => p.id === id);
  const jobdesc = (jobRes.data ?? []) as JobdescItem[];
  const tasks = ((taskRes.data ?? []) as unknown as TaskRow[]).filter((t) => t.task);
  const programs = ((progRes.data ?? []) as unknown as ProgramRow[]).filter((p) => p.program);
  const projects = (projRes.data ?? []) as ProjectRow[];
  const kpis = (kpiRes.data ?? []) as KpiRow[];
  const today = todayJakarta();
  const boss = me.app_role === "admin" || me.app_role === "ceo";

  const running = tasks.filter((t) => t.task!.status !== "done").sort((a, b) => (a.task!.deadline ?? "9999").localeCompare(b.task!.deadline ?? "9999"));
  const done = tasks.filter((t) => t.task!.status === "done").sort((a, b) => (b.task!.deadline ?? "").localeCompare(a.task!.deadline ?? ""));
  const taskHref = (t: NonNullable<TaskRow["task"]>) => `/tugas?dept=${t.dept_code}&sprint=semua#task-${t.id}`;

  // Penugasan aktif yang tidak memuat kata kunci jobdesc (hanya untuk admin & CEO).
  const terms = jobdescTerms(jobdesc);
  const otherDept = (dept: string) => (person?.dept_code && dept !== person.dept_code ? ` · departemen lain (${dept})` : "");
  const flags: Flag[] = !boss || !terms.length
    ? []
    : [
        ...running
          .filter((t) => t.role === "pic" && !matchesJobdesc(`${t.task!.title} ${t.task!.workstream ?? ""}`, terms))
          .map((t) => ({ kind: "Tugas", label: `${t.task!.code ?? ""} ${t.task!.title}`.trim(), href: taskHref(t.task!), note: `PIC${otherDept(t.task!.dept_code)}` })),
        ...programs
          .filter((p) => ["planned", "active", "on_hold"].includes(p.program!.status) && !matchesJobdesc(`${p.program!.name} ${p.role ?? ""}`, terms))
          .map((p) => ({ kind: "Program", label: p.program!.name, href: `/program/${p.program!.id}`, note: p.role ? `peran ${p.role}` : p.is_lead ? "ketua" : "anggota" })),
        ...projects
          .filter((p) => !matchesJobdesc(`${p.name} ${TYPE_LABEL[p.type]}`, terms))
          .map((p) => ({ kind: "Proyek", label: `${p.number} ${p.name}`, href: `/projects/${p.id}`, note: "PIC proyek" })),
        ...kpis
          .filter((k) => !k.is_done && !matchesJobdesc(k.item, terms))
          .map((k) => ({ kind: "KPI", label: `${k.objective_code} ${k.item}`, href: `/kpi?dept=${k.dept_code}`, note: `PIC${otherDept(k.dept_code)}` })),
      ];

  const section = (title: string, count: number, children: React.ReactNode, open = false, tone = "border-slate-200") => (
    <details open={open} className={`group rounded-2xl border bg-white shadow-sm ${tone}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span className="flex items-center gap-2 text-sm text-slate-500">
          {count}
          <span className="transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-slate-100 p-4">{children}</div>
    </details>
  );
  const empty = (text: string) => <p className="text-sm text-slate-500">{text}</p>;
  const taskList = (rows: TaskRow[]) => (
    <ul className="flex flex-col divide-y divide-slate-100">
      {rows.map(({ role, task: t }) => (
        <li key={t!.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
          <Link href={taskHref(t!)} className="min-w-0 hover:text-brand-800 hover:underline">
            {t!.code && <span className="font-mono text-xs text-slate-500">{t!.code} </span>}
            {t!.title}
            <span className="text-xs text-slate-500"> · {role === "pic" ? "PIC" : "support"}</span>
          </Link>
          <span className="flex items-center gap-2 text-xs">
            {t!.deadline && <span className={isOverdue({ status: t!.status, deadline: t!.deadline }, today) ? "font-semibold text-red-700" : "text-slate-500"}>{formatDate(t!.deadline)}</span>}
            <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[t!.status]}`}>{STATUS_LABEL[t!.status]}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Tanggung jawab</p>
        <form action="/tanggung-jawab" className="flex flex-wrap gap-2">
          <select name="orang" defaultValue={id} aria-label="Pilih karyawan" className="min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
                {p.dept_code ? ` (${p.dept_code})` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            Lihat
          </button>
        </form>
        <h1 className="text-xl font-bold text-slate-900">{person?.full_name ?? "Karyawan tidak ditemukan"}</h1>
        {person?.job_title && <p className="-mt-1 text-sm text-slate-600">{person.job_title}</p>}
      </div>

      {boss &&
        terms.length > 0 &&
        section(
          "Di luar jobdesc (hanya admin & CEO)",
          flags.length,
          flags.length === 0 ? (
            empty("Semua penugasan aktif cocok dengan kata kunci jobdesc.")
          ) : (
            <>
              <p className="text-xs text-slate-500">Penugasan aktif yang tidak memuat kata kunci jobdesc. Periksa apakah memang perlu, atau tambahkan ke jobdesc.</p>
              <ul className="flex flex-col divide-y divide-slate-100">
                {flags.map((f) => (
                  <li key={`${f.kind}-${f.href}`} className="py-1.5 text-sm">
                    <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">{f.kind}</span>
                    <Link href={f.href} className="hover:text-brand-800 hover:underline">
                      {f.label}
                    </Link>
                    <span className="text-xs text-slate-500"> · {f.note}</span>
                  </li>
                ))}
              </ul>
            </>
          ),
          flags.length > 0,
          "border-amber-300",
        )}

      {section(
        "Jobdesc",
        jobdesc.length,
        <>
          {jobdesc.length === 0 ? (
            empty("Jobdesc belum diisi.")
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-800">
              {jobdesc.map((j) => (
                <li key={j.id}>
                  {j.item}
                  {boss && j.keywords && <span className="text-xs text-slate-400"> · kata kunci: {j.keywords}</span>}
                </li>
              ))}
            </ol>
          )}
          {boss && <JobdescEditor key={jobdesc.map((j) => j.id).join(",")} employeeId={id} items={jobdesc} />}
        </>,
        true,
      )}

      {section(
        "Program & peran",
        programs.length,
        programs.length === 0 ? (
          empty("Tidak terlibat di program mana pun.")
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {programs.map((p) => (
              <li key={p.program!.id} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
                <Link href={`/program/${p.program!.id}`} className="hover:text-brand-800 hover:underline">
                  {p.program!.name}
                </Link>
                <span className="text-xs text-slate-500">
                  {[p.is_lead && "Ketua", p.role, PROGRAM_STATUS[p.program!.status]].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ),
      )}

      {section(
        "Proyek & KPI",
        projects.length + kpis.length,
        <>
          {projects.length === 0 && kpis.length === 0 && empty("Bukan PIC proyek atau item KPI mana pun.")}
          <ul className="flex flex-col divide-y divide-slate-100">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
                <Link href={`/projects/${p.id}`} className="hover:text-brand-800 hover:underline">
                  {p.number} {p.name}
                </Link>
                <span className="text-xs text-slate-500">
                  {TYPE_LABEL[p.type]} · {STAGE_LABEL[p.stage]}
                </span>
              </li>
            ))}
            {kpis.map((k) => (
              <li key={k.id} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
                <Link href={`/kpi?dept=${k.dept_code}`} className={`hover:text-brand-800 hover:underline ${k.is_done ? "text-slate-500 line-through" : ""}`}>
                  <span className="font-mono text-xs text-slate-500">{k.objective_code}</span> {k.item}
                </Link>
                <span className="text-xs text-slate-500">KPI {k.dept_code}</span>
              </li>
            ))}
          </ul>
        </>,
      )}

      {section("Tugas berjalan", running.length, running.length === 0 ? empty("Tidak ada tugas berjalan.") : taskList(running), true)}
      {section("Riwayat tugas selesai", done.length, done.length === 0 ? empty("Belum ada tugas selesai.") : taskList(done))}
    </main>
  );
}
