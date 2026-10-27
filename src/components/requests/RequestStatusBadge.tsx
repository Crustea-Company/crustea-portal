import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE, isOverdue, type RequestStatus } from "@/lib/requests";

export default function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
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
