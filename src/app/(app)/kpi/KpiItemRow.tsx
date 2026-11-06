"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime, formatNumber } from "@/lib/format";
import { achievement, formatWeeks, type KpiItem, type KpiRealization, type Quarter } from "@/lib/kpi";
import { setKpiRealization, updateKpiItem } from "./actions";
import KpiItemForm, { type KpiFormOptions } from "./KpiItemForm";

// Satu item KPI: centang selesai + catatan realisasi (bagi yang berhak); ubah isi item (admin, CEO, head dept).
export default function KpiItemRow({
  item,
  canEdit,
  deptName,
  manage,
  quarter,
  real,
  history,
}: {
  item: KpiItem;
  canEdit: boolean;
  deptName: string;
  manage: KpiFormOptions | null;
  quarter: Quarter;
  real: KpiRealization | null; // realisasi kuartal yang dilihat
  history: KpiRealization[]; // kuartal lain, terbaru dulu
}) {
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.realization_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(isDone: boolean, nextNote: string) {
    setError("");
    setPending(true);
    const res = await updateKpiItem(item.id, isDone, nextNote);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setEditing(false);
    router.refresh();
  }

  const target = [
    item.target_value != null ? `${formatNumber(item.target_value)} ${item.target_unit ?? ""}`.trim() : null,
    item.target_period === "quarter" ? "per kuartal" : null,
    formatWeeks(item.target_weeks) || null,
  ].filter(Boolean);

  if (form && manage) {
    return (
      <li className="p-3">
        <KpiItemForm item={item} defaultDept={item.dept_code} options={manage} onDone={() => setForm(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={item.is_done}
          disabled={!canEdit || pending}
          onChange={(e) => save(e.target.checked, item.realization_note ?? "")}
          aria-label={item.is_done ? "Tandai belum selesai" : "Tandai selesai"}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700 disabled:opacity-60"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${item.is_done ? "text-slate-500 line-through" : "text-slate-900"}`}>{item.item}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
            <span>PIC: {item.pic_type === "department" ? `Departemen ${deptName}` : (item.pic?.full_name ?? "-")}</span>
            {target.length > 0 && <span>Target: {target.join(" · ")}</span>}
          </p>
          {item.realization_note && !editing && (
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">{item.realization_note}</p>
          )}
          {item.updated_at && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              Diubah {item.editor?.full_name ?? ""} · {formatDateTime(item.updated_at)}
            </p>
          )}
        </div>
        {manage && !editing && (
          <button
            type="button"
            onClick={() => setForm(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Ubah item
          </button>
        )}
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            {item.realization_note ? "Ubah catatan" : "+ Catatan"}
          </button>
        )}
      </div>
      <Realization key={`${quarter.year}-${quarter.quarter}`} item={item} canEdit={canEdit} quarter={quarter} real={real} history={history} />
      {editing && (
        <div className="flex flex-col gap-2 pl-8">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Catatan realisasi (mis. link bukti, angka tercapai)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => save(item.is_done, note)}
              className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNote(item.realization_note ?? "");
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        </div>
      )}
      {error && <p className="pl-8 text-xs text-red-600">{error}</p>}
    </li>
  );
}

const qLabel = (q: Quarter) => `Q${q.quarter} ${q.year}`;

// Angka realisasi per kuartal: "3.200 / 5.000 kg (64%)"; diisi oleh yang boleh mencentang item.
function Realization({
  item,
  canEdit,
  quarter,
  real,
  history,
}: {
  item: KpiItem;
  canEdit: boolean;
  quarter: Quarter;
  real: KpiRealization | null;
  history: KpiRealization[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(real ? String(real.value) : "");
  const [note, setNote] = useState(real?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!real && !canEdit && history.length === 0) return null;

  const unit = item.target_unit ? ` ${item.target_unit}` : "";
  const pctOf = (v: number) => achievement(v, item.target_value);
  const p = real ? pctOf(real.value) : null;

  async function save(v: number | null) {
    setError("");
    setPending(true);
    const res = await setKpiRealization(item.id, quarter.year, quarter.quarter, v, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5 pl-8 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-slate-600">
          Realisasi {qLabel(quarter)}:{" "}
          {real ? (
            <b className="text-slate-900">
              {formatNumber(real.value)}
              {item.target_value != null ? ` / ${formatNumber(item.target_value)}` : ""}
              {unit}
              {p != null && <span className={p >= 100 ? "text-logo-leaf" : p >= 50 ? "text-brand-700" : "text-red-700"}> ({p}%)</span>}
            </b>
          ) : (
            <span className="text-slate-400">belum diisi</span>
          )}
        </span>
        {canEdit && !open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded px-1.5 py-0.5 font-medium text-brand-700 hover:bg-brand-50">
            {real ? "Ubah angka" : "Isi angka"}
          </button>
        )}
        {history.length > 0 && (
          <span className="text-slate-400">
            Riwayat:{" "}
            {history
              .map((h) => {
                const hp = pctOf(h.value);
                return `${qLabel(h)} ${formatNumber(h.value)}${hp != null ? ` (${hp}%)` : ""}`;
              })
              .join(" · ")}
          </span>
        )}
      </div>
      {p != null && (
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${p >= 100 ? "bg-logo-leaf" : "bg-brand-600"}`} style={{ width: `${Math.min(100, p)}%` }} />
        </div>
      )}
      {real?.note && !open && <p className="text-slate-500">{real.note}</p>}
      {open && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            <span>
              Angka {unit && <span className="font-normal text-slate-500">({unit.trim()})</span>}
            </span>
            <input
              type="number"
              step="any"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base outline-none focus:border-brand-600"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 font-medium text-slate-700">
            Keterangan (boleh kosong)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. alasan belum tercapai, sumber data"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base outline-none focus:border-brand-600"
            />
          </label>
          <button
            type="button"
            disabled={pending || value === ""}
            onClick={() => save(Number(value))}
            className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {pending ? "Menyimpan..." : "Simpan"}
          </button>
          {real && (
            <button type="button" disabled={pending} onClick={() => save(null)} className="rounded-lg px-2 py-1.5 text-sm text-red-700 hover:bg-red-50">
              Hapus angka
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Batal
          </button>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
