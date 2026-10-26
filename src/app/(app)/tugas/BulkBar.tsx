"use client";

import { useState, useTransition } from "react";
import type { Employee } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_ORDER, type EmployeeLite, type Sprint, type Task, type TaskStatus } from "@/lib/tasks";
import { bulkDeleteTasks, bulkUpdateTasks, type BulkPatch } from "./actions";
import PeoplePicker from "./PeoplePicker";

const field =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

// Bilah bawah saat mode "pilih banyak": ubah status / sprint / deadline / prioritas,
// tambah PIC, atau hapus semua tugas terpilih sekaligus.
export default function BulkBar({
  selectedIds,
  deletableIds,
  visibleCount,
  onSelectAll,
  onClear,
  onExit,
  onUpdated,
  onDeleted,
  onMessage,
  me,
  employees,
  departments,
  sprints,
}: {
  selectedIds: string[];
  deletableIds: string[];
  visibleCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onUpdated: (tasks: Task[]) => void;
  onDeleted: (ids: string[]) => void;
  onMessage: (m: { ok: boolean; text: string }) => void;
  me: Pick<Employee, "dept_code">;
  employees: EmployeeLite[];
  departments: { code: string; name: string }[];
  sprints: Sprint[];
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [sprint, setSprint] = useState(""); // "" = tidak diubah, "tanpa", atau id
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState(""); // "", "ya", "tidak"
  const [pic, setPic] = useState<string | null>(null);
  const [pickPic, setPickPic] = useState(false);
  const [pending, startTransition] = useTransition();

  const count = selectedIds.length;
  const nothingChosen = !status && !sprint && !deadline && !priority && !pic;
  const picName = pic ? (employees.find((e) => e.id === pic)?.full_name ?? "?") : null;

  const reset = () => {
    setStatus("");
    setSprint("");
    setDeadline("");
    setPriority("");
    setPic(null);
    setPickPic(false);
  };

  const apply = () => {
    if (!window.confirm(`Terapkan perubahan ke ${count} tugas terpilih?`)) return;
    const patch: BulkPatch = {};
    if (status) patch.status = status;
    if (sprint) patch.sprint_id = sprint === "tanpa" ? null : Number(sprint);
    if (deadline) patch.deadline = deadline;
    if (priority) patch.is_priority = priority === "ya";
    if (pic) patch.addPic = pic;
    startTransition(async () => {
      const res = await bulkUpdateTasks(selectedIds, patch);
      if (!res.ok) return onMessage({ ok: false, text: res.message });
      onUpdated(res.tasks);
      onMessage({
        ok: res.skipped === 0,
        text:
          `${res.changed} tugas diubah.` +
          (res.skipped ? ` ${res.skipped} tugas dilewati karena Anda tidak berhak mengubahnya atau tidak ada yang berubah.` : ""),
      });
      reset();
      setOpen(false);
      onClear();
    });
  };

  const remove = () => {
    if (deletableIds.length === 0) return;
    const note =
      deletableIds.length < count ? ` (${count - deletableIds.length} lainnya tidak bisa Anda hapus dan akan dilewati)` : "";
    if (!window.confirm(`Hapus ${deletableIds.length} tugas${note}? Tindakan ini tercatat di riwayat.`)) return;
    startTransition(async () => {
      const res = await bulkDeleteTasks(deletableIds);
      if (!res.ok) return onMessage({ ok: false, text: res.message });
      onDeleted(res.deleted);
      onMessage({ ok: true, text: `${res.deleted.length} tugas dihapus.` });
      onClear();
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
      {open && (
        <div className="mx-auto max-h-[60vh] max-w-6xl overflow-y-auto border-b border-slate-100 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Ubah {count} tugas terpilih</p>
          <p className="mb-3 text-xs text-slate-500">Isi hanya yang ingin diubah. Kolom yang dibiarkan tidak akan berubah.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Status baru" className={field} value={status} onChange={(e) => setStatus(e.target.value as "" | TaskStatus)}>
              <option value="">Status: tidak diubah</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  Status: {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select aria-label="Sprint baru" className={field} value={sprint} onChange={(e) => setSprint(e.target.value)}>
              <option value="">Sprint: tidak diubah</option>
              <option value="tanpa">Sprint: tanpa sprint</option>
              {sprints.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({formatDate(s.start_date)} - {formatDate(s.end_date)})
                </option>
              ))}
            </select>
            <label className={`${field} flex items-center gap-2 text-slate-500`}>
              <span className="shrink-0 text-xs">Deadline baru</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
              />
            </label>
            <select aria-label="Prioritas" className={field} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Prioritas: tidak diubah</option>
              <option value="ya">Prioritas: Ya</option>
              <option value="tidak">Prioritas: Tidak</option>
            </select>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPickPic((v) => !v)}
              className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {picName ? `Tambah PIC: ${picName} (ganti)` : "+ Tambah PIC ke semua tugas terpilih"}
            </button>
            {picName && (
              <button type="button" onClick={() => setPic(null)} className="ml-2 text-sm text-red-700">
                Batalkan PIC
              </button>
            )}
            {pickPic && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <PeoplePicker
                  employees={employees}
                  departments={departments}
                  myDept={me.dept_code}
                  selected={pic ? [pic] : []}
                  onPick={(id) => {
                    setPic(id);
                    setPickPic(false);
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={pending || nothingChosen || count === 0}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pending ? "Memproses..." : `Terapkan ke ${count} tugas`}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-900">{count} dipilih</span>
        <button type="button" onClick={onSelectAll} className="text-brand-700 hover:underline">
          Pilih semua yang tampil ({visibleCount})
        </button>
        {count > 0 && (
          <button type="button" onClick={onClear} className="text-slate-500 hover:underline">
            Kosongkan
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={count === 0}
            className="rounded-lg bg-brand-700 px-3 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Ubah…
          </button>
          {deletableIds.length > 0 && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-lg border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Hapus ({deletableIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-100"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
