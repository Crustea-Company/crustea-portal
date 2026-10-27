import type { RequestFile } from "@/lib/requests";

export type ViewFile = RequestFile & { href: string | null };

// Daftar lampiran untuk dibaca (file dibuka lewat link sementara dari Storage).
export default function RequestFileList({ files }: { files: ViewFile[] }) {
  if (files.length === 0) return <p className="text-sm text-slate-500">Tidak ada lampiran.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-sm">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-slate-600">
            {f.kind === "link" ? "Link" : (f.name.split(".").pop() ?? "File")}
          </span>
          {f.href ? (
            <a
              href={f.href}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate font-medium text-brand-700 underline underline-offset-2"
            >
              {f.name}
            </a>
          ) : (
            <span className="min-w-0 truncate text-slate-500">{f.name} (tidak bisa dibuka)</span>
          )}
        </li>
      ))}
    </ul>
  );
}
