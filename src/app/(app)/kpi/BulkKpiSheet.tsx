"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { kpiSheetDef, type KpiSheetOp, type KpiSheetRow } from "@/lib/bulk-kpi";
import { quarterParam, type Quarter } from "@/lib/kpi";
import { download } from "@/lib/xlsx-core";
import { applyKpiSheet, fetchKpiForSheet } from "./actions";

const CHUNK = 10; // item per kiriman ke server

// Ekspor–ubah–impor massal untuk Realisasi KPI satu kuartal. File dibaca di browser; tidak disimpan di server.
export default function BulkKpiSheet({ rows, quarter, exportedBy }: { rows: KpiSheetRow[]; quarter: Quarter; exportedBy: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = kpiSheetDef(quarter);
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: false,
      async exportFile() {
        const wb = await buildWorkbook(def, rows, { exportedAt: stamp(), exportedBy });
        await download(wb, `realisasi-kpi-${quarterParam(quarter)}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const ids = parsed.rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n));
        const res = await fetchKpiForSheet(ids, quarter.year, quarter.quarter);
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.rows.map((r) => [String(r.item.id), rowValues(def, r)]));
        return {
          items: diffRows(def, parsed, current),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[]) {
        const ops: KpiSheetOp[] = items
          .filter((i) => i.action === "update")
          .map((i) => ({ id: Number(i.id), line: i.line, label: i.label, changes: i.changes.map(({ col, from, to }) => ({ col, from, to })) }));
        const results: ApplyResult[] = [];
        for (let k = 0; k < ops.length; k += CHUNK) {
          const res = await applyKpiSheet(quarter.year, quarter.quarter, ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [rows, quarter, exportedBy]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
