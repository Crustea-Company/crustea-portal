"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { SH, stockSheetDef, type StockSheetCtx, type StockSheetOp, type StockSheetRow } from "@/lib/bulk-stock";
import { download } from "@/lib/xlsx-core";
import { applyStockSheet, fetchStockForSheet } from "./actions";

const CHUNK = 10; // barang per kiriman ke server

// Ekspor–ubah–impor massal untuk barang stok + stok opname. File dibaca di browser; tidak disimpan di server.
export default function BulkStockSheet({ rows, ctx, exportedBy, today }: { rows: StockSheetRow[]; ctx: StockSheetCtx; exportedBy: string; today: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = stockSheetDef(ctx);
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: false,
      async exportFile() {
        const wb = await buildWorkbook(def, rows, { exportedAt: stamp(), exportedBy });
        await download(wb, `stok-${today}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchStockForSheet(parsed.rows.map((r) => r.id).filter(Boolean));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.rows.map((r) => [r.item.id, rowValues(def, r)]));
        return {
          items: diffRows(def, parsed, current),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[], baselines) {
        const ops: StockSheetOp[] = items
          .filter((i) => i.action === "add" || i.action === "update")
          .map((i) => ({
            op: i.action as "add" | "update",
            id: i.id,
            line: i.line,
            label: i.label,
            changes: i.changes.map(({ col, from, to }) => ({ col, from, to })),
            // Stok tercatat saat ekspor (atau saat pratinjau bila file tanpa _asal): dasar hitungan opname.
            expectOnHand: i.changes.some((c) => c.col === SH.count) ? (baselines?.get(i.id)?.[SH.onHand] ?? i.target?.[SH.onHand]) : undefined,
          }));
        const results: ApplyResult[] = [];
        for (let k = 0; k < ops.length; k += CHUNK) {
          const res = await applyStockSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [rows, ctx, exportedBy, today]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
