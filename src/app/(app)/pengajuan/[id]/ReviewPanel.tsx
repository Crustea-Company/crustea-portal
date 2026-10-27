"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import FileOrLinkInput, { resolveAttachments, type AttachmentItem } from "@/components/requests/FileOrLinkInput";
import type { RequestKind, RequestStatus } from "@/lib/requests";
import { addRequestNote, changeRequestStatus, deleteDraft, submitTravelReport } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

type Action = { to: RequestStatus; label: string; style: string; needsNote?: boolean };

const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 text-slate-700 hover:bg-slate-100";
const DANGER = "border border-red-300 text-red-700 hover:bg-red-50";

// Peran pengguna pada tahap ini: F&A, CEO, penugas dinas, HR/CA (surat tugas), atau hanya memberi catatan.
export type ReviewMode = "fa" | "ceo" | "assigner" | "hr" | "viewer";

const HEADING: Record<ReviewMode, string> = {
  fa: "Tindakan peninjau",
  ceo: "Persetujuan CEO",
  assigner: "Persetujuan penugas",
  hr: "Surat tugas (Corporate Affairs)",
  viewer: "Catatan untuk pemohon",
};

// Tombol yang tersedia di setiap status (urutan & peran yang sama dengan change_request_status).
function actionsFor(status: RequestStatus, kind: RequestKind, mode: ReviewMode, advance: boolean): Action[] {
  const decide = (label: string, to: RequestStatus = "approved"): Action[] => [
    { to, label, style: PRIMARY },
    { to: "needs_revision", label: "Perlu perbaikan", style: NEUTRAL, needsNote: true },
    { to: "rejected", label: "Tolak", style: DANGER, needsNote: true },
  ];
  if (kind === "travel") {
    if (status === "submitted" && mode === "assigner") return decide("Setujui penugasan", "assigner_approved");
    if (status === "assigner_approved" && mode === "hr") return decide("Terbitkan surat tugas", "st_issued");
    if (status === "st_issued" && mode === "fa") return decide("Verifikasi Finance");
    if (mode === "fa" && (status === "paid" || (status === "approved" && !advance))) {
      return [{ to: "completed", label: "Tandai selesai", style: PRIMARY }];
    }
    return [];
  }
  if (mode === "fa" && status === "submitted") {
    return [
      { to: "in_review", label: "Mulai review", style: PRIMARY },
      ...decide("Terima").map((a) => (a.to === "approved" ? { ...a, style: NEUTRAL } : a)),
    ];
  }
  if (mode === "fa" && status === "in_review") return decide("Terima");
  if (mode === "ceo" && status === "ceo_review") return decide("Setujui (CEO)");
  return [];
}

// Panel peninjau F&A: ubah status + catatan; "Tandai ditransfer" wajib tanggal transfer.
export function ReviewPanel({
  id,
  status,
  employeeId,
  today,
  kind,
  mode,
  advance = false,
  canNote = true,
}: {
  id: string;
  status: RequestStatus;
  employeeId: string;
  today: string;
  kind: RequestKind;
  mode: ReviewMode;
  advance?: boolean; // dinas: uang muka diminta
  canNote?: boolean; // add_request_note: pemohon, F&A, dan (dinas) penugas & HR/CA
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

  const actions = actionsFor(status, kind, mode, advance);
  const showPay = mode === "fa" && status === "approved" && (kind !== "travel" || advance);
  const travel = kind === "travel";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{HEADING[mode]}</h2>
      {status === "ceo_review" && mode !== "ceo" && (
        <p className="text-sm text-slate-600">Menunggu persetujuan CEO. Anda masih bisa mengirim catatan.</p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Catatan <span className="font-normal text-slate-500">(wajib untuk Perlu perbaikan dan Tolak; terlihat pemohon)</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>

      {showPay && (
        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {travel ? "Tanggal pencairan uang muka" : "Tanggal transfer"}
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
        {showPay && (
          <button
            type="button"
            disabled={pending || !paidOn}
            onClick={() => run("paid")}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
          >
            {travel ? "Tandai uang muka dicairkan" : "Tandai ditransfer"}
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

// Pemohon dinas melampirkan link FPTD & laporan misi setelah kembali.
export function TravelReportForm({
  id,
  employeeId,
  initial,
}: {
  id: string;
  employeeId: string;
  initial: AttachmentItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<AttachmentItem[]>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setError("");
    setSaved(false);
    if (items.length === 0) return setError("Tempel link FPTD dan laporan misi.");
    setPending(true);
    const files = await resolveAttachments(items, employeeId);
    const res = files.ok ? await submitTravelReport(id, files.list) : files;
    setPending(false);
    if (!res.ok) return setError(res.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <FileOrLinkInput items={items} onChange={setItems} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-brand-800">Tersimpan. F&A sudah diberi tahu.</p>}
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
      >
        {pending ? "Menyimpan..." : "Kirim FPTD & laporan misi"}
      </button>
    </div>
  );
}
