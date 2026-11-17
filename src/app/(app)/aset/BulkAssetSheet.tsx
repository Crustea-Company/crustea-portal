"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { assetSheetDef, type AssetSheetOp } from "@/lib/bulk-assets";
import type { Asset } from "@/lib/sales";
import { download } from "@/lib/xlsx-core";
import { applyAssetSheet, fetchAssetsForSheet } from "./actions";

const CHUNK = 10; // aset per kiriman ke server

// Ekspor–ubah–impor massal untuk Aset. File dibaca di browser; tidak disimpan di server.
export default function BulkAssetSheet({ assets, exportedBy, today }: { assets: Asset[]; exportedBy: string; today: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = assetSheetDef();
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: false,
      async exportFile() {
        const wb = await buildWorkbook(def, assets, { exportedAt: stamp(), exportedBy });
        await download(wb, `aset-${today}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchAssetsForSheet(parsed.rows.map((r) => r.id).filter(Boolean));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.assets.map((a) => [a.id, rowValues(def, a)]));
        return {
          items: diffRows(def, parsed, current),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[]) {
        const ops: AssetSheetOp[] = items
          .filter((i) => i.action === "add" || i.action === "update")
          .map((i) => ({
            op: i.action as "add" | "update",
            id: i.id,
            line: i.line,
            label: i.label,
            changes: i.changes.map(({ col, from, to }) => ({ col, from, to })),
          }));
        const results: ApplyResult[] = [];
        for (let k = 0; k < ops.length; k += CHUNK) {
          const res = await applyAssetSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [assets, exportedBy, today]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
