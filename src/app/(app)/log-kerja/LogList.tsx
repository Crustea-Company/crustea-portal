"use client";

import { useCallback, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { formatDuration, formatHours } from "@/lib/ats";
import { adminDeleteWorkLog, deleteWorkLog } from "./actions";
import { EditLogForm } from "./LogForm";

export type WorkLog = {
  id: string;
  log_date: string;
  activity: string;
  minutes: number;
  proof: string | null;
  is_correction: boolean;
};

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export default function LogList({
  logs,
  locked,
  adminMode,
  today,
}: {
  logs: WorkLog[];
  locked: boolean;
  adminMode: boolean; // admin mengoreksi log orang lain / periode tertutup: wajib alasan
  today: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEdit = useCallback(() => setEditingId(null), []);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = logs.reduce((t, l) => t + l.minutes, 0);

  const canModify = !locked || adminMode;

  function remove(log: WorkLog) {
    const label = `"${log.activity}" (${formatDate(log.log_date)})`;
    let reason = "";
    if (adminMode) {
      reason = window.prompt(`Alasan menghapus log ${label}? (wajib, tercatat di riwayat)`)?.trim() ?? "";
      if (!reason) return;
    } else if (!window.confirm(`Hapus log ${label}?`)) {
      return;
    }
    setMessage(null);
    setPendingId(log.id);
    startTransition(async () => {
      const result = adminMode ? await adminDeleteWorkLog(log.id, reason) : await deleteWorkLog(log.id);
      setPendingId(null);
      if (!result.ok) setMessage(result.message ?? "Gagal menghapus.");
    });
  }

  if (logs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        Belum ada log di periode ini.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-600">
        {logs.length} catatan · total {formatHours(total)} jam
        {locked && " · periode sudah ditutup"}
      </p>
      {message && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>
      )}
      {logs.map((log) => (
        <article
          key={log.id}
          className={`rounded-xl border border-slate-200 bg-white p-3 text-sm ${
            pendingId === log.id ? "opacity-50" : ""
          }`}
        >
          {editingId === log.id ? (
            <EditLogForm id={log.id} today={today} defaults={log} adminMode={adminMode} onDone={closeEdit} />
          ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {formatDate(log.log_date)} · {formatDuration(log.minutes)}
                {log.is_correction && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                    Koreksi
                  </span>
                )}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-slate-900">{log.activity}</p>
              {log.proof && (
                <p className="mt-1 truncate text-xs text-slate-500">
                  Bukti:{" "}
                  {isUrl(log.proof) ? (
                    <a href={log.proof} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">
                      {log.proof}
                    </a>
                  ) : (
                    log.proof
                  )}
                </p>
              )}
            </div>
            {canModify && (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setEditingId(log.id);
                  }}
                  disabled={pendingId === log.id}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() => remove(log)}
                  disabled={pendingId === log.id}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Hapus
                </button>
              </div>
            )}
          </div>
          )}
        </article>
      ))}
    </div>
  );
}
