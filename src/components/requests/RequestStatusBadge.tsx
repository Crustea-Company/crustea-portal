import { formatDateTime } from "@/lib/format";
import { STATUS_STYLE, isOverdue, statusLabel, type RequestKind, type RequestStatus } from "@/lib/requests";

export default function RequestStatusBadge({ status, kind }: { status: RequestStatus; kind?: RequestKind }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {statusLabel(status, kind)}
    </span>
  );
}

// Batas SLA (2 hari kerja di status ini). Merah kalau sudah lewat.
export function SlaLabel({ slaDue }: { slaDue: string | null }) {
  if (!slaDue) return null;
  if (isOverdue({ sla_due: slaDue })) {
    return (
      <span className="inline-block rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        Lewat SLA
      </span>
    );
  }
  return <span className="text-xs text-slate-500">Batas SLA {formatDateTime(slaDue)}</span>;
}
