"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatNumber } from "@/lib/format";
import {
  computeRab,
  lineTotal,
  monthlyDepreciation,
  revenueTotal,
  type CapexLine,
  type CostLine,
  type RabData,
  type RevenueLine,
} from "@/lib/aquaculture";
import { AQUAGROWTH_TEMPLATE } from "@/lib/aquaculture-template";
import { saveAquaPlan } from "../../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50 disabled:text-slate-700";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600";
const card = "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;
const pct = (n: number | null) => (n === null ? "-" : `${formatNumber(Math.round(n * 10000) / 100)}%`);
const dec = (n: number, digits = 2) => formatNumber(Math.round(n * 10 ** digits) / 10 ** digits);

type Section = "capex" | "workcap" | "opex";
const SECTION_TITLE: Record<Section, string> = {
  capex: "A. Capital expenditures (Capex)",
  workcap: "B. Working capital (modal kerja)",
  opex: "C. Operational expenses (Opex)",
};

function NumInput({ value, onChange, disabled, label, step = "any" }: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
  step?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        disabled={disabled}
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={inputClass}
      />
    </label>
  );
}

function MoneyInput({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className={labelClass}>
      <span>{label}</span>
      {disabled ? <input disabled value={rp(value)} className={inputClass} /> : <RupiahInput value={value} onChange={onChange} />}
    </div>
  );
}

// Editor paket kelayakan finansial + RAB (format template Excel RAB Aquagrowth). Hitungan langsung dari src/lib/aquaculture.ts.
export default function RabEditor({
  projectId,
  planId,
  initialTitle,
  initial,
  readOnly,
  canSubmit,
  isAquagrowth,
  submitLabel,
}: {
  projectId: string;
  planId: string | null;
  initialTitle: string;
  initial: RabData;
  readOnly: boolean;
  canSubmit: boolean; // hanya pembuat paket yang bisa mengirim (aturan mesin pengajuan)
  isAquagrowth: boolean;
  submitLabel: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [d, setD] = useState<RabData>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const r = useMemo(() => computeRab(d), [d]);
  const ro = readOnly;

  const patch = <K extends keyof RabData>(key: K, value: Partial<RabData[K]>) =>
    setD((x) => ({ ...x, [key]: { ...(x[key] as object), ...value } }));
  const setLine = <S extends Section | "revenue">(s: S, i: number, value: Partial<RabData[S][number]>) =>
    setD((x) => ({ ...x, [s]: (x[s] as RabData[S][number][]).map((l, j) => (j === i ? { ...l, ...value } : l)) }));
  const removeLine = (s: Section | "revenue", i: number) =>
    setD((x) => ({ ...x, [s]: (x[s] as unknown[]).filter((_, j) => j !== i) }));
  const addLine = (s: Section | "revenue") =>
    setD((x) => {
      const base: CostLine = { desc: "", qty: 1, uom: "", volume: 1, price: 0, note: "" };
      const line =
        s === "capex"
          ? ({ ...base, salvage: 0, lifetime_months: 0 } as CapexLine)
          : s === "revenue"
            ? ({ commodity: x.commodity.name, desc: "", qty: 0, uom: x.params.bep_unit, price: 0, note: "" } as RevenueLine)
            : base;
      return { ...x, [s]: [...(x[s] as unknown[]), line] };
    });

  function useTemplate() {
    const empty = d.capex.length + d.workcap.length + d.opex.length + d.revenue.length === 0;
    if (!empty && !confirm("Ganti semua baris dengan contoh template RAB Aquagrowth Serang?")) return;
    setD((x) => ({ ...x, ...structuredClone(AQUAGROWTH_TEMPLATE) }));
  }

  async function save(submit: boolean) {
    setError("");
    setSaved("");
    if (submit && !confirm("Kirim paket kelayakan & RAB ini ke F&A? Setelah dikirim, isi tidak bisa diubah sampai ada permintaan perbaikan.")) return;
    setPending(true);
    const res = await saveAquaPlan(projectId, planId, title, d, submit);
    setPending(false);
    if (!res.ok) return setError(res.message);
    if (submit) {
      router.push(`/aquaculture/${projectId}`);
      router.refresh();
      return;
    }
    setSaved("Draf tersimpan.");
    if (!planId) router.replace(`/aquaculture/${projectId}/rab`);
    router.refresh();
  }

  const costSection = (s: Section) => {
    const lines = d[s] as (CostLine | CapexLine)[];
    const total = s === "capex" ? r.capex : s === "workcap" ? r.workcap : r.opex;
    return (
      <section key={s} className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{SECTION_TITLE[s]}</h2>
          <p className="text-sm">
            Total <span className="font-bold tabular-nums text-slate-900">{rp(total)}</span>
            {s === "capex" && <span className="text-slate-500"> · depresiasi {rp(r.depreciation)}/bulan</span>}
          </p>
        </div>
        {lines.length === 0 && <p className="text-sm text-slate-500">Belum ada baris.</p>}
        <ol className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2.5 w-6 shrink-0 text-xs font-semibold text-slate-500">{i + 1}.</span>
                <input
                  type="text"
                  aria-label="Uraian"
                  placeholder="Uraian"
                  disabled={ro}
                  value={l.desc}
                  onChange={(e) => setLine(s, i, { desc: e.target.value })}
                  className={inputClass}
                />
                {!ro && (
                  <button type="button" onClick={() => removeLine(s, i)} className="mt-1 rounded-lg px-2 py-1.5 text-sm text-red-700 hover:bg-red-50" aria-label="Hapus baris">
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <NumInput label="Qty" value={l.qty} disabled={ro} onChange={(n) => setLine(s, i, { qty: n })} />
                <label className={labelClass}>
                  Satuan
                  <input type="text" disabled={ro} value={l.uom} onChange={(e) => setLine(s, i, { uom: e.target.value })} className={inputClass} />
                </label>
                <NumInput label="Volume" value={l.volume} disabled={ro} onChange={(n) => setLine(s, i, { volume: n })} />
                <MoneyInput label="Harga satuan" value={l.price} disabled={ro} onChange={(n) => setLine(s, i, { price: n })} />
                <div className={labelClass}>
                  <span>Total</span>
                  <p className="py-2 text-base font-semibold tabular-nums text-slate-900">{rp(lineTotal(l))}</p>
                </div>
              </div>
              {s === "capex" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <MoneyInput
                    label="Harga sisa"
                    value={(l as CapexLine).salvage}
                    disabled={ro}
                    onChange={(n) => setLine("capex", i, { salvage: n })}
                  />
                  <NumInput
                    label="Lifetime (bulan)"
                    step="1"
                    value={(l as CapexLine).lifetime_months}
                    disabled={ro}
                    onChange={(n) => setLine("capex", i, { lifetime_months: Math.round(n) })}
                  />
                  <div className={labelClass}>
                    <span>Depresiasi/bulan</span>
                    <p className="py-2 text-base tabular-nums text-slate-700">{rp(monthlyDepreciation(l as CapexLine))}</p>
                  </div>
                </div>
              )}
              <input
                type="text"
                aria-label="Catatan baris"
                placeholder="Catatan (boleh kosong)"
                disabled={ro}
                value={l.note}
                onChange={(e) => setLine(s, i, { note: e.target.value })}
                className={`${inputClass} text-sm`}
              />
            </li>
          ))}
        </ol>
        {!ro && (
          <button type="button" onClick={() => addLine(s)} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            + Tambah baris
          </button>
        )}
      </section>
    );
  };

  const c = d.commodity;
  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <label className={labelClass}>
          Judul paket
          <input type="text" disabled={ro} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        {!ro && isAquagrowth && (
          <button type="button" onClick={useTemplate} className="self-start rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">
            Isi dari contoh template (RAB Aquagrowth Serang)
          </button>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Informasi umum</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["project_name", "Nama proyek"],
              ["location", "Lokasi"],
              ["period", "Periode proyek"],
              ["commodity", isAquagrowth ? "Komoditas" : "Produk / kegiatan"],
              ["ponds", isAquagrowth ? "Jumlah kolam" : "Jumlah unit / peserta"],
              ["area_per_pond", isAquagrowth ? "Luas per kolam" : "Keterangan skala"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={labelClass}>
              {label}
              <input type="text" disabled={ro} value={d.general[k]} onChange={(e) => patch("general", { [k]: e.target.value })} className={inputClass} />
            </label>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Informasi komoditas {!isAquagrowth && <span className="font-normal text-slate-500">(isi bila ada budidaya)</span>}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className={labelClass}>
            Komoditas
            <input type="text" disabled={ro} value={c.name} onChange={(e) => patch("commodity", { name: e.target.value })} className={inputClass} />
          </label>
          <NumInput label="Luas (m²)" value={c.area_m2} disabled={ro} onChange={(n) => patch("commodity", { area_m2: n })} />
          <NumInput label="Kepadatan (ekor/m²)" value={c.density} disabled={ro} onChange={(n) => patch("commodity", { density: n })} />
          <NumInput label="Survival rate (%)" value={c.survival_pct} disabled={ro} onChange={(n) => patch("commodity", { survival_pct: n })} />
          <NumInput label="Ukuran (ekor/kg)" value={c.size_per_kg} disabled={ro} onChange={(n) => patch("commodity", { size_per_kg: n })} />
          <NumInput label="FCR" value={c.fcr} disabled={ro} onChange={(n) => patch("commodity", { fcr: n })} />
          <NumInput label="Siklus (bulan)" value={c.cycle_months} disabled={ro} onChange={(n) => patch("commodity", { cycle_months: n })} />
          <NumInput label="Siklus per tahun" value={c.cycles_per_year} disabled={ro} onChange={(n) => patch("commodity", { cycles_per_year: n })} />
        </div>
        {c.area_m2 > 0 && (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Jumlah tebar</dt><dd className="font-semibold tabular-nums">{formatNumber(Math.round(r.commodity.stocking))} ekor</dd></div>
            <div><dt className="text-xs text-slate-500">Populasi panen</dt><dd className="font-semibold tabular-nums">{formatNumber(Math.round(r.commodity.population))} ekor</dd></div>
            <div><dt className="text-xs text-slate-500">Biomassa</dt><dd className="font-semibold tabular-nums">{dec(r.commodity.biomass)} kg</dd></div>
            <div><dt className="text-xs text-slate-500">Total pakan</dt><dd className="font-semibold tabular-nums">{dec(r.commodity.feed)} kg</dd></div>
          </dl>
        )}
      </section>

      {costSection("capex")}
      {costSection("workcap")}
      {costSection("opex")}

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Proyeksi pendapatan (per siklus)</h2>
          <p className="text-sm">
            Total <span className="font-bold tabular-nums text-slate-900">{rp(r.revenue)}</span>
          </p>
        </div>
        {d.revenue.length === 0 && <p className="text-sm text-slate-500">Belum ada baris.</p>}
        <ol className="flex flex-col gap-2">
          {d.revenue.map((l, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2.5 w-6 shrink-0 text-xs font-semibold text-slate-500">{i + 1}.</span>
                <input type="text" aria-label="Uraian pendapatan" placeholder="Uraian (mis. Panen parsial 1)" disabled={ro} value={l.desc} onChange={(e) => setLine("revenue", i, { desc: e.target.value })} className={inputClass} />
                {!ro && (
                  <button type="button" onClick={() => removeLine("revenue", i)} className="mt-1 rounded-lg px-2 py-1.5 text-sm text-red-700 hover:bg-red-50" aria-label="Hapus baris">
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <label className={labelClass}>
                  Komoditas
                  <input type="text" disabled={ro} value={l.commodity} onChange={(e) => setLine("revenue", i, { commodity: e.target.value })} className={inputClass} />
                </label>
                <NumInput label="Qty" value={l.qty} disabled={ro} onChange={(n) => setLine("revenue", i, { qty: n })} />
                <label className={labelClass}>
                  Satuan
                  <input type="text" disabled={ro} value={l.uom} onChange={(e) => setLine("revenue", i, { uom: e.target.value })} className={inputClass} />
                </label>
                <MoneyInput label="Harga satuan" value={l.price} disabled={ro} onChange={(n) => setLine("revenue", i, { price: n })} />
                <div className={labelClass}>
                  <span>Total</span>
                  <p className="py-2 text-base font-semibold tabular-nums text-slate-900">{rp(revenueTotal(l))}</p>
                </div>
              </div>
              <input type="text" aria-label="Catatan baris" placeholder="Catatan (boleh kosong)" disabled={ro} value={l.note} onChange={(e) => setLine("revenue", i, { note: e.target.value })} className={`${inputClass} text-sm`} />
            </li>
          ))}
        </ol>
        {!ro && (
          <button type="button" onClick={() => addLine("revenue")} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            + Tambah baris
          </button>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Asumsi bagi hasil & BEP</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumInput label="Bonus tim teknis (% laba kotor)" value={d.params.bonus_pct} disabled={ro} onChange={(n) => patch("params", { bonus_pct: n })} />
          <NumInput label="Zakat / dana sosial (%)" value={d.params.zakat_pct} disabled={ro} onChange={(n) => patch("params", { zakat_pct: n })} />
          <NumInput label="Bagian investor (%)" value={d.params.investor_pct} disabled={ro} onChange={(n) => patch("params", { investor_pct: Math.min(100, n) })} />
          <label className={labelClass}>
            Satuan BEP (mis. kg, peserta)
            <input type="text" disabled={ro} value={d.params.bep_unit} onChange={(e) => patch("params", { bep_unit: e.target.value })} className={inputClass} />
          </label>
        </div>
      </section>

      {/* Laba rugi */}
      <section className={card}>
        <h2 className="font-semibold text-slate-900">Laba rugi (per siklus)</h2>
        <table className="w-full text-sm">
          <tbody className="[&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-slate-100">
            <Row k="A" label="Capex" value={rp(r.capex)} />
            <Row k="B" label="Modal kerja" value={rp(r.workcap)} />
            <Row k="C" label="Opex" value={rp(r.opex)} />
            <Row k="D" label="Total modal (A+B+C)" value={rp(r.capital)} bold />
            <Row k="E" label="Pendapatan per siklus" value={rp(r.revenue)} />
            <Row k="F" label="Laba kotor (E − B − C)" value={rp(r.grossProfit)} extra={pct(r.grossMargin)} bold />
            <Row k="G" label={`Bonus tim teknis ${dec(d.params.bonus_pct)}%`} value={rp(r.bonus)} />
            <Row k="" label={`Zakat (dana sosial) ${dec(d.params.zakat_pct)}%`} value={rp(r.zakat)} />
            <Row k="H" label="Laba bersih" value={rp(r.netProfit)} extra={pct(r.netMargin)} bold />
            {d.params.investor_pct > 0 && (
              <>
                <Row k="" label={`Investor ${dec(d.params.investor_pct)}%`} value={rp(r.investorShare)} />
                <Row k="" label={`Crustea ${dec(100 - d.params.investor_pct)}%`} value={rp(r.crusteaShare)} />
              </>
            )}
          </tbody>
        </table>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">
          Ringkasan per tahun <span className="font-normal text-slate-500">({dec(r.cyclesPerYear)} siklus/tahun)</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Item</th>
                <th className="py-1.5 pr-2 text-right font-medium">Per siklus</th>
                <th className="py-1.5 text-right font-medium">Per tahun</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-slate-100">
              {(
                [
                  ["Pendapatan", r.revenue],
                  ["Total biaya (A+B+C)", r.capital],
                  ["Laba kotor", r.grossProfit],
                  ["Bonus + zakat", r.otherExpense],
                  ["Laba bersih", r.netProfit],
                  ...(d.params.investor_pct > 0
                    ? ([["Bagian Crustea", r.crusteaShare], ["Bagian investor", r.investorShare]] as [string, number][])
                    : []),
                ] as [string, number][]
              ).map(([label, v]) => (
                <tr key={label}>
                  <td className="pr-2">{label}</td>
                  <td className="pr-2 text-right tabular-nums">{rp(v)}</td>
                  <td className="text-right tabular-nums">{rp(v * r.cyclesPerYear)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Kelayakan finansial</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label={d.params.investor_pct > 0 ? "Return investor / tahun" : "Laba bersih / tahun"} value={rp(r.investorReturnYear)} />
          <Stat label="ROI / tahun" value={pct(r.roiYear)} sub={r.roiYear === null ? undefined : `${pct(r.roiYear / 12)} per bulan`} />
          <Stat
            label="Payback period"
            value={r.paybackYears === null ? "Tidak balik modal" : `${dec(r.paybackYears, 1)} tahun`}
            sub={r.paybackYears === null ? undefined : `${dec(r.paybackYears * 12, 1)} bulan`}
          />
          <Stat
            label={`BEP produksi (${r.bep.unit || "unit"})`}
            value={r.bep.breakEvenUnits === null ? "-" : `${dec(r.bep.breakEvenUnits)} ${r.bep.unit}`}
            sub={r.bep.units > 0 ? `rencana ${dec(r.bep.units)} ${r.bep.unit}` : undefined}
          />
          <Stat label="BEP (Rp)" value={r.bep.rupiah === null ? "-" : rp(r.bep.rupiah)} />
          <Stat
            label={`BEP harga per ${r.bep.unit || "unit"}`}
            value={r.bep.breakEvenPrice === null ? "-" : rp(r.bep.breakEvenPrice)}
            sub={r.bep.price === null ? undefined : `rencana harga rata-rata ${rp(r.bep.price)}`}
          />
        </div>
        <p className="text-xs text-slate-500">
          BEP memakai baris pendapatan bersatuan &quot;{r.bep.unit || "-"}&quot;. Biaya tetap = Capex + Opex, biaya variabel = modal
          kerja ÷ jumlah unit. Pendapatan lain ({rp(r.bep.otherRevenue)}) mengurangi biaya yang harus ditutup.
        </p>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Skenario optimis – normal – pesimis</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Skenario</th>
                <th className="py-1.5 pr-2 text-right font-medium">Pendapatan</th>
                <th className="py-1.5 pr-2 text-right font-medium">Biaya (B+C)</th>
                <th className="py-1.5 pr-2 text-right font-medium">Laba usaha</th>
                <th className="py-1.5 pr-2 text-right font-medium">Bonus + zakat</th>
                <th className="py-1.5 text-right font-medium">Laba bersih</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-slate-100">
              {r.scenarios.map((s) => (
                <tr key={s.name}>
                  <td className="pr-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-xs text-slate-500">{s.remark}</span>
                  </td>
                  <td className="pr-2 text-right tabular-nums">{rp(s.revenue)}</td>
                  <td className="pr-2 text-right tabular-nums">{rp(s.cost)}</td>
                  <td className="pr-2 text-right tabular-nums">{rp(s.operating)}</td>
                  <td className="pr-2 text-right tabular-nums">{rp(s.other)}</td>
                  <td className="text-right font-semibold tabular-nums">{rp(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-700">
          Potensi laba bersih per siklus: <span className="font-semibold">{rp(r.scenarios[2].net)}</span> sampai{" "}
          <span className="font-semibold">{rp(r.scenarios[0].net)}</span>.
        </p>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-slate-900">Timeline</h2>
        {d.timeline.length === 0 && <p className="text-sm text-slate-500">Belum ada kegiatan.</p>}
        <ol className="flex flex-col gap-2">
          {d.timeline.map((t, i) => (
            <li key={i} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
              <label className={labelClass}>
                Kegiatan
                <input type="text" disabled={ro} value={t.activity} onChange={(e) => setD((x) => ({ ...x, timeline: x.timeline.map((y, j) => (j === i ? { ...y, activity: e.target.value } : y)) }))} className={inputClass} />
              </label>
              <label className={labelClass}>
                Waktu
                <input type="text" disabled={ro} placeholder="mis. Nov 2026" value={t.when} onChange={(e) => setD((x) => ({ ...x, timeline: x.timeline.map((y, j) => (j === i ? { ...y, when: e.target.value } : y)) }))} className={inputClass} />
              </label>
              {!ro && (
                <button type="button" onClick={() => setD((x) => ({ ...x, timeline: x.timeline.filter((_, j) => j !== i) }))} className="rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50" aria-label="Hapus kegiatan">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
        {!ro && (
          <button type="button" onClick={() => setD((x) => ({ ...x, timeline: [...x.timeline, { activity: "", when: "" }] }))} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            + Tambah kegiatan
          </button>
        )}
        <label className={labelClass}>
          Ringkasan kelayakan & asumsi (sumber asumsi, risiko, catatan untuk F&A)
          <textarea rows={4} disabled={ro} value={d.summary} onChange={(e) => setD((x) => ({ ...x, summary: e.target.value }))} className={inputClass} />
        </label>
      </section>

      {!ro && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <p className="text-sm text-slate-700">
            Total modal <span className="font-bold tabular-nums text-brand-800">{rp(r.capital)}</span> · laba bersih/siklus{" "}
            <span className="font-semibold tabular-nums">{rp(r.netProfit)}</span> · ROI/tahun {pct(r.roiYear)}
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {saved && <p className="text-sm text-brand-800">{saved}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => save(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {pending ? "Menyimpan..." : "Simpan draf"}
            </button>
            {canSubmit && (
              <button type="button" disabled={pending} onClick={() => save(true)} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                {submitLabel}
              </button>
            )}
          </div>
          {!canSubmit && <p className="text-xs text-slate-500">Hanya pembuat paket yang bisa mengirim ke F&A; Anda bisa menyimpan perubahan.</p>}
        </div>
      )}
    </div>
  );
}

function Row({ k, label, value, extra, bold }: { k: string; label: string; value: string; extra?: string; bold?: boolean }) {
  return (
    <tr className={bold ? "font-semibold" : ""}>
      <td className="w-6 pr-2 text-slate-500">{k}</td>
      <td className="pr-2">{label}</td>
      <td className="pr-2 text-right text-xs text-slate-500">{extra}</td>
      <td className="text-right tabular-nums">{value}</td>
    </tr>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}
