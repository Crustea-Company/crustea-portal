"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import type { Asset } from "@/lib/sales";
import AssetForm from "../AssetForm";
import { addAssetLog, changeAssetStatus } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";
const PRIMARY = "bg-brand-700 text-white hover:bg-brand-800";
const NEUTRAL = "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
const DANGER = "border border-red-300 bg-white text-red-700 hover:bg-red-50";

type Roles = { manage: boolean; finance: boolean; techops: boolean; approver: boolean };

// Tombol status mengikuti aturan change_asset_status di database.
export function AssetPanel({
  asset,
  roles,
  leads,
  myApprovalDone,
}: {
  asset: Asset;
  roles: Roles;
  leads: { id: string; label: string }[]; // penempatan di lokasi klien
  myApprovalDone: boolean;
}) {
  const router = useRouter();
  const s = asset.status;
  const [note, setNote] = useState("");
  const [value, setValue] = useState(asset.value ?? 0);
  const [life, setLife] = useState(asset.useful_life_months ?? 0);
  const [location, setLocation] = useState(asset.location ?? "");
  const [holder, setHolder] = useState(asset.holder ?? "");
  const [reference, setReference] = useState("");
  const [leadId, setLeadId] = useState(asset.lead_id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(to: string, data: Record<string, unknown> | null = null, needsNote = false) {
    setError("");
    if (needsNote && !note.trim()) return setError("Tulis keterangan/alasan dulu di kolom catatan.");
    setPending(true);
    const res = await changeAssetStatus(asset.id, to, note, data);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  const btn = (label: string, onClick: () => void, style = PRIMARY) => (
    <button type="button" disabled={pending} onClick={onClick} className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${style}`}>
      {label}
    </button>
  );

  const blocks: React.ReactNode[] = [];
  if (s === "received" && roles.finance) {
    blocks.push(
      <div key="reg" className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-sm font-semibold text-brand-900">Registrasi aset (Finance): kode unik dibuat otomatis</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className={labelClass}>
            <label htmlFor="reg-value">Nilai perolehan</label>
            <RupiahInput id="reg-value" value={value} onChange={setValue} />
          </div>
          <label className={labelClass}>
            Lokasi
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span>
              Umur manfaat <span className={hintClass}>(bulan)</span>
            </span>
            <input type="number" min={0} inputMode="numeric" value={life || ""}
              onChange={(e) => setLife(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={inputClass} />
          </label>
        </div>
        <div>{btn("Registrasi & beri kode", () => run("registered", { value, location, useful_life_months: life || null }))}</div>
      </div>,
    );
  }
  if ((s === "registered" || s === "damaged") && roles.techops) {
    blocks.push(
      <div key="place" className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-900">Tempatkan di lokasi klien / program (BAST penempatan)</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={labelClass}>
            Penerima
            <input type="text" value={holder} onChange={(e) => setHolder(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Lokasi penempatan
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span>
              Link BAST penempatan <span className={hintClass}>(boleh kosong)</span>
            </span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="https://" className={inputClass} />
          </label>
          <label className={labelClass}>
            <span>
              Penjualan terkait <span className={hintClass}>(boleh kosong)</span>
            </span>
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inputClass}>
              <option value="">Tidak ada</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>{btn("Tandai ditempatkan", () => run("placed", { holder, location, reference, lead_id: leadId || null }))}</div>
      </div>,
    );
  }

  const row: React.ReactNode[] = [];
  if (["placed", "damaged", "lost"].includes(s) && roles.techops) {
    row.push(<span key="back">{btn(s === "placed" ? "Tarik kembali ke gudang" : "Sudah beres, kembali terdaftar", () => run("registered", null, true), NEUTRAL)}</span>);
  }
  if (s === "registered" || s === "placed") {
    row.push(<span key="dmg">{btn("Lapor rusak", () => run("damaged", null, true), DANGER)}</span>);
  }
  if (["registered", "placed", "damaged"].includes(s)) {
    row.push(<span key="lost">{btn("Lapor hilang", () => run("lost", null, true), DANGER)}</span>);
  }
  if (["registered", "placed", "damaged", "lost"].includes(s)) {
    row.push(<span key="disp">{btn("Usulkan penghapusan", () => run("disposal_proposed", null, true), NEUTRAL)}</span>);
  }
  if (s === "disposal_proposed" && roles.approver) {
    if (!myApprovalDone) row.push(<span key="ok">{btn("Setujui penghapusan", () => run("disposed"))}</span>);
    row.push(<span key="no">{btn("Tolak penghapusan", () => run("disposal_rejected", null, true), DANGER)}</span>);
  }

  if (blocks.length === 0 && row.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Ubah status aset</h2>
      <label className={labelClass}>
        <span>
          Catatan <span className={hintClass}>(wajib untuk lapor rusak/hilang, usul hapus, tolak, dan kembali terdaftar)</span>
        </span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      {blocks}
      {row.length > 0 && <div className="flex flex-wrap gap-2">{row}</div>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

// Ubah data aset (TechOps / Finance).
export function EditAsset({ asset, today }: { asset: Asset; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Ubah data aset
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <AssetForm today={today} asset={asset} onDone={() => setOpen(false)} />
    </div>
  );
}

// Log pemeliharaan / stock opname (TechOps, Finance) atau catatan (siapa saja).
export function AssetLogForm({ id, today, manage }: { id: string; today: string; manage: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<"maintenance" | "opname" | "note">(manage ? "maintenance" : "note");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setPending(true);
    const res = await addAssetLog(id, action, note, date);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {manage && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={action} onChange={(e) => setAction(e.target.value as typeof action)} aria-label="Jenis catatan" className={inputClass}>
            <option value="maintenance">Pemeliharaan</option>
            <option value="opname">Stock opname</option>
            <option value="note">Catatan biasa</option>
          </select>
          {action !== "note" && (
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal" className={inputClass} />
          )}
        </div>
      )}
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={action === "maintenance" ? "Apa yang dikerjakan" : action === "opname" ? "Hasil pengecekan fisik" : "Tulis catatan"}
        aria-label="Keterangan"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={pending || !note.trim()} onClick={send}
        className={`self-start rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${NEUTRAL}`}>
        {pending ? "Menyimpan..." : "Simpan"}
      </button>
    </div>
  );
}
