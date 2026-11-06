import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, todayJakarta } from "@/lib/format";
import {
  HEALTH,
  HEALTH_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  PROGRAM_COLUMNS,
  PROGRAM_STATUS,
  canPrioritize,
  sortPrograms,
  type Program,
} from "@/lib/programs";
import { NewProgram, PriorityControls } from "./ProgramPanels";

export const metadata: Metadata = { title: "Program & Prioritas - Crustea Portal" };

const ACTIVE = ["planned", "active", "on_hold"];
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// Daftar program lintas tim menurut prioritas, dengan timeline dan milestone terdekat (migrasi 029).
export default async function ProgramPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const prioritizer = canPrioritize(me);
  const [{ data: rows }, { data: taskRows }, { data: people }] = await Promise.all([
    fetchAll(() => supabase.from("programs").select(PROGRAM_COLUMNS)),
    fetchAll(() => supabase.from("tasks").select("program_id, status").not("program_id", "is", null)),
    prioritizer ? supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const all = sortPrograms((rows ?? []) as unknown as Program[]);
  const today = todayJakarta();
  const taskStat = new Map<string, { done: number; total: number }>();
  for (const t of (taskRows ?? []) as { program_id: string; status: string }[]) {
    const s = taskStat.get(t.program_id) ?? { done: 0, total: 0 };
    s.total++;
    if (t.status === "done") s.done++;
    taskStat.set(t.program_id, s);
  }
  const active = all.filter((p) => ACTIVE.includes(p.status));
  const closed = all.filter((p) => !ACTIVE.includes(p.status));

  // Kalender: milestone belum selesai dari program aktif, 90 hari ke depan (yang terlambat ikut tampil).
  const upcoming = active
    .flatMap((p) => p.program_milestones.filter((m) => !m.done_at && m.due_date && days(today, m.due_date) <= 90).map((m) => ({ ...m, program: p })))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const byMonth = new Map<string, typeof upcoming>();
  for (const m of upcoming) {
    const key = m.due_date! < today ? "Terlambat" : new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m.due_date}T00:00:00Z`));
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  }

  const card = (p: Program) => {
    const leads = p.program_people.filter((x) => x.is_lead);
    const ms = p.program_milestones;
    const msDone = ms.filter((m) => m.done_at).length;
    const next = ms.filter((m) => !m.done_at && m.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
    const ts = taskStat.get(p.id);
    const span = p.start_date && p.end_date ? Math.max(1, days(p.start_date, p.end_date)) : null;
    const elapsed = span ? Math.min(100, Math.max(0, Math.round((days(p.start_date!, today) / span) * 100))) : null;
    return (
      <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/program/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-800 hover:underline">
              {p.name}
            </Link>
            <p className="text-xs text-slate-500">
              {leads.length ? `PIC ${leads.map((l) => l.employee?.full_name).join(", ")}` : "Belum ada PIC"} · {p.program_people.length} anggota
              {p.status !== "active" && ` · ${PROGRAM_STATUS[p.status]}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_STYLE[p.health]}`}>{HEALTH[p.health]}</span>
            {prioritizer && ACTIVE.includes(p.status) && <PriorityControls id={p.id} priority={p.priority} />}
          </div>
        </div>
        {elapsed !== null && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{formatDate(p.start_date)}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100" title={`${elapsed}% waktu berjalan`}>
              <div className="h-full rounded-full bg-brand-300" style={{ width: `${elapsed}%` }} />
            </div>
            <span>{formatDate(p.end_date)}</span>
          </div>
        )}
        <p className="text-xs text-slate-600">
          Milestone {msDone}/{ms.length}
          {ts && ` · tugas selesai ${ts.done}/${ts.total}`}
          {next && (
            <>
              {" · "}berikutnya: <b className={next.due_date! < today ? "text-red-700" : ""}>{next.title}</b> ({formatDate(next.due_date)})
            </>
          )}
        </p>
      </li>
    );
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Program & Prioritas</p>
          <h1 className="text-2xl font-bold text-slate-900">Program berjalan</h1>
          <p className="mt-1 text-sm text-slate-600">
            Urutan prioritas diatur admin, CEO, CTO, dan CMO. Permintaan pekerjaan tambahan dicatat sebagai tugas di program terkait.
          </p>
        </div>
        {prioritizer && <NewProgram people={people ?? []} />}
      </div>

      {[1, 2, 3].map((prio) => {
        const list = active.filter((p) => p.priority === prio);
        if (!list.length) return null;
        return (
          <section key={prio} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[prio]}`}>Prioritas {PRIORITY_LABEL[prio]}</span>
              <span className="text-slate-500">{list.length} program</span>
            </h2>
            <ol className="flex flex-col gap-2">{list.map(card)}</ol>
          </section>
        );
      })}
      {active.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Belum ada program berjalan.</p>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Kalender milestone (90 hari ke depan)</h2>
        {byMonth.size === 0 && <p className="text-sm text-slate-500">Belum ada milestone bertanggal.</p>}
        {[...byMonth.entries()].map(([month, ms]) => (
          <div key={month}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${month === "Terlambat" ? "text-red-700" : "text-slate-500"}`}>{month}</p>
            <ul className="mt-1 flex flex-col divide-y divide-slate-100">
              {ms.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
                  <span>
                    <b>{formatDate(m.due_date)}</b> · {m.title}
                    {m.pic && <span className="text-slate-500"> · {m.pic.full_name}</span>}
                  </span>
                  <Link href={`/program/${m.program.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                    {m.program.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {closed.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Selesai & batal ({closed.length})</summary>
          <ol className="mt-2 flex flex-col gap-2">{closed.map(card)}</ol>
        </details>
      )}
    </main>
  );
}
