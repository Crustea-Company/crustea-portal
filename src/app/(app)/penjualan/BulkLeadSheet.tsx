"use client";

import { useMemo } from "react";
import BulkSheetButtons, { type BulkModule } from "@/components/bulk/BulkSheetButtons";
import { buildWorkbook, diffRows, parseWorkbook, rowValues, type ApplyResult, type DiffItem, type RowValues } from "@/lib/bulk-sheet";
import { leadPeople, leadSheetDef, type LeadSheetCtx, type LeadSheetOp } from "@/lib/bulk-leads";
import type { Lead } from "@/lib/sales";
import { download } from "@/lib/xlsx-core";
import { applyLeadSheet, fetchLeadsForSheet } from "./actions";

const CHUNK = 10; // lead per kiriman ke server

// Ekspor–ubah–impor massal untuk Lead penjualan. File dibaca di browser; tidak disimpan di server.
export default function BulkLeadSheet({ leads, ctx, exportedBy, today }: { leads: Lead[]; ctx: LeadSheetCtx; exportedBy: string; today: string }) {
  const sheet = useMemo<BulkModule>(() => {
    const def = leadSheetDef(ctx);
    const stamp = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    return {
      allowDelete: false,
      async exportFile() {
        const wb = await buildWorkbook(def, leads, { exportedAt: stamp(), exportedBy });
        await download(wb, `lead-penjualan-${today}.xlsx`);
      },
      async prepare(file) {
        const parsed = await parseWorkbook(def, file);
        const res = await fetchLeadsForSheet(parsed.rows.map((r) => r.id).filter(Boolean));
        if (!res.ok) throw new Error(res.message);
        const current = new Map<string, RowValues>(res.leads.map((l) => [l.id, rowValues(def, l)]));
        return {
          items: diffRows(def, parsed, current, { people: leadPeople(ctx) }),
          guarded: parsed.original !== null,
          warnings: parsed.warnings.filter((w) => !w.includes("_asal")),
          exportedAt: parsed.meta ? `${parsed.meta.exportedAt} oleh ${parsed.meta.exportedBy}` : undefined,
          baselines: parsed.original,
        };
      },
      async apply(items: DiffItem[]) {
        const ops: LeadSheetOp[] = items
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
          const res = await applyLeadSheet(ops.slice(k, k + CHUNK));
          if (!res.ok) throw new Error(`${res.message} (${results.length} baris sudah diproses sebelumnya.)`);
          results.push(...res.results);
        }
        return results;
      },
    };
  }, [leads, ctx, exportedBy, today]);

  return <BulkSheetButtons module={sheet} onApplied={() => window.location.reload()} />;
}
