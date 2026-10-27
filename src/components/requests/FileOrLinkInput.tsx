"use client";

import { useRef, useState } from "react";
import { MAX_FILES, type AttachmentInput } from "@/lib/requests";
import { uploadRequestFile } from "@/lib/upload";

// Satu lampiran di form: file baru (belum diunggah), file yang sudah diunggah
// (id terisi kalau sudah tersimpan di pengajuan), atau link.
export type AttachmentItem =
  | { key: string; kind: "new-file"; file: File }
  | { key: string; kind: "file"; id?: string; path: string; name: string; size_bytes: number }
  | { key: string; kind: "link"; id?: string; url: string; name: string };

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(bytes / 1024)} KB`;

// Dipanggil saat form dikirim: unggah file baru (foto dikompres dulu), lalu kembalikan
// daftar lampiran untuk disimpan.
export async function resolveAttachments(
  items: AttachmentItem[],
  employeeId: string,
): Promise<{ ok: true; list: AttachmentInput[] } | { ok: false; message: string }> {
  const list: AttachmentInput[] = [];
  for (const item of items) {
    if (item.kind === "new-file") {
      const res = await uploadRequestFile(item.file, employeeId);
      if (!res.ok) return res;
      list.push({ kind: "file", path: res.path, name: res.name, size_bytes: res.size_bytes });
    } else if (item.kind === "file") {
      list.push({ kind: "file", id: item.id, path: item.path, name: item.name, size_bytes: item.size_bytes });
    } else {
      list.push({ kind: "link", id: item.id, url: item.url, name: item.name });
    }
  }
  return { ok: true, list };
}

// Unggah foto/PDF (bisa langsung dari kamera HP) atau tempel link, maks 10 lampiran.
export default function FileOrLinkInput({
  items,
  onChange,
}: {
  items: AttachmentItem[];
  onChange: (items: AttachmentItem[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const full = items.length >= MAX_FILES;

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const room = MAX_FILES - items.length;
    const picked = [...files];
    const accepted = picked
      .filter((f) => /^image\//.test(f.type) || f.type === "application/pdf")
      .slice(0, room)
      .map((file) => ({ key: crypto.randomUUID(), kind: "new-file" as const, file }));
    if (accepted.length < picked.length) setError(`Hanya foto atau PDF, maksimal ${MAX_FILES} lampiran.`);
    onChange([...items, ...accepted]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function addLink() {
    const url = link.trim();
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError("Link harus diawali http:// atau https://");
      return;
    }
    setError("");
    onChange([...items, { key: crypto.randomUUID(), kind: "link", url, name: url }]);
    setLink("");
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => {
            const name = item.kind === "new-file" ? item.file.name : item.name;
            const meta =
              item.kind === "new-file"
                ? sizeLabel(item.file.size) + (/^image\/(jpeg|png|webp)$/.test(item.file.type) ? " · akan dikompres" : "")
                : item.kind === "file"
                  ? sizeLabel(item.size_bytes)
                  : "Link";
            return (
              <li
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-800">{name}</span>
                  <span className="text-xs text-slate-500">{meta}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((i) => i.key !== item.key))}
                  className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Hapus
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={full}
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-dashed border-brand-600 px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        + Unggah foto / PDF
      </button>

      <div className="flex gap-2">
        <input
          type="url"
          value={link}
          disabled={full}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
          placeholder="atau tempel link (Google Drive, dll.)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={addLink}
          disabled={full || !link.trim()}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Tambah
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Maksimal {MAX_FILES} lampiran, 5 MB per file. Foto dari kamera otomatis diperkecil.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
