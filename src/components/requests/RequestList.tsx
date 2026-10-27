import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/format";
import { KIND_LABEL, isOverdue, isUrgent, type RequestRow } from "@/lib/requests";
import RequestStatusBadge, { SlaLabel } from "./RequestStatusBadge";

// Daftar kartu pengajuan (dipakai di Pengajuan saya dan Review F&A).
export default function RequestList({
  rows,
  showRequester = false,
  empty,
}: {
  rows: RequestRow[];
  showRequester?: boolean;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/pengajuan/${r.id}`}
            className={`flex flex-col gap-1.5 rounded-2xl border bg-white p-4 shadow-sm hover:border-brand-600 ${
              isOverdue(r) ? "border-red-300" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{r.number}</span>
              <span>· {KIND_LABEL[r.kind]}</span>
              {showRequester && r.requester && (
                <span>
                  · {r.requester.full_name}
                  {r.dept_code ? ` (${r.dept_code})` : ""}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {isUrgent(r) && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Segera</span>
                )}
                <RequestStatusBadge status={r.status} />
              </span>
            </div>
            <p className="line-clamp-2 font-medium text-slate-900">{r.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-brand-800">Rp{formatNumber(r.amount)}</span>
              <span className="text-xs text-slate-500">
                Diajukan {formatDate((r.submitted_at ?? r.created_at).slice(0, 10))}
              </span>
              <span className="ml-auto">
                <SlaLabel slaDue={r.sla_due} />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
