"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABEL, needsNote, nextStatuses, type FeedbackStatus } from "@/lib/feedback";
import { addFeedbackNote, changeFeedbackStatus, updateCommunityPost } from "../../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";

const PUBLISHED: FeedbackStatus[] = ["followed_up", "in_progress", "done"];

// Panel Corporate Affairs: ubah status (aturan sama dengan change_feedback_status).
export function ReviewPanel({ id, status, subject }: { id: string; status: FeedbackStatus; subject: string }) {
  const router = useRouter();
  const options = nextStatuses(status);
  const [to, setTo] = useState<FeedbackStatus>(options[0]);
  const [note, setNote] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [title, setTitle] = useState(subject);
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const publishing = to === "followed_up" && !PUBLISHED.includes(status);
  const published = PUBLISHED.includes(to);
  const noteRequired = needsNote(status, to);

  async function save() {
    setError("");
    if (noteRequired && !note.trim()) return setError("Tuliskan alasan untuk pengirim.");
    if (publishing && (!title.trim() || !summary.trim())) return setError("Tuliskan judul dan ringkasan publik.");
    setPending(true);
    const res = await changeFeedbackStatus(id, to, note, published ? publicNote : "", publishing ? title : "", publishing ? summary : "");
    setPending(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Tindak lanjut (Corporate Affairs)</h2>
      <label className={labelClass}>
        Ubah status menjadi
        <select value={to} onChange={(e) => setTo(e.target.value as FeedbackStatus)} className={inputClass}>
          {options.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {publishing && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-semibold text-brand-900">Postingan publik di papan komunitas</p>
          <p className="text-xs text-slate-600">
            Terlihat semua karyawan. Tulis dengan bahasa umum: jangan sebut nama orang, isi asli, atau hal yang menunjukkan
            siapa pengirimnya.
          </p>
          <label className={labelClass}>
            Judul publik
            <input type="text" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Ringkasan publik
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className={inputClass} />
          </label>
        </div>
      )}

      <label className={labelClass}>
        Catatan untuk pengirim {noteRequired ? "(wajib)" : "(opsional)"}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} />
      </label>
      {published && (
        <label className={labelClass}>
          Catatan progres publik (opsional, terlihat semua karyawan)
          <textarea value={publicNote} onChange={(e) => setPublicNote(e.target.value)} rows={2} className={inputClass} />
        </label>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={pending} onClick={save} className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        {pending ? "Menyimpan..." : "Simpan status"}
      </button>
    </section>
  );
}

export function PostEditor({ id, title: initialTitle, summary: initialSummary }: { id: string; title: string; summary: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <p className="font-medium text-slate-900">{initialTitle}</p>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{initialSummary}</p>
        <button type="button" onClick={() => setEditing(true)} className="self-start text-sm font-medium text-brand-700 hover:underline">
          Ubah judul/ringkasan
        </button>
      </div>
    );
  }

  async function save() {
    setError("");
    setPending(true);
    const res = await updateCommunityPost(id, title, summary);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="text" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className={inputClass} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
          Simpan
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
          Batal
        </button>
      </div>
    </div>
  );
}

// Catatan dari pengirim atau CA. canInternal: CA boleh menulis catatan yang tidak terlihat pengirim.
export function NoteForm({ id, canInternal }: { id: string; canInternal: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await addFeedbackNote(id, note, canInternal && internal);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={canInternal ? "Tulis catatan untuk pengirim" : "Tambahkan keterangan untuk Corporate Affairs"}
        className={inputClass}
      />
      {canInternal && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-brand-700" />
          Catatan internal CA (tidak terlihat pengirim)
        </label>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={pending || !note.trim()} className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        Kirim catatan
      </button>
    </form>
  );
}
