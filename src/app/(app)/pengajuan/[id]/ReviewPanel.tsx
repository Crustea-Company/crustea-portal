"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import FileOrLinkInput, { resolveAttachments, type AttachmentItem } from "@/components/requests/FileOrLinkInput";
import type { RequestStatus } from "@/lib/requests";
import { addRequestNote, changeRequestStatus, deleteDraft } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

type Action = { to: RequestStatus; label: string; style: string; needsNote?: boolean };

const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 text-slate-700 hover:bg-slate-100";
const DANGER = "border border-red-300 text-red-700 hover:bg-red-50";

// Tombol yang tersedia untuk peninjau di setiap status. ceo = boleh memutuskan "Menunggu CEO".
function actionsFor(status: RequestStatus, ceo: boolean): Action[] {
  const decide: Action[] = [
    { to: "approved", label: "Terima", style: PRIMARY },
    { to: "needs_revision", label: "Perlu perbaikan", style: NEUTRAL, needsNote: true },
    { to: "rejected", label: "Tolak", style: DANGER, needsNote: true },
  ];
  if (status === "submitted") return [{ to: "in_review", label: "Mulai review", style: PRIMARY }, ...decide.map((a) => (a.to === "approved" ? { ...a, style: NEUTRAL } : a))];
  if (status === "in_review") return decide;
  if (status === "ceo_review" && ceo) return decide.map((a) => (a.to === "approved" ? { ...a, label: "Setujui (CEO)" } : a));
  return [];
}

// Panel peninjau F&A: ubah status + catatan; "Tandai ditransfer" wajib tanggal transfer.
export function ReviewPanel({
  id,
  status,
  employeeId,
  today,
  ceo = false,
  canNote = true,
}: {
  id: string;
  status: RequestStatus;
  employeeId: string;
  today: string;
  ceo?: boolean;
  canNote?: boolean; // add_request_note hanya untuk pemohon & peninjau F&A
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [proof, setProof] = useState<AttachmentItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(to: RequestStatus, needsNote?: boolean) {
    setError("");
    if (needsNote && !note.trim()) {
      setError("Tulis catatan/alasan dulu di kolom catatan.");
      return;
    }
    setPending(true);
    let files: Awaited<ReturnType<typeof resolveAttachments>> = { ok: true, list: [] };
    if (to === "paid" && proof.length) files = await resolveAttachments(proof, employeeId);
    const res = files.ok
      ? await changeRequestStatus(id, to, note, to === "paid" ? paidOn : null, files.list)
      : files;
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setNote("");
    setProof([]);
    router.refresh();
  }

  async function noteOnly() {
    setError("");
    setPending(true);
    const res = await addRequestNote(id, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  const actions = actionsFor(status, ceo);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{ceo ? "Persetujuan CEO" : "Tindakan peninjau"}</h2>
      {status === "ceo_review" && !ceo && (
        <p className="text-sm text-slate-600">Menunggu persetujuan CEO. Anda masih bisa mengirim catatan.</p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Catatan <span className="font-normal text-slate-500">(wajib untuk Perlu perbaikan dan Tolak; terlihat pemohon)</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>

      {status === "approved" && (
        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Tanggal transfer
            <input type="date" required max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Bukti transfer <span className="font-normal text-slate-500">(boleh kosong)</span>
            <FileOrLinkInput items={proof} onChange={setProof} />
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={pending}
            onClick={() => run(a.to, a.needsNote)}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${a.style}`}
          >
            {a.label}
          </button>
        ))}
        {status === "approved" && (
          <button
            type="button"
            disabled={pending || !paidOn}
            onClick={() => run("paid")}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
          >
            Tandai ditransfer
          </button>
        )}
        {canNote && (
          <button
            type="button"
            disabled={pending || !note.trim()}
            onClick={noteOnly}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60 ${NEUTRAL}`}
          >
            Kirim catatan saja
          </button>
        )}
      </div>
    </section>
  );
}

// Catatan dari pemohon (tanpa mengubah status).
export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setPending(true);
    const res = await addRequestNote(id, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Tulis catatan untuk F&A"
        aria-label="Catatan"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending || !note.trim()}
        onClick={send}
        className={`self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${NEUTRAL}`}
      >
        {pending ? "Mengirim..." : "Kirim catatan"}
      </button>
    </div>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    if (!window.confirm("Hapus draf ini? Draf yang dihapus tidak bisa dikembalikan.")) return;
    setPending(true);
    const res = await deleteDraft(id);
    setPending(false);
    if (!res.ok) return window.alert(res.message);
    router.push("/pengajuan");
    router.refresh();
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={remove}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60 ${DANGER}`}
    >
      Hapus draf
    </button>
  );
}
