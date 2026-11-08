"use client";

import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import { TX_KIND_SHORT, isOutflow, type Tx, type TxKind } from "@/lib/project-ledger";

const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;
const KIND_STYLE: Record<TxKind, string> = {
  income: "bg-brand-100 text-brand-800",
  expense: "bg-slate-100 text-slate-700",
  capex: "bg-indigo-100 text-indigo-800",
  capital_in: "bg-amber-100 text-amber-800",
};

// Jurnal transaksi: filter + daftar + Export Excel. onEdit/onDelete hanya diberikan di halaman karyawan.
export default function JournalTable({
  transactions,
  lineNames,
  fileName,
  internal = false,
  onEdit,
  onDelete,
}: {
  transactions: Tx[];
  lineNames: Record<string, string>;
  fileName: string;
  internal?: boolean;
  onEdit?: (t: Tx) => void;
  onDelete?: (t: Tx) => void;
}) {
  const [kind, setKind] = useState<TxKind | "">("");
  const [category, setCategory] = useState("");
  const [cycle, setCycle] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => [...new Set(transactions.map((t) => t.category))].sort(), [transactions]);
  const cycles = useMemo(() => [...new Set(transactions.map((t) => t.cycle).filter((c): c is number => !!c))].sort((a, b) => a - b), [transactions]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...transactions]
      .filter(
        (t) =>
          (!kind || t.kind === kind) &&
          (!category || t.category === category) &&
          (!cycle || String(t.cycle ?? "") === cycle) &&
          (!s || `${t.description} ${t.category} ${t.pond ?? ""} ${t.note ?? ""}`.toLowerCase().includes(s)),
      )
      .sort((a, b) => b.tx_date.localeCompare(a.tx_date));
  }, [transactions, kind, category, cycle, q]);

  const totalIn = rows.filter((t) => !isOutflow(t.kind)).reduce((s, t) => s + t.amount, 0);
  const totalOut = rows.filter((t) => isOutflow(t.kind)).reduce((s, t) => s + t.amount, 0);

  async function exportExcel() {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Jurnal");
      ws.columns = [
        { header: "Tanggal", key: "date", width: 12 },
        { header: "Jenis", key: "kind", width: 14 },
        { header: "Kategori", key: "category", width: 18 },
        { header: "Uraian", key: "desc", width: 34 },
        { header: "Pos anggaran", key: "line", width: 28 },
        { header: "Siklus", key: "cycle", width: 8 },
        { header: "ID kolam", key: "pond", width: 10 },
        { header: "Volume", key: "qty", width: 10 },
        { header: "Satuan", key: "uom", width: 9 },
        { header: "Kg per sak", key: "kgsack", width: 10 },
        { header: "Ekor per kg", key: "fishkg", width: 11 },
        { header: "Harga satuan", key: "price", width: 14 },
        { header: "Masuk", key: "in", width: 14 },
        { header: "Keluar", key: "out", width: 14 },
        { header: "Status", key: "status", width: 10 },
        ...(internal
          ? [
              { header: "Bukti", key: "proof", width: 30 },
              { header: "Catatan", key: "note", width: 30 },
            ]
          : []),
      ];
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      for (const t of [...rows].reverse()) {
        ws.addRow({
          date: new Date(`${t.tx_date}T00:00:00Z`),
          kind: TX_KIND_SHORT[t.kind],
          category: t.category,
          desc: t.description,
          line: t.budget_line_id ? lineNames[t.budget_line_id] ?? "" : isOutflow(t.kind) ? "Di luar anggaran" : "",
          cycle: t.cycle ?? "",
          pond: t.pond ?? "",
          qty: t.qty ?? "",
          uom: t.uom ?? "",
          kgsack: t.kg_per_sack ?? "",
          fishkg: t.fish_per_kg ?? "",
          price: t.unit_price ?? "",
          in: isOutflow(t.kind) ? "" : t.amount,
          out: isOutflow(t.kind) ? t.amount : "",
          status: t.status === "paid" ? "Lunas" : "Belum",
          proof: t.proof ?? "",
          note: t.note ?? "",
        });
      }
      ws.getColumn("date").numFmt = "dd-mm-yyyy";
      for (const k of ["price", "in", "out"]) ws.getColumn(k).numFmt = "#,##0";
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  }

  const select = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Jenis" value={kind} onChange={(e) => setKind(e.target.value as TxKind | "")} className={select}>
          <option value="">Semua jenis</option>
          {(Object.keys(TX_KIND_SHORT) as TxKind[]).map((k) => (
            <option key={k} value={k}>{TX_KIND_SHORT[k]}</option>
          ))}
        </select>
        <select aria-label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} className={select}>
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {cycles.length > 0 && (
          <select aria-label="Siklus" value={cycle} onChange={(e) => setCycle(e.target.value)} className={select}>
            <option value="">Semua siklus</option>
            {cycles.map((c) => (
              <option key={c} value={String(c)}>Siklus {c}</option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari uraian"
          className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
        />
        <button
          type="button"
          disabled={busy || rows.length === 0}
          onClick={exportExcel}
          className="ml-auto rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100 disabled:opacity-60"
        >
          ⬇ Export ke Excel
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {formatNumber(rows.length)} transaksi · masuk <span className="font-semibold tabular-nums text-brand-800">{rp(totalIn)}</span> · keluar{" "}
        <span className="font-semibold tabular-nums text-slate-800">{rp(totalOut)}</span>
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Belum ada transaksi.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>{formatDate(t.tx_date)}</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${KIND_STYLE[t.kind]}`}>{TX_KIND_SHORT[t.kind]}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.category}</span>
                  {t.cycle && <span>Siklus {t.cycle}</span>}
                  {t.pond && <span>· Kolam {t.pond}</span>}
                  {t.status === "unpaid" && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Belum dibayar</span>}
                </div>
                <p className="mt-0.5 font-medium text-slate-900">{t.description}</p>
                <p className="text-xs text-slate-500">
                  {t.qty !== null && (
                    <>
                      {formatNumber(t.qty)} {t.uom ?? ""}
                      {t.unit_price !== null && <> × {rp(t.unit_price)}</>}
                      {t.kg_per_sack && <> · {formatNumber(t.kg_per_sack)} kg/sak</>}
                      {t.fish_per_kg && <> · {formatNumber(t.fish_per_kg)} ekor/kg</>}
                      {" · "}
                    </>
                  )}
                  {t.budget_line_id ? (
                    <>Pos: {lineNames[t.budget_line_id] ?? "-"}</>
                  ) : isOutflow(t.kind) ? (
                    <span className="text-amber-700">Di luar anggaran</span>
                  ) : null}
                </p>
                {internal && (t.note || t.proof || t.creator) && (
                  <p className="text-xs text-slate-500">
                    {t.proof && (
                      <a href={t.proof} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
                        Bukti
                      </a>
                    )}
                    {t.proof && (t.note || t.creator) && " · "}
                    {t.note}
                    {t.note && t.creator && " · "}
                    {t.creator && <>dicatat {t.creator.full_name}</>}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                <p className={`font-semibold tabular-nums ${isOutflow(t.kind) ? "text-slate-900" : "text-brand-800"}`}>
                  {isOutflow(t.kind) ? "−" : "+"}
                  {rp(t.amount)}
                </p>
                {(onEdit || onDelete) && (
                  <div className="flex gap-1">
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(t)} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                        Ubah
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(t)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                        Hapus
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
