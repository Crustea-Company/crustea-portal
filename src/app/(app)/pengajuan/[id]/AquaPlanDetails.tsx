import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { computeRab, type RabData } from "@/lib/aquaculture";

const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;
const pct = (n: number | null) => (n === null ? "-" : `${formatNumber(Math.round(n * 1000) / 10)}%`);

// Ringkasan paket kelayakan finansial + RAB Aquaculture untuk peninjau F&A dan CEO.
export default function AquaPlanDetails({ data, editable }: { data: RabData; editable: boolean }) {
  const r = computeRab(data);
  const rows: [string, string][] = [
    ["A. Capex", rp(r.capex)],
    ["B. Modal kerja", rp(r.workcap)],
    ["C. Opex", rp(r.opex)],
    ["D. Total modal", rp(r.capital)],
    ["E. Pendapatan / siklus", rp(r.revenue)],
    ["F. Laba kotor", `${rp(r.grossProfit)} (${pct(r.grossMargin)})`],
    ["Bonus + zakat", rp(r.otherExpense)],
    ["H. Laba bersih", `${rp(r.netProfit)} (${pct(r.netMargin)})`],
  ];
  if (data.params.investor_pct > 0) {
    rows.push([`Investor ${formatNumber(data.params.investor_pct)}%`, rp(r.investorShare)]);
    rows.push([`Crustea ${formatNumber(100 - data.params.investor_pct)}%`, rp(r.crusteaShare)]);
  }
  rows.push(
    ["ROI / tahun", pct(r.roiYear)],
    ["Payback", r.paybackYears === null ? "Tidak balik modal" : `${formatNumber(Math.round(r.paybackYears * 10) / 10)} tahun`],
    [`BEP produksi (${r.bep.unit || "unit"})`, r.bep.breakEvenUnits === null ? "-" : formatNumber(Math.round(r.bep.breakEvenUnits))],
    ["Potensi laba bersih / siklus", `${rp(r.scenarios[2].net)} s.d. ${rp(r.scenarios[0].net)}`],
  );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Ringkasan kelayakan finansial & RAB</h2>
      <p className="text-sm text-slate-600">
        {[data.general.project_name, data.general.location, data.general.period].filter(Boolean).join(" · ")}
      </p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-2 text-slate-600">{k}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.summary && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{data.summary}</p>}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/aquaculture/${data.project_id}/rab`}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
            editable ? "bg-brand-700 text-white hover:bg-brand-800" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {editable ? "Ubah RAB & kirim" : "Lihat RAB lengkap (semua baris)"}
        </Link>
        <Link
          href={`/aquaculture/${data.project_id}`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Halaman proyek
        </Link>
      </div>
    </section>
  );
}
