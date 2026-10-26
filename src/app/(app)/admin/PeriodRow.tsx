"use client";

import { useState, useTransition } from "react";
import { closePeriod, reopenPeriod } from "./actions";

export type PeriodInfo = {
  month: string;
  label: string;
  range: string;
  state: "running" | "open" | "locked";
  lockedAt: string | null;
  snapshotCount: number;
};

export default function PeriodRow({ period }: { period: PeriodInfo }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const isRelock = period.state === "open" && period.snapshotCount > 0;
  const actionLabel =
    period.state === "locked" ? "Buka ulang" : isRelock ? "Kunci ulang" : "Tutup periode";
  const reasonRequired = period.state === "locked";

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res =
        period.state === "locked"
          ? await reopenPeriod(period.month, reason)
          : await closePeriod(period.month, reason);
      setResult(res);
      if (res.ok) {
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{period.label}</p>
          <p className="text-xs text-slate-500">{period.range}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              period.state === "locked"
                ? "bg-slate-800 text-white"
                : period.state === "running"
                  ? "bg-sky-100 text-sky-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {period.state === "locked" ? "Ditutup" : period.state === "running" ? "Berjalan" : "Terbuka"}
          </span>
          {period.state !== "running" && !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Snapshot: {period.snapshotCount} karyawan
        {period.lockedAt && ` · ditutup ${period.lockedAt}`}
      </p>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
          {period.state === "locked" ? (
            <p className="text-xs text-slate-600">
              Membuka periode membuat karyawan bisa kembali mengubah dan menghapus log di periode ini.
              Snapshot yang sudah ada tetap tersimpan dan tidak dihitung ulang.
            </p>
          ) : isRelock ? (
            <p className="text-xs text-slate-600">
              Periode ini pernah ditutup. Snapshot lama ({period.snapshotCount} karyawan) tetap dipakai dan
              tidak dihitung ulang. Snapshot baru hanya dibuat untuk karyawan yang belum punya.
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Sistem akan menyimpan ketercapaian setiap karyawan aktif yang wajib ATS. Nilai ini dikunci
              dan dipakai sebagai dasar remunerasi.
            </p>
          )}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={reasonRequired ? "Alasan (wajib)" : "Catatan (boleh kosong)"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending || (reasonRequired && !reason.trim())}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {pending ? "Memproses..." : actionLabel}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`mt-2 text-xs ${result.ok ? "text-teal-700" : "text-red-700"}`}>{result.message}</p>
      )}
    </li>
  );
}
