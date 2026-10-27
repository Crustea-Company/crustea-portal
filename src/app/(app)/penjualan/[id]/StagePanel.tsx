"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STAGES, STAGE_LABEL, WON_RANK, stageRank, type LeadStage } from "@/lib/sales";
import { addLeadNote, changeLeadStage } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
const DANGER = "border border-red-300 bg-white text-red-700 hover:bg-red-50";

// Tombol tahap mengikuti aturan change_lead_stage di database.
export function StagePanel({
  id,
  stage,
  today,
  own,
  manager,
  finance,
  techops,
}: {
  id: string;
  stage: LeadStage;
  today: string;
  own: boolean; // PIC sales atau pengelola penjualan
  manager: boolean; // head BDS (CMO), CEO, admin
  finance: boolean;
  techops: boolean;
}) {
  const router = useRouter();
  const rank = stageRank(stage);
  const preWon = stage !== "lost" && rank < WON_RANK;
  // Pilihan tahap sebelum closing: maju (PIC) atau mundur/maju (pengelola). "Disetujui CMO" punya tombol sendiri.
  const moves = preWon
    ? LEAD_STAGES.filter((s, i) => i < WON_RANK && s !== "quotation_approved" && i !== rank && (manager || (own && i > rank)))
    : [];
  const [next, setNext] = useState<LeadStage | "">(moves.find((s) => stageRank(s) > rank) ?? "");
  const [needCmo, setNeedCmo] = useState(false);
  const [note, setNote] = useState("");
  const [soNumber, setSoNumber] = useState("");
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(to: LeadStage, data: Record<string, unknown> | null = null, needsNote = false) {
    setError("");
    if (needsNote && !note.trim()) return setError("Tulis keterangan/alasan dulu di kolom catatan.");
    setPending(true);
    const res = await changeLeadStage(id, to, note, data);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  const canClose = preWon && own;
  const blocks: React.ReactNode[] = [];

  if (moves.length > 0) {
    const backward = next !== "" && stageRank(next) < rank;
    blocks.push(
      <div key="move" className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
        <label className={labelClass}>
          Pindah ke tahap
          <select value={next} onChange={(e) => setNext(e.target.value as LeadStage)} className={inputClass}>
            {moves.map((s) => (
              <option key={s} value={s}>
                {stageRank(s) < rank ? "↩ " : ""}
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {next === "quotation" && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={needCmo} onChange={(e) => setNeedCmo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-700" />
            <span>Perlu approval CMO (diskon, quotation custom, atau nilai besar) — head BDS diberi notifikasi</span>
          </label>
        )}
        {backward && <p className="text-xs text-orange-800">Memundurkan tahap wajib diberi alasan di kolom catatan.</p>}
        <button
          type="button"
          disabled={pending || !next}
          onClick={() => next && run(next, next === "quotation" ? { need_cmo: needCmo } : null, backward)}
          className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
        >
          Simpan tahap
        </button>
      </div>,
    );
  }

  if (stage === "quotation" && manager) {
    blocks.push(
      <button key="cmo" type="button" disabled={pending} onClick={() => run("quotation_approved")}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        Setujui quotation (CMO)
      </button>,
    );
  }

  if (canClose) {
    blocks.push(
      <div key="won" className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-sm font-semibold text-brand-900">Closing: buat Sales Order</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={labelClass}>
            No. Sales Order / invoice / kontrak
            <input type="text" value={soNumber} onChange={(e) => setSoNumber(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Tanggal closing
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-slate-600">Pastikan produk, unit, dan nilai di data lead sudah final: setelah closing terkunci.</p>
        <button
          type="button"
          disabled={pending || !soNumber.trim() || !date}
          onClick={() => run("won", { so_number: soNumber, closed_on: date })}
          className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}
        >
          Tandai closing
        </button>
      </div>,
    );
  }

  if (stage === "won" && finance) {
    blocks.push(
      <DateAction key="paid" label="Tanggal pelunasan" button="Tandai lunas" today={today} date={date} setDate={setDate}
        pending={pending} onClick={() => run("paid", { paid_on: date })} />,
    );
  }
  if (stage === "paid" && (own || techops)) {
    blocks.push(
      <button key="wo" type="button" disabled={pending} onClick={() => run("work_order")}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        Terbitkan work order instalasi (stok keluar otomatis)
      </button>,
    );
  }
  if (stage === "work_order" && (own || techops)) {
    blocks.push(
      <DateAction key="inst" label="Tanggal instalasi & BAST" button="Tandai terpasang" today={today} date={date}
        setDate={setDate} pending={pending} onClick={() => run("installed", { installed_on: date })} />,
    );
  }
  if (stage === "installed" && own) {
    blocks.push(
      <button key="fb" type="button" disabled={pending} onClick={() => run("feedback", null, true)}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        Simpan feedback customer (tulis di catatan)
      </button>,
    );
  }
  if (stage === "lost" && manager) {
    blocks.push(
      <button key="reopen" type="button" disabled={pending} onClick={() => run("lead", null, true)}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${NEUTRAL}`}>
        Buka lagi lead ini (tulis alasan)
      </button>,
    );
  }
  const canLose = own && stage !== "lost" && rank < stageRank("paid");

  if (blocks.length === 0 && !canLose) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Ubah tahap</h2>
      <label className={labelClass}>
        <span>
          Catatan <span className="font-normal text-slate-500">(wajib untuk gagal, mundur tahap, buka lagi, dan feedback)</span>
        </span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      {blocks}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canLose && (
        <button type="button" disabled={pending} onClick={() => run("lost", null, true)}
          className={`self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${DANGER}`}>
          Tandai gagal (tulis alasan)
        </button>
      )}
    </section>
  );
}

function DateAction(props: {
  label: string;
  button: string;
  today: string;
  date: string;
  setDate: (d: string) => void;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <label className={labelClass}>
        {props.label}
        <input type="date" max={props.today} value={props.date} onChange={(e) => props.setDate(e.target.value)} className={inputClass} />
      </label>
      <button type="button" disabled={props.pending || !props.date} onClick={props.onClick}
        className={`self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${PRIMARY}`}>
        {props.button}
      </button>
    </div>
  );
}

// Catatan atau keluhan customer (siapa saja). Keluhan diteruskan ke TechOps.
export function LeadNoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [complaint, setComplaint] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setPending(true);
    const res = await addLeadNote(id, note, complaint);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    setComplaint(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tulis catatan" aria-label="Catatan" className={inputClass} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={complaint} onChange={(e) => setComplaint(e.target.checked)} className="h-4 w-4 accent-brand-700" />
        Ini keluhan customer (masuk log keluhan, diteruskan ke TechOps)
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={pending || !note.trim()} onClick={send}
        className={`self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${NEUTRAL}`}>
        {pending ? "Mengirim..." : complaint ? "Catat keluhan" : "Kirim catatan"}
      </button>
    </div>
  );
}
