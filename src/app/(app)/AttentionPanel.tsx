import Link from "next/link";
import type { Employee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { weekRange } from "@/lib/ats";
import { STATUS_LABEL as TASK_STATUS_LABEL, type TaskStatus } from "@/lib/tasks";
import { KIND_LABEL, REQUEST_COLUMNS, faReviewStage, isOverdue, statusLabel, type RequestRow } from "@/lib/requests";

const LIMIT = 5;

type MyTask = { id: string; code: string | null; dept_code: string; title: string; status: TaskStatus; deadline: string };

// Tindakan yang menunggu orang ini menurut perannya sendiri (tanpa peran cadangan admin, supaya tidak ramai).
function waitingOnMe(me: Employee, r: RequestRow): string | null {
  if (me.dept_code === "FA" && faReviewStage(r) === "now") return "Review F&A";
  if (me.app_role === "ceo" && r.status === "ceo_review") return "Persetujuan CEO";
  if (r.kind === "travel" && r.status === "submitted" && r.assigner_id === me.id) return "Persetujuan penugas";
  if (r.kind === "procurement" && r.status === "submitted" && me.app_role === "head" && me.dept_code === r.dept_code) {
    return "Persetujuan head";
  }
  if (r.kind === "procurement" && r.status === "head_approved" && me.dept_code === "TO") return "Perbandingan vendor (TechOps)";
  return null;
}

// "Perlu perhatian saya" di Beranda: tugas saya yang terlambat / jatuh tempo minggu ini,
// pengajuan yang menunggu tindakan saya, dan pengajuan saya yang masih berjalan.
export default async function AttentionPanel({ me, today }: { me: Employee; today: string }) {
  const supabase = await createClient();
  const week = weekRange(today);

  const [{ data: taskRows }, { data: requestRows }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, code, dept_code, title, status, deadline, task_people!inner(employee_id, role)")
      .eq("task_people.employee_id", me.id)
      .eq("task_people.role", "pic")
      .neq("status", "done")
      .not("deadline", "is", null)
      .lte("deadline", week.end)
      .order("deadline"),
    supabase.from("requests").select(REQUEST_COLUMNS).not("status", "in", "(draft,completed,rejected)").order("status_since"),
  ]);
  const tasks = (taskRows ?? []) as unknown as MyTask[];
  const late = tasks.filter((t) => t.deadline < today);
  const requests = (requestRows ?? []) as unknown as RequestRow[];
  const waiting = requests.flatMap((r) => {
    const action = waitingOnMe(me, r);
    return action ? [{ r, action }] : [];
  });
  const mine = requests
    .filter((r) => r.requester_id === me.id)
    .sort((a, b) => Number(b.status === "needs_revision") - Number(a.status === "needs_revision"));

  return (
    <section className="flex flex-col gap-3 lg:col-span-3">
      <h2 className="text-lg font-bold text-slate-900">Perlu perhatian saya</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          title="Tugas saya"
          sub={late.length > 0 ? `${late.length} terlambat · ${tasks.length - late.length} jatuh tempo minggu ini` : `${tasks.length} jatuh tempo minggu ini`}
          more={{ href: "/tugas?pic=saya", label: "Semua tugas saya" }}
          empty="Tidak ada tugas yang terlambat atau jatuh tempo minggu ini."
          count={tasks.length}
        >
          {tasks.slice(0, LIMIT).map((t) => (
            <Item
              key={t.id}
              href={`/tugas?${new URLSearchParams({ dept: t.dept_code, sprint: "semua" })}#task-${t.id}`}
              title={t.title}
              meta={`${t.code ?? t.dept_code} · ${TASK_STATUS_LABEL[t.status]}`}
              badge={t.deadline < today ? `Terlambat · ${formatDate(t.deadline)}` : `Tenggat ${formatDate(t.deadline)}`}
              alert={t.deadline < today}
            />
          ))}
        </Card>

        <Card
          title="Menunggu tindakan saya"
          sub={`${waiting.length} pengajuan`}
          more={me.dept_code === "FA" || me.app_role === "ceo" ? { href: "/pengajuan/review", label: "Buka Review" } : undefined}
          empty="Tidak ada pengajuan yang menunggu tindakan Anda."
          count={waiting.length}
        >
          {waiting.slice(0, LIMIT).map(({ r, action }) => (
            <Item
              key={r.id}
              href={`/pengajuan/${r.id}`}
              title={r.title}
              meta={`${r.number} · ${KIND_LABEL[r.kind]}${r.requester ? ` · ${r.requester.full_name}` : ""}`}
              badge={isOverdue(r) ? `${action} · lewat SLA` : action}
              alert={isOverdue(r)}
            />
          ))}
        </Card>

        <Card
          title="Pengajuan saya"
          sub={`${mine.length} sedang berjalan`}
          more={{ href: "/pengajuan", label: "Semua pengajuan saya" }}
          empty="Tidak ada pengajuan Anda yang sedang berjalan."
          count={mine.length}
        >
          {mine.slice(0, LIMIT).map((r) => (
            <Item
              key={r.id}
              href={`/pengajuan/${r.id}`}
              title={r.title}
              meta={`${r.number} · ${KIND_LABEL[r.kind]}`}
              badge={statusLabel(r.status, r.kind)}
              alert={r.status === "needs_revision"}
            />
          ))}
        </Card>
      </div>
    </section>
  );
}

function Card({
  title,
  sub,
  more,
  empty,
  count,
  children,
}: {
  title: string;
  sub: string;
  more?: { href: string; label: string };
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        {count > 0 && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {count === 0 ? (
        <p className="py-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">{children}</ul>
      )}
      {more && (
        <Link href={more.href} className="mt-auto self-start text-xs font-medium text-brand-700 hover:underline">
          {count > LIMIT ? `${more.label} (${count}) →` : `${more.label} →`}
        </Link>
      )}
    </div>
  );
}

function Item({ href, title, meta, badge, alert }: { href: string; title: string; meta: string; badge: string; alert: boolean }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-2 hover:bg-slate-50">
        <span className="line-clamp-2 text-sm font-medium text-slate-800">{title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{meta}</span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${alert ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-800"}`}>
            {badge}
          </span>
        </span>
      </Link>
    </li>
  );
}
