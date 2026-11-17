"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { productSheetDef, type ProductSheetOp } from "@/lib/bulk-products";
import type { Product } from "@/lib/commission";
import { download } from "@/lib/xlsx-core";
import { applyProductSheet, fetchProductsForSheet } from "./actions";

const CHUNK = 10; // versi produk per kiriman ke server

// Ekspor–ubah–impor massal untuk Master produk. File dibaca di browser; tidak disimpan di server.
export default function BulkProductSheet({ products, exportedBy, today }: { products: Product[]; exportedBy: string; today: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = productSheetDef();
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: false,
      async exportFile() {
        const wb = await buildWorkbook(def, products, { exportedAt: stamp(), exportedBy });
        await download(wb, `master-produk-${today}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchProductsForSheet(parsed.rows.map((r) => r.id).filter(Boolean));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.products.map((p) => [p.id, rowValues(def, p)]));
        return {
          items: diffRows(def, parsed, current),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[]) {
        const ops: ProductSheetOp[] = items
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
          const res = await applyProductSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [products, exportedBy, today]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
