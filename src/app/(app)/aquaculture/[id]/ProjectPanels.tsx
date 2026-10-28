"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatNumber } from "@/lib/format";
import {
  AQUA_STAGES,
  STAGE_LABEL,
  investorPercentTotal,
  stageRank,
  type AquaStage,
  type Investor,
  type ProjectType,
} from "@/lib/aquaculture";
import { addAquaNote, changeAquaStage, deleteProject, recordAquaIncome, saveContract } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
const DANGER = "border border-red-300 bg-white text-red-700 hover:bg-red-50";
const btn = (style: string) => `self-start rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${style}`;

// Tombol tahap mengikuti aturan change_aqua_stage di database.
export function StagePanel({
  id,
  type,
  stage,
  today,
  editor,
  manager,
  legal,
  investors,
  contractNumber,
}: {
  id: string;
  type: ProjectType;
  stage: AquaStage;
  today: string;
  editor: boolean; // tim AQ, admin, CEO
  manager: boolean; // head AQ, admin, CEO
  legal: boolean; // Corporate Affairs (boleh mencatat kontrak ditandatangani)
  investors: Investor[];
  contractNumber: string | null;
}) {
  const router = useRouter();
  const rank = stageRank(stage);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState<Investor[]>(investors.length ? investors : [{ name: "", capital: 0, percent: 0 }]);
  const [signedOn, setSignedOn] = useState(today);
  const [number, setNumber] = useState(contractNumber ?? "");
  const [value, setValue] = useState(0);
  const backOptions = rank > stageRank("negotiation") && stage !== "cancelled"
    ? AQUA_STAGES.filter((s, i) => i >= stageRank("negotiation") && i < rank && (s !== "harvest" || type === "aquagrowth" || type === "mini_ras"))
    : [];
  const [back, setBack] = useState<AquaStage | "">(backOptions[backOptions.length - 1] ?? "");
  const aquagrowth = type === "aquagrowth";

  async function run(to: AquaStage | "reopen", data: Record<string, unknown> | null = null, needsNote = false) {
    setError("");
    if (needsNote && !note.trim()) return setError("Tulis keterangan/alasan dulu di kolom catatan.");
    setPending(true);
    const res = await changeAquaStage(id, to, note, data);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  async function submitContract() {
    setError("");
    if (aquagrowth) {
      const total = investorPercentTotal(list);
      if (Math.abs(total - 100) > 0.01) return setError(`Total persentase investor harus 100% (sekarang ${formatNumber(total)}%).`);
    }
    setPending(true);
    const res = aquagrowth ? await saveContract(id, list, note) : await changeAquaStage(id, "contract", note, null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  const blocks: React.ReactNode[] = [];
  if (stage === "approved" && editor) {
    blocks.push(
      <button key="neg" type="button" disabled={pending} onClick={() => run("negotiation")} className={btn(PRIMARY)}>
        Mulai presentasi & negosiasi
      </button>,
    );
  }
  if ((stage === "negotiation" || stage === "contract") && editor) {
    const total = investorPercentTotal(list);
    const capital = list.reduce((s, i) => s + (i.capital || 0), 0);
    blocks.push(
      <div key="contract" className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-sm font-semibold text-brand-900">
          Form permohonan kontrak {stage === "contract" ? "(perbarui)" : "(dikirim ke Corporate Affairs)"}
        </p>
        {aquagrowth ? (
          <>
            <p className="text-xs text-slate-600">Daftar investor: modal dan persentase bagi hasil. Total persentase harus 100%.</p>
            {list.map((inv, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-[1fr_12rem_7rem_auto]">
                <input
                  type="text"
                  aria-label="Nama investor"
                  placeholder="Nama investor"
                  value={inv.name}
                  onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className={inputClass}
                />
                <RupiahInput
                  value={inv.capital}
                  onChange={(n) => setList((l) => l.map((x, j) => (j === i ? { ...x, capital: n } : x)))}
                />
                <div className="relative">
                  <input
                    type="number"
                    aria-label="Persentase"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    value={inv.percent || ""}
                    onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) || 0 } : x)))}
                    className={`${inputClass} pr-8`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => setList((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : l))}
                  className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Hapus
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setList((l) => [...l, { name: "", capital: 0, percent: 0 }])}
                className={btn(NEUTRAL)}
              >
                + Investor
              </button>
              <button
                type="button"
                disabled={capital <= 0}
                onClick={() =>
                  setList((l) => l.map((x) => ({ ...x, percent: Math.round(((x.capital || 0) / capital) * 10000) / 100 })))
                }
                className={btn(NEUTRAL)}
              >
                Hitung % dari modal
              </button>
            </div>
            <p className={`text-sm ${Math.abs(total - 100) > 0.01 ? "text-orange-800" : "text-brand-800"}`}>
              Total modal <span className="font-semibold tabular-nums">Rp{formatNumber(capital)}</span> · total persentase{" "}
              <span className="font-semibold tabular-nums">{formatNumber(total)}%</span>
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-600">
            {TYPE_HINT} Tulis ringkasan kesepakatan di kolom catatan; nomor kontrak diisi saat kontrak ditandatangani.
          </p>
        )}
        <button type="button" disabled={pending} onClick={submitContract} className={btn(PRIMARY)}>
          {stage === "contract" ? "Simpan form kontrak" : "Ajukan kontrak ke CA"}
        </button>
      </div>,
    );
  }
  if (stage === "contract" && (editor || legal)) {
    blocks.push(
      <div key="signed" className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-900">Kontrak ditandatangani</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className={labelClass}>
            Nomor kontrak {aquagrowth ? <span className="font-normal text-slate-500">(boleh kosong)</span> : null}
            <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Tanggal tanda tangan
            <input type="date" max={today} value={signedOn} onChange={(e) => setSignedOn(e.target.value)} className={inputClass} />
          </label>
          <div className={labelClass}>
            <span>
              Nilai kontrak <span className="font-normal text-slate-500">{aquagrowth ? "(kosong = total modal investor)" : "(boleh kosong)"}</span>
            </span>
            <RupiahInput value={value} onChange={setValue} />
          </div>
        </div>
        <button
          type="button"
          disabled={pending || !signedOn || (!aquagrowth && !number.trim())}
          onClick={() => run("signed", { contract_number: number, signed_on: signedOn, contract_value: value || null })}
          className={btn(PRIMARY)}
        >
          Tandai kontrak ditandatangani
        </button>
      </div>,
    );
  }
  if (stage === "signed" && editor) {
    blocks.push(
      <button key="exec" type="button" disabled={pending} onClick={() => run("execution")} className={btn(PRIMARY)}>
        Mulai eksekusi
      </button>,
    );
  }
  if (stage === "execution" && editor && (type === "aquagrowth" || type === "mini_ras")) {
    blocks.push(
      <button key="harvest" type="button" disabled={pending} onClick={() => run("harvest")} className={btn(PRIMARY)}>
        Masuk tahap panen & penjualan hasil
      </button>,
    );
  }
  if ((stage === "execution" || stage === "harvest") && editor) {
    blocks.push(
      <button key="done" type="button" disabled={pending} onClick={() => run("completed", null, true)} className={btn(PRIMARY)}>
        Tandai selesai (tulis ringkasan hasil di catatan)
      </button>,
    );
  }
  if (backOptions.length > 0 && manager) {
    blocks.push(
      <div key="back" className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
        <label className={labelClass}>
          Mundurkan ke tahap
          <select value={back} onChange={(e) => setBack(e.target.value as AquaStage)} className={inputClass}>
            {backOptions.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={pending || !back} onClick={() => back && run(back, null, true)} className={btn(NEUTRAL)}>
          Mundurkan (tulis alasan)
        </button>
      </div>,
    );
  }
  if (stage === "cancelled" && manager) {
    blocks.push(
      <button key="reopen" type="button" disabled={pending} onClick={() => run("reopen", null, true)} className={btn(NEUTRAL)}>
        Buka lagi proyek ini (tulis alasan)
      </button>,
    );
  }
  const canCancel = editor && !["fa_review", "ceo_review", "completed", "cancelled"].includes(stage);
  if (blocks.length === 0 && !canCancel) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Ubah tahap</h2>
      <label className={labelClass}>
        <span>
          Catatan <span className="font-normal text-slate-500">(wajib untuk batal, mundur tahap, buka lagi, dan selesai)</span>
        </span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      {blocks}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canCancel && (
        <button type="button" disabled={pending} onClick={() => run("cancelled", null, true)} className={btn(DANGER)}>
          Tandai batal (tulis alasan)
        </button>
      )}
    </section>
  );
}

const TYPE_HINT = "Mini RAS, Workshop, dan Pelatihan cukup nomor kontrak.";

// Catatan (siapa saja) dan laporan bulanan (tim AQ, mulai tahap eksekusi).
export function NoteForm({ id, canReport, thisMonth }: { id: string; canReport: boolean; thisMonth: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [report, setReport] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setPending(true);
    const res = await addAquaNote(id, note, report ? { month, link } : null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    setLink("");
    setReport(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {canReport && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} className="h-4 w-4 accent-brand-700" />
          Ini laporan bulanan (dikirim ke Management)
        </label>
      )}
      {report && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
          <label className={labelClass}>
            Bulan
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Link laporan (Google Drive, dll.)
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={inputClass} />
          </label>
        </div>
      )}
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={report ? "Ringkasan: progres, kendala, data budidaya / kegiatan" : "Tulis catatan (mis. hasil review lintas tim)"}
        aria-label="Catatan"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending || (report ? !month || !link.trim() : !note.trim())}
        onClick={send}
        className={btn(NEUTRAL)}
      >
        {pending ? "Mengirim..." : report ? "Kirim laporan bulanan" : "Kirim catatan"}
      </button>
    </div>
  );
}

// Dana masuk (F&A/admin/CEO) -> revenues Lunas -> realisasi target kuartal.
export function IncomeForm({
  id,
  today,
  labels,
  defaultLabel,
}: {
  id: string;
  today: string;
  labels: string[];
  defaultLabel: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState(defaultLabel);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setPending(true);
    const res = await recordAquaIncome(id, date, amount, label, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setAmount(0);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Catat dana masuk (sudah diterima di rekening)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className={labelClass}>
          Tanggal diterima
          <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <div className={labelClass}>
          <span>Nominal</span>
          <RupiahInput value={amount} onChange={setAmount} />
        </div>
        <label className={labelClass}>
          Label alokasi target
          <select value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Keterangan (mis. modal investor A, pembayaran peserta, penjualan panen)"
        aria-label="Keterangan dana masuk"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={pending || !date || amount <= 0} onClick={send} className={btn(PRIMARY)}>
        {pending ? "Menyimpan..." : "Simpan dana masuk"}
      </button>
    </div>
  );
}

export function DeleteProjectButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (!confirm("Hapus peluang ini? Data tidak bisa dikembalikan.")) return;
          setPending(true);
          const res = await deleteProject(id);
          setPending(false);
          if (!res.ok) return setError(res.message);
          router.push("/aquaculture");
          router.refresh();
        }}
        className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        Hapus peluang
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </>
  );
}
