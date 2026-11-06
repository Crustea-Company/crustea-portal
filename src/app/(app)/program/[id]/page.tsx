import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayJakarta } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE, type TaskStatus } from "@/lib/tasks";
import {
  HEALTH,
  HEALTH_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  PROGRAM_COLUMNS,
  PROGRAM_STATUS,
  canPrioritize,
  isLead,
  isMember,
  type Health,
  type Program,
} from "@/lib/programs";
import { EditProgram, Milestones, UpdateForm } from "../ProgramPanels";

export const metadata: Metadata = { title: "Program - Crustea Portal" };

type Update = { id: number; health: Health; body: string; created_at: string; author: { full_name: string } | null };
type TaskRow = { id: string; code: string | null; title: string; status: TaskStatus; deadline: string | null; dept_code: string };

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [programRes, updateRes, taskRes, peopleRes] = await Promise.all([
    supabase.from("programs").select(PROGRAM_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("program_updates")
      .select("id, health, body, created_at, author:employees!program_updates_author_id_fkey(full_name)")
      .eq("program_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, code, title, status, deadline, dept_code").eq("program_id", id).order("deadline"),
    supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const p = programRes.data as unknown as Program | null;
  if (!p) notFound();
  const updates = (updateRes.data ?? []) as unknown as Update[];
  const tasks = (taskRes.data ?? []) as TaskRow[];
  const people = (peopleRes.data ?? []) as { id: string; full_name: string }[];
  const prioritizer = canPrioritize(me);
  const canEdit = prioritizer || isLead(me, p);
  const member = prioritizer || isMember(me, p);
  const today = todayJakarta();
  const milestones = [...p.program_milestones].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const card = "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY_STYLE[p.priority]}`}>Prioritas {PRIORITY_LABEL[p.priority]}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{PROGRAM_STATUS[p.status]}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${HEALTH_STYLE[p.health]}`}>{HEALTH[p.health]}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{p.name}</h1>
        <p className="text-sm text-slate-600">
          {p.start_date || p.end_date ? `${formatDate(p.start_date)} – ${formatDate(p.end_date)}` : "Tanpa tanggal"}
        </p>
        {p.description && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{p.description}</p>}
        {canEdit && <EditProgram program={p} people={people} canPrioritize={prioritizer} />}
      </div>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">PIC & anggota</h2>
        {p.program_people.length === 0 && <p className="text-sm text-slate-500">Belum ada anggota.</p>}
        <ul className="flex flex-wrap gap-2">
          {[...p.program_people]
            .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
            .map((x) => (
              <li key={x.employee_id} className={`rounded-full px-3 py-1 text-sm ${x.is_lead ? "bg-brand-100 font-semibold text-brand-800" : "bg-slate-100 text-slate-700"}`}>
                {x.employee?.full_name ?? "-"}
                {x.role && <span className="font-normal"> · {x.role}</span>}
                {x.is_lead && <span className="font-normal"> · ketua</span>}
              </li>
            ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Timeline & milestone</h2>
        <Milestones programId={p.id} milestones={milestones} people={people} canEdit={member} today={today} />
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Tugas terkait</h2>
          <span className="text-xs text-slate-500">Kaitkan lewat form Tugas → pilihan Program</span>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada tugas yang dikaitkan.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <Link href={`/tugas?dept=${t.dept_code}&sprint=semua#task-${t.id}`} className="min-w-0 hover:text-brand-800 hover:underline">
                  {t.code && <span className="font-mono text-xs text-slate-500">{t.code} </span>}
                  {t.title}
                </Link>
                <span className="flex items-center gap-2 text-xs">
                  {t.deadline && <span className={t.status !== "done" && t.deadline < today ? "text-red-700" : "text-slate-500"}>{formatDate(t.deadline)}</span>}
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Laporan status</h2>
        {member && <UpdateForm programId={p.id} health={p.health} />}
        {updates.length === 0 && <p className="text-sm text-slate-500">Belum ada laporan.</p>}
        <ol className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm">
                <span className="font-semibold text-slate-800">{u.author?.full_name ?? "-"}</span>{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_STYLE[u.health]}`}>{HEALTH[u.health]}</span>
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(u.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{u.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <Link href="/program" className="text-sm font-medium text-brand-700 hover:underline">
        ← Program & Prioritas
      </Link>
    </main>
  );
}
