import { formatDateTime } from "@/lib/format";
import { statusLabel, type RequestKind, type RequestStatus } from "@/lib/requests";

export type RequestEvent = {
  id: number;
  action: "submit" | "status" | "note" | "edit";
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  note: string | null;
  at: string;
  actor: { full_name: string } | null;
};

function describe(e: RequestEvent, kind?: RequestKind): string {
  switch (e.action) {
    case "submit":
      return e.from_status === "needs_revision" ? "Mengirim ulang setelah perbaikan" : "Mengirim pengajuan";
    case "status":
      return `Mengubah status menjadi ${e.to_status ? statusLabel(e.to_status, kind) : "-"}`;
    case "note":
      return "Memberi catatan";
    case "edit":
      return "Mengubah isi pengajuan";
  }
}

// Riwayat pengajuan: siapa, kapan, apa, dan catatannya. Terbaru di atas.
export default function RequestTimeline({ events, kind }: { events: RequestEvent[]; kind?: RequestKind }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">Belum ada riwayat.</p>;
  return (
    <ol className="flex flex-col gap-0">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
          <span
            className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${
              e.action === "note" ? "bg-logo-lime" : "bg-brand-600"
            }`}
          />
          <p className="text-sm text-slate-800">
            <span className="font-semibold">{e.actor?.full_name ?? "Sistem"}</span> · {describe(e, kind)}
          </p>
          <p className="text-xs text-slate-500">{formatDateTime(e.at)}</p>
          {e.note && (
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
