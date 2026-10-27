"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatWeeks, type KpiItem } from "@/lib/kpi";
import { updateKpiItem } from "./actions";

// Satu item KPI: centang selesai + catatan realisasi (bagi yang berhak).
export default function KpiItemRow({ item, canEdit, deptName }: { item: KpiItem; canEdit: boolean; deptName: string }) {
  const router = useRouter();
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
