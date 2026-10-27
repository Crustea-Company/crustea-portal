// Bagian halaman yang bisa dibuka-tutup (klik judulnya). Ringkasan tetap terlihat saat tertutup.
export default function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="mb-3 flex cursor-pointer select-none list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 -rotate-90 text-slate-500 transition-transform group-open:rotate-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {summary && <span className="ml-auto text-xs text-slate-500">{summary}</span>}
        <span className="text-xs font-medium text-brand-700 group-open:hidden">Buka</span>
        <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Tutup</span>
      </summary>
      {children}
    </details>
  );
}
