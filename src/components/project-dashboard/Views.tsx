// Bagian dashboard realisasi proyek yang hanya menampilkan (dipakai halaman karyawan dan halaman investor).
import { formatNumber } from "@/lib/format";
import {
  BUDGET_KIND_LABEL,
  stockItemLabel,
  type BudgetReport,
  type ProfitReport,
  type StockBalance,
} from "@/lib/project-ledger";

export const rp = (n: number) => `${n < 0 ? "−" : ""}Rp${formatNumber(Math.round(Math.abs(n)))}`;
export const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? "-" : `${formatNumber(Math.round(n * 1000) / 10)}%`);
export const qty = (n: number) => formatNumber(Math.round(n * 1000) / 1000);
const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

function Bar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? value / max : value > 0 ? 2 : 0;
  const over = ratio > 1.0001;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

// ---------- Kartu ringkas ----------
export function SummaryCards({ budget, profit }: { budget: BudgetReport; profit: ProfitReport }) {
  const remaining = budget.costBudget - budget.costActual;
  const items: { label: string; value: string; sub?: string; tone?: string }[] = [
    { label: "Anggaran biaya", value: rp(budget.costBudget), sub: budget.incomeBudget ? `Target pendapatan ${rp(budget.incomeBudget)}` : undefined },
    {
      label: "Realisasi biaya",
      value: rp(budget.costActual),
      sub: `${pct(budget.costBudget ? budget.costActual / budget.costBudget : null)} terserap${budget.unpaid ? ` · belum dibayar ${rp(budget.unpaid)}` : ""}`,
      tone: budget.costBudget && budget.costActual > budget.costBudget ? "text-red-700" : undefined,
    },
    { label: "Sisa anggaran", value: rp(remaining), tone: remaining < 0 ? "text-red-700" : undefined, sub: budget.outsideTotal ? `Di luar anggaran ${rp(budget.outsideTotal)}` : undefined },
    { label: "Pemasukan", value: rp(profit.income), sub: budget.incomeBudget ? `${pct(profit.income / budget.incomeBudget)} dari target` : undefined },
    {
      label: "Laba / rugi operasional",
      value: rp(profit.gross),
      sub: profit.margin !== null ? `Margin ${pct(profit.margin)}` : "Pemasukan − biaya operasional",
      tone: profit.gross < 0 ? "text-red-700" : "text-brand-800",
    },
    {
      label: "Saldo kas proyek",
      value: rp(profit.cash),
      sub: "Modal masuk + pemasukan − biaya − capex",
      tone: profit.cash < 0 ? "text-red-700" : undefined,
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">{i.label}</p>
          <p className={`text-lg font-bold tabular-nums ${i.tone ?? "text-slate-900"}`}>{i.value}</p>
          {i.sub && <p className="text-xs text-slate-500">{i.sub}</p>}
        </div>
      ))}
    </section>
  );
}

// ---------- Anggaran vs realisasi ----------
export function BudgetSection({ report }: { report: BudgetReport }) {
  if (report.groups.length === 0 && report.outside.length === 0) {
    return (
      <section className={card}>
        <h2 className="font-semibold text-slate-900">Anggaran vs realisasi</h2>
        <p className="mt-2 text-sm text-slate-500">Anggaran belum diisi.</p>
      </section>
    );
  }
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Anggaran vs realisasi</h2>
        <p className="text-xs text-slate-500">Klik kelompok untuk melihat rincian per item</p>
      </div>
      <ul className="flex flex-col gap-2">
        {report.groups.map((g) => {
          const over = g.kind !== "income" && g.actual > g.budget;
          return (
            <li key={`${g.kind}-${g.grp}`}>
              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none flex-col gap-1.5 p-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-medium text-slate-900">
                      {g.grp}{" "}
                      <span className="text-xs font-normal text-slate-500">· {BUDGET_KIND_LABEL[g.kind]}</span>
                    </p>
                    <p className="text-sm tabular-nums">
                      <span className={over ? "font-semibold text-red-700" : "font-semibold text-slate-900"}>{rp(g.actual)}</span>
                      <span className="text-slate-500"> / {rp(g.budget)} · {pct(g.budget ? g.actual / g.budget : null)}</span>
                    </p>
                  </div>
                  <Bar value={g.actual} max={g.budget} />
                </summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Anggaran</th>
                        <th className="px-3 py-2 text-right font-medium">Realisasi</th>
                        <th className="px-3 py-2 text-right font-medium">Sisa</th>
                        <th className="px-3 py-2 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map(({ line, actual, unpaid }) => {
                        const lineOver = g.kind !== "income" && actual > line.amount;
                        return (
                          <tr key={line.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2">
                              <p className="text-slate-900">{line.item}</p>
                              <p className="text-xs text-slate-500">
                                {[line.note, line.qty ? `${qty(line.qty)} ${line.uom ?? ""} × ${rp(line.price)}` : null].filter(Boolean).join(" · ")}
                                {unpaid > 0 && <span className="text-amber-700"> · belum dibayar {rp(unpaid)}</span>}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{rp(line.amount)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${lineOver ? "font-semibold text-red-700" : ""}`}>{actual ? rp(actual) : "-"}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${line.amount - actual < 0 && g.kind !== "income" ? "text-red-700" : ""}`}>
                              {rp(line.amount - actual)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{pct(line.amount ? actual / line.amount : null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          );
        })}
        <li className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-slate-900">Pengeluaran di luar anggaran</p>
            <p className="text-sm font-semibold tabular-nums text-amber-800">{rp(report.outsideTotal)}</p>
          </div>
          {report.outside.length > 0 ? (
            <ul className="mt-1 text-xs text-slate-600">
              {report.outside.slice(0, 8).map((t) => (
                <li key={t.id}>
                  {t.description} · {t.category} · <span className="tabular-nums">{rp(t.amount)}</span>
                </li>
              ))}
              {report.outside.length > 8 && <li>… dan {report.outside.length - 8} transaksi lain (lihat jurnal)</li>}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Tidak ada.</p>
          )}
        </li>
      </ul>
    </section>
  );
}

// ---------- Laba rugi ----------
export function ProfitSection({ report, showShares }: { report: ProfitReport; showShares: boolean }) {
  const row = (label: string, value: number, opts: { bold?: boolean; indent?: boolean; muted?: boolean } = {}) => (
    <div className={`flex justify-between gap-3 py-1 ${opts.bold ? "border-t border-slate-200 font-semibold" : ""}`}>
      <span className={`${opts.indent ? "pl-3" : ""} ${opts.muted ? "text-slate-500" : "text-slate-700"}`}>{label}</span>
      <span className={`tabular-nums ${value < 0 ? "text-red-700" : opts.bold ? "text-slate-900" : "text-slate-700"}`}>{rp(value)}</span>
    </div>
  );
  return (
    <section className={`${card} flex flex-col gap-4`}>
      <h2 className="font-semibold text-slate-900">Laba rugi</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-sm">
          {row("Pemasukan", report.income, { bold: false })}
          {report.incomeByCategory.map((c) => (
            <div key={`i-${c.category}`}>{row(c.category, c.amount, { indent: true, muted: true })}</div>
          ))}
          {row("Biaya operasional", -report.expense)}
          {report.expenseByCategory.map((c) => (
            <div key={`e-${c.category}`}>{row(c.category, -c.amount, { indent: true, muted: true })}</div>
          ))}
          {row("Laba / rugi operasional", report.gross, { bold: true })}
          {(report.bonus > 0 || report.zakat > 0) && (
            <>
              {report.bonus > 0 && row("Bonus tim", -report.bonus, { indent: true, muted: true })}
              {report.zakat > 0 && row("Zakat", -report.zakat, { indent: true, muted: true })}
              {row("Laba bersih", report.net, { bold: true })}
            </>
          )}
          {showShares && report.investorShare !== null && (
            <>
              {row("Bagian investor", report.investorShare, { indent: true })}
              {row("Bagian Crustea", report.crusteaShare ?? 0, { indent: true })}
            </>
          )}
        </div>
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Arus kas proyek</p>
          {row("Modal masuk", report.capitalIn)}
          {row("Pemasukan", report.income)}
          {row("Biaya operasional", -report.expense)}
          {row("Investasi awal (capex)", -report.capex)}
          {row("Saldo kas", report.cash, { bold: true })}
          <p className="mt-2 text-xs text-slate-500">
            Laba rugi operasional tidak memasukkan capex dan modal masuk. Bonus, zakat, dan bagi hasil memakai persen dari RAB proyek.
          </p>
        </div>
      </div>

      {report.cycles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Per siklus</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Siklus</th>
                  {report.cycleCategories.map((c) => (
                    <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total biaya</th>
                  <th className="px-3 py-2 text-right font-medium">Pemasukan</th>
                  <th className="px-3 py-2 text-right font-medium">Laba/rugi</th>
                  <th className="px-3 py-2 text-right font-medium">Panen (kg)</th>
                  <th className="px-3 py-2 text-right font-medium">FCR</th>
                  <th className="px-3 py-2 text-right font-medium">SR</th>
                </tr>
              </thead>
              <tbody>
                {report.cycles.map((c) => (
                  <tr key={c.cycle} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{c.cycle}</td>
                    {report.cycleCategories.map((k) => (
                      <td key={k} className="px-3 py-2 text-right tabular-nums">{c.costByCategory[k] ? rp(c.costByCategory[k]) : "-"}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{rp(c.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rp(c.income)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${c.profit < 0 ? "text-red-700" : "text-brand-800"}`}>{rp(c.profit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.harvestKg ? qty(c.harvestKg) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.fcr === null ? "-" : formatNumber(Math.round(c.fcr * 100) / 100)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(c.survival)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            FCR = pakan (kg) ÷ panen (kg). SR (survival rate) = perkiraan ekor dipanen (kg × ekor per kg) ÷ benih ditebar (ekor).
          </p>
        </div>
      )}

      {report.months.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Per bulan</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Bulan</th>
                  <th className="px-3 py-2 text-right font-medium">Modal masuk</th>
                  <th className="px-3 py-2 text-right font-medium">Pemasukan</th>
                  <th className="px-3 py-2 text-right font-medium">Biaya</th>
                  <th className="px-3 py-2 text-right font-medium">Capex</th>
                  <th className="px-3 py-2 text-right font-medium">Laba/rugi</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => (
                  <tr key={m.month} className="border-t border-slate-100">
                    <td className="px-3 py-2">{monthLabel(m.month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.capitalIn ? rp(m.capitalIn) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.income ? rp(m.income) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.expense ? rp(m.expense) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.capex ? rp(m.capex) : "-"}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${m.profit < 0 ? "text-red-700" : ""}`}>{rp(m.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Stok ----------
export function StockSection({ balances }: { balances: StockBalance[] }) {
  if (balances.length === 0) return null;
  const materials = balances.filter((b) => b.item.kind === "material");
  const products = balances.filter((b) => b.item.kind === "product");
  const th = "px-3 py-2 text-right font-medium";
  const td = "px-3 py-2 text-right tabular-nums";
  return (
    <section className={`${card} flex flex-col gap-4`}>
      <h2 className="font-semibold text-slate-900">Stok</h2>
      {materials.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Bahan baku (belum dipacking)</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Bahan</th>
                  <th className={th}>Diterima</th>
                  <th className={th}>Terpakai packing</th>
                  <th className={th}>Penyesuaian</th>
                  <th className={th}>Sisa</th>
                  <th className={th}>Rencana</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((b) => (
                  <tr key={b.item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{stockItemLabel(b.item)}</td>
                    <td className={td}>{qty(b.received)}</td>
                    <td className={td}>{qty(b.used)}</td>
                    <td className={td}>{qty(b.adjust)}</td>
                    <td className={`${td} font-semibold ${b.balance < 0 ? "text-red-700" : ""}`}>
                      {qty(b.balance)} {b.item.unit}
                    </td>
                    <td className={`${td} text-slate-500`}>{qty(b.item.plan_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Produk jadi</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Produk</th>
                  <th className={th}>Dipacking</th>
                  <th className={th}>Terjual</th>
                  <th className={th}>Sampel</th>
                  <th className={th}>Rusak</th>
                  <th className={th}>Retur</th>
                  <th className={th}>Opname</th>
                  <th className={th}>Tersedia</th>
                  <th className={th}>Rencana</th>
                  <th className={th}>Nilai @harga jual</th>
                </tr>
              </thead>
              <tbody>
                {products.map((b) => (
                  <tr key={b.item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{stockItemLabel(b.item)}</td>
                    <td className={td}>{qty(b.received)}</td>
                    <td className={td}>{qty(b.sold)}</td>
                    <td className={td}>{qty(b.sample)}</td>
                    <td className={td}>{qty(b.damaged)}</td>
                    <td className={td}>{qty(b.returned)}</td>
                    <td className={td}>{qty(b.adjust)}</td>
                    <td className={`${td} font-semibold ${b.balance < 0 ? "text-red-700" : ""}`}>
                      {qty(b.balance)} {b.item.unit}
                    </td>
                    <td className={`${td} text-slate-500`}>{qty(b.item.plan_qty)}</td>
                    <td className={td}>{rp(b.value)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className={td}>{qty(products.reduce((s, b) => s + b.received, 0))}</td>
                  <td className={td}>{qty(products.reduce((s, b) => s + b.sold, 0))}</td>
                  <td className={td} colSpan={4} />
                  <td className={td}>{qty(products.reduce((s, b) => s + b.balance, 0))}</td>
                  <td className={`${td} text-slate-500`}>{qty(products.reduce((s, b) => s + b.item.plan_qty, 0))}</td>
                  <td className={td}>{rp(products.reduce((s, b) => s + b.value, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
