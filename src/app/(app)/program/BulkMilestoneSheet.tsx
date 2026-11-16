"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { milestonePeople, milestoneSheetDef, type MilestoneSheetCtx, type MilestoneSheetOp, type MilestoneSheetRow } from "@/lib/bulk-milestones";
import { download } from "@/lib/xlsx-core";
import { applyMilestoneSheet, fetchMilestonesForSheet } from "./actions";

const CHUNK = 10; // milestone per kiriman ke server

// Ekspor–ubah–impor massal untuk Milestone program. File dibaca di browser; tidak disimpan di server.
export default function BulkMilestoneSheet({ rows, ctx, exportedBy, fileName }: { rows: MilestoneSheetRow[]; ctx: MilestoneSheetCtx; exportedBy: string; fileName: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = milestoneSheetDef(ctx);
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: true,
      async exportFile() {
        const wb = await buildWorkbook(def, rows, { exportedAt: stamp(), exportedBy });
        await download(wb, fileName);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchMilestonesForSheet(parsed.rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n)));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.rows.map((r) => [String(r.m.id), rowValues(def, r)]));
        return {
          items: diffRows(def, parsed, current, { people: milestonePeople(ctx) }),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[], baselines) {
        const ops: MilestoneSheetOp[] = items
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
          const res = await applyMilestoneSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [rows, ctx, exportedBy, fileName]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}

