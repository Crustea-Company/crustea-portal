"use client";

import { useMemo, useState } from "react";
import { ACTION_LABEL, summarize, type ApplyResult, type DiffAction, type DiffItem } from "@/lib/bulk-sheet";
import { download, newWorkbook } from "@/lib/xlsx-core";
import type { BulkPrepared } from "./BulkSheetButtons";

const TONE: Record<DiffAction, string> = {
  add: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  delete: "bg-red-100 text-red-800",
  none: "bg-slate-100 text-slate-600",
  conflict: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};
const STATUS_LABEL = { ok: "Berhasil", skipped: "Dilewati", failed: "Gagal" } as const;

const rowKey = (i: DiffItem) => `${i.line}`;

// Pratinjau perubahan dari file Excel. Tidak ada yang tersimpan sebelum tombol "Terapkan".
export default function BulkPreview({
  prepared,
  allowDelete,
  apply,
  onClose,
}: {
  prepared: BulkPrepared;
  allowDelete: boolean;
  apply: (items: DiffItem[]) => Promise<ApplyResult[]>;
  onClose: (applied: boolean) => void;
}) {
  const { items, guarded, warnings } = prepared;
  const counts = useMemo(() => summarize(items), [items]);
  const shown = items.filter((i) => i.action !== "none");
  // Tambah/ubah/hapus tercentang sejak awal; bentrok dan salah isi tidak bisa dicentang (perbaiki di Excel / ekspor ulang).
  const [picked, setPicked] = useState<Set<string>>(() => new Set(items.filter((i) => ["add", "update", "delete"].includes(i.action)).map(rowKey)));
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = shown.filter((i) => picked.has(rowKey(i)) && i.action !== "error" && i.action !== "conflict");
  const deleteCount = chosen.filter((i) => i.action === "delete").length;
  const needConfirm = allowDelete && deleteCount > 0;
  const confirmed = !needConfirm || confirmText.trim() === String(deleteCount);

  function toggle(i: DiffItem) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(rowKey(i))) n.delete(rowKey(i));
      else n.add(rowKey(i));
      return n;
    });
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResults(await apply(chosen));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menerapkan perubahan.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadResults() {
    if (!results) return;
    const wb = await newWorkbook();
    const ws = wb.addWorksheet("Hasil");
    ws.columns = [
      { header: "Baris", width: 8 },
      { header: "Data", width: 40 },
      { header: "Hasil", width: 12 },
      { header: "Keterangan", width: 70 },
    ];
    for (const r of results) ws.addRow([r.line, r.label, STATUS_LABEL[r.status], r.message]);
    ws.getRow(1).font = { bold: true };
    await download(wb, "hasil-impor.xlsx");
  }

  if (results) {
    const n = (s: ApplyResult["status"]) => results.filter((r) => r.status === s).length;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <p className="font-semibold text-slate-800">
          Selesai: {n("ok")} berhasil, {n("skipped")} dilewati, {n("failed")} gagal.
        </p>
        <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.line}-${r.id}`} className="rounded-lg bg-slate-50 px-2 py-1">
              <span className={r.status === "ok" ? "text-emerald-700" : r.status === "skipped" ? "text-amber-700" : "text-red-700"}>{STATUS_LABEL[r.status]}</span>
              {" · baris "}
              {r.line}
              {r.label ? ` · ${r.label}` : ""}
              {r.message ? ` — ${r.message}` : ""}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={downloadResults} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
            ⬇ Unduh hasil
          </button>
          <button type="button" onClick={() => onClose(true)} className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">
            Tutup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <p className="font-semibold text-slate-800">Pratinjau impor Excel — belum ada yang tersimpan</p>
      {prepared.exportedAt && <p className="text-xs text-slate-500">File diekspor {prepared.exportedAt}.</p>}
      {!guarded && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-800">
          Peringatan: file ini tidak membawa pengaman bentrok. Perubahan orang lain sejak ekspor tidak bisa dideteksi, jadi periksa dengan teliti.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        {(["add", "update", "delete", "conflict", "error"] as DiffAction[]).map((a) => (
          <span key={a}>
            {ACTION_LABEL[a]}: <b>{counts[a]}</b>
          </span>
        ))}
        <span>Tidak berubah: {counts.none}</span>
      </p>

      {shown.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600">0 perubahan. Tidak ada yang perlu diterapkan.</p>
      ) : (
        <ul className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
          {shown.map((i) => {
            const disabled = i.action === "error" || i.action === "conflict";
            return (
              <li key={rowKey(i)} className="rounded-lg border border-slate-200 p-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" disabled={disabled} checked={!disabled && picked.has(rowKey(i))} onChange={() => toggle(i)} />
                  <span className="min-w-0 flex-1">
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${TONE[i.action]}`}>{ACTION_LABEL[i.action]}</span>
                    <span className="text-xs text-slate-500">baris {i.line}</span>
                    <span className="ml-1 break-words font-medium text-slate-800">{i.label}</span>
                  </span>
                </label>
                {i.changes.length > 0 && (
                  <ul className="mt-1 pl-6 text-xs text-slate-700">
                    {i.changes.map((c) => (
                      <li key={c.col} className="break-words">
                        <b>{c.col}:</b> <span className="text-slate-500 line-through">{c.from || "(kosong)"}</span> → <span>{c.to || "(kosong)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {i.problems.length > 0 && (
                  <ul className={`mt-1 pl-6 text-xs ${i.action === "conflict" ? "text-amber-700" : "text-red-700"}`}>
                    {i.problems.map((p) => (
                      <li key={p} className="break-words">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {i.action === "conflict" && <p className="mt-1 pl-6 text-xs text-slate-500">Dilewati: data sudah diubah orang lain. Ekspor ulang lalu ulangi perubahan ini bila masih perlu.</p>}
              </li>
            );
          })}
        </ul>
      )}

      {needConfirm && (
        <label className="mt-3 block text-xs text-red-700">
          {deleteCount} baris akan DIHAPUS dan tidak bisa dibatalkan. Ketik angka {deleteCount} untuk konfirmasi:
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} inputMode="numeric" className="ml-2 w-20 rounded border border-red-300 px-2 py-1 text-slate-800" />
        </label>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || chosen.length === 0 || !confirmed}
          onClick={run}
          className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Menerapkan…" : `Terapkan ${chosen.length} baris`}
        </button>
        <button type="button" disabled={busy} onClick={() => onClose(false)} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
          Batal
        </button>
      </div>
    </div>
  );
}
