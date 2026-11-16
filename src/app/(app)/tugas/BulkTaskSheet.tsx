"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { taskSheetDef, taskSheetPeople, type TaskSheetCtx, type TaskSheetOp } from "@/lib/bulk-tasks";
import type { Task } from "@/lib/tasks";
import { download } from "@/lib/xlsx-core";
import { applyTaskSheet, fetchTasksForSheet } from "./actions";

const CHUNK = 10; // tugas per kiriman ke server (tiap tugas butuh beberapa kali bicara ke database)

// Ekspor–ubah–impor massal untuk Tugas. File dibaca di browser; server hanya menerima perubahan yang disetujui di pratinjau.
export default function BulkTaskSheet({ tasks, ctx, exportedBy, today }: { tasks: Task[]; ctx: TaskSheetCtx; exportedBy: string; today: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = taskSheetDef(ctx);
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: true,
      async exportFile() {
        const wb = await buildWorkbook(def, tasks, { exportedAt: stamp(), exportedBy });
        await download(wb, `tugas-${today}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchTasksForSheet(parsed.rows.map((r) => r.id).filter(Boolean));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.tasks.map((t) => [t.id, rowValues(def, t)]));
        const items = diffRows(def, parsed, current, { people: taskSheetPeople(ctx) });
        return {
          items,
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[], baselines) {
        const ops: TaskSheetOp[] = items
          .filter((i) => i.action === "add" || i.action === "update" || i.action === "delete")
          .map((i) => ({
            op: i.action as "add" | "update" | "delete",
            id: i.id,
            line: i.line,
            label: i.label,
            changes: i.changes.map(({ col, from, to }) => ({ col, from, to })),
            baseline: i.action === "delete" ? baselines?.get(i.id) : undefined,
          }));
        const results: ApplyResult[] = [];
        for (let k = 0; k < ops.length; k += CHUNK) {
          const res = await applyTaskSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [tasks, ctx, exportedBy, today]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
