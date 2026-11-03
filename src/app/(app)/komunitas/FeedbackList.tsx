import Link from "next/link";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_STYLE, targetText, type FeedbackItem } from "@/lib/feedback";

// Daftar masukan privat (Masukan saya / Tinjauan CA).
export default function FeedbackList({ items, showSender, empty }: { items: FeedbackItem[]; showSender: boolean; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((f) => (
        <li key={f.id}>
          <Link
            href={`/komunitas/masukan/${f.id}`}
            className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-slate-700">{f.number}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{CATEGORY_LABEL[f.category]}</span>
              <span className="text-slate-500">{formatDate(f.created_at.slice(0, 10))}</span>
            </div>
            <p className="font-semibold text-slate-900">{f.subject}</p>
            <p className="text-sm text-slate-600">
              Tentang: {targetText(f)}
              {showSender && <> · Pengirim: {f.is_anonymous ? <em>Anonim</em> : (f.sender?.full_name ?? "-")}</>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
