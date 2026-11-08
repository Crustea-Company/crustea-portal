"use client";

// Grafik dashboard realisasi proyek: SVG sederhana tanpa pustaka tambahan.
// Warna: pemasukan = brand-600, biaya = indigo-500 (pasangan lolos uji buta warna), rugi = red-600.
// Setiap grafik punya legenda (>= 2 seri), tooltip saat disentuh/diarahkan, dan tabel angka di bagian Laba rugi.
import { useEffect, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import type { ProfitReport } from "@/lib/project-ledger";

const rp = (n: number) => `${n < 0 ? "−" : ""}Rp${formatNumber(Math.round(Math.abs(n)))}`;
// Label sumbu ringkas: Rp2,5 jt / Rp150 rb.
function short(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}Rp${formatNumber(Math.round((a / 1e9) * 10) / 10)} M`;
  if (a >= 1e6) return `${sign}Rp${formatNumber(Math.round((a / 1e6) * 10) / 10)} jt`;
  if (a >= 1e3) return `${sign}Rp${formatNumber(Math.round(a / 1e3))} rb`;
  return `${sign}Rp${formatNumber(a)}`;
}
const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

// Skala "rapi" (1, 2, 2,5, 5 x 10^n) yang selalu memuat 0.
function niceScale(min: number, max: number, count = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return { lo: 0, hi: 1, ticks: [0, 1] };
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v));
  return { lo: a, hi: b, ticks };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, width] as const;
}

type Series = { name: string; fill: string; swatch: string; values: number[]; negativeFill?: string };

function Legend({ items }: { items: { name: string; swatch: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${i.swatch}`} aria-hidden />
          {i.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 8), Math.max(8, width - 188));
  return (
    <div
      className="pointer-events-none absolute z-10 w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg"
      style={{ left, top: Math.max(0, y) }}
    >
      {children}
    </div>
  );
}

const PAD = { top: 12, right: 8, bottom: 26, left: 64 };
const HEIGHT = 220;

// Grafik batang berkelompok (mendukung nilai minus, garis nol tegas).
function ColumnChart({ labels, series, ariaLabel }: { labels: string[]; series: Series[]; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const { lo, hi, ticks } = niceScale(Math.min(...all), Math.max(...all));
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH;
  const band = labels.length ? innerW / labels.length : 0;
  const gap = 2;
  const barW = Math.max(3, Math.min(28, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(innerW / 56))));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-slate-400" : "stroke-slate-100"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px]">
                {short(t)}
              </text>
            </g>
          ))}
          {labels.map((label, i) => {
            const x0 = PAD.left + band * i + (band - groupW) / 2;
            return (
              <g key={label}>
                {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} className="fill-slate-100" />}
                {series.map((s, j) => {
                  const v = s.values[i] ?? 0;
                  const top = Math.min(y(v), y(0));
                  const h = Math.max(v === 0 ? 0 : 1, Math.abs(y(v) - y(0)));
                  return (
                    <rect
                      key={s.name}
                      x={x0 + j * (barW + gap)}
                      y={top}
                      width={barW}
                      height={h}
                      rx={Math.min(3, barW / 2)}
                      className={v < 0 && s.negativeFill ? s.negativeFill : s.fill}
                    />
                  );
                })}
                {i % every === 0 && (
                  <text x={PAD.left + band * i + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
                    {label}
                  </text>
                )}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={PAD.left + band * hover + band / 2 + 8} y={PAD.top} width={width}>
          <p className="mb-1 font-semibold text-slate-900">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-2 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${s.swatch}`} aria-hidden />
                {s.name}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{rp(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// Garis saldo kas kumulatif (sumbu waktu sebenarnya, crosshair ke titik terdekat).
function CashLine({ points }: { points: { date: string; cash: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { lo, hi, ticks } = niceScale(Math.min(...points.map((p) => p.cash)), Math.max(...points.map((p) => p.cash)));
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => PAD.left + (t1 > t0 ? ((Date.parse(d) - t0) / (t1 - t0)) * innerW : innerW / 2);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH;
  // Garis bertangga: saldo berubah pada tanggal transaksi.
  const path = points.map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.cash)}` : `H${x(p.date)}V${y(p.cash)}`)).join("");
  const xTicks = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].filter((p, i, a) => a.findIndex((q) => q.date === p.date) === i);

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left + PAD.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - mx) < Math.abs(x(points[best].date) - mx)) best = i;
    });
    setHover(best);
  }

  const last = points[points.length - 1];
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Saldo kas proyek dari waktu ke waktu" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-slate-400" : "stroke-slate-100"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px]">
                {short(t)}
              </text>
            </g>
          ))}
          {xTicks.map((p, i) => (
            <text
              key={p.date}
              x={x(p.date)}
              y={HEIGHT - 8}
              textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              className="fill-slate-500 text-[10px]"
            >
              {formatDate(p.date)}
            </text>
          ))}
          <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-brand-600" />
          <circle cx={x(last.date)} cy={y(last.cash)} r={4} strokeWidth={2} className={`stroke-white ${last.cash < 0 ? "fill-red-600" : "fill-brand-600"}`} />
          {hover !== null && (
            <>
              <line x1={x(points[hover].date)} x2={x(points[hover].date)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-slate-300" strokeDasharray="3 3" />
              <circle cx={x(points[hover].date)} cy={y(points[hover].cash)} r={5} strokeWidth={2} className="fill-brand-600 stroke-white" />
            </>
          )}
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} onClick={onMove} />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={x(points[hover].date) + 10} y={PAD.top} width={width}>
          <p className="font-semibold text-slate-900">{formatDate(points[hover].date)}</p>
          <p className="flex justify-between gap-2 text-slate-600">
            Saldo kas <span className="font-semibold tabular-nums text-slate-900">{rp(points[hover].cash)}</span>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

// Komposisi biaya per kategori: batang mendatar satu warna, diurutkan dari terbesar.
function CategoryBars({ rows }: { rows: { category: string; amount: number }[] }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.category} className="text-sm" title={`${r.category}: ${rp(r.amount)}`}>
          <div className="flex justify-between gap-2">
            <span className="text-slate-700">{r.category}</span>
            <span className="tabular-nums text-slate-900">
              {rp(r.amount)} <span className="text-xs text-slate-500">· {formatNumber(Math.round((r.amount / total) * 1000) / 10)}%</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const box = "flex flex-col gap-2 rounded-xl border border-slate-200 p-3";

export default function ProfitCharts({ report }: { report: ProfitReport }) {
  const hasMonths = report.months.some((m) => m.income || m.expense);
  if (!hasMonths && report.cycles.length === 0 && report.cashByDate.length === 0) return null;
  const INCOME = { fill: "fill-brand-600", swatch: "bg-brand-600" };
  const COST = { fill: "fill-indigo-500", swatch: "bg-indigo-500" };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Grafik</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {report.cycles.length > 0 && (
          <div className={`${box} lg:col-span-2`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Laba / rugi per siklus</h3>
              <Legend items={[{ name: "Laba", swatch: "bg-brand-600" }, { name: "Rugi", swatch: "bg-red-600" }]} />
            </div>
            <ColumnChart
              ariaLabel="Laba atau rugi per siklus"
              labels={report.cycles.map((c) => `Siklus ${c.cycle}`)}
              series={[{ name: "Laba/rugi", ...INCOME, negativeFill: "fill-red-600", values: report.cycles.map((c) => c.profit) }]}
            />
          </div>
        )}
        {report.cycles.length > 0 && (
          <div className={`${box} lg:col-span-2`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Pemasukan vs biaya per siklus</h3>
              <Legend items={[{ name: "Pemasukan", swatch: INCOME.swatch }, { name: "Biaya", swatch: COST.swatch }]} />
            </div>
            <ColumnChart
              ariaLabel="Pemasukan dan biaya per siklus"
              labels={report.cycles.map((c) => `Siklus ${c.cycle}`)}
              series={[
                { name: "Pemasukan", ...INCOME, values: report.cycles.map((c) => c.income) },
                { name: "Biaya", ...COST, values: report.cycles.map((c) => c.cost) },
              ]}
            />
          </div>
        )}
        {hasMonths && (
          <div className={box}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Pemasukan vs biaya per bulan</h3>
              <Legend items={[{ name: "Pemasukan", swatch: INCOME.swatch }, { name: "Biaya + capex", swatch: COST.swatch }]} />
            </div>
            <ColumnChart
              ariaLabel="Pemasukan dan biaya per bulan"
              labels={report.months.map((m) => monthLabel(m.month))}
              series={[
                { name: "Pemasukan", ...INCOME, values: report.months.map((m) => m.income) },
                { name: "Biaya + capex", ...COST, values: report.months.map((m) => m.expense + m.capex) },
              ]}
            />
          </div>
        )}
        {report.cashByDate.length > 0 && (
          <div className={box}>
            <h3 className="text-sm font-semibold text-slate-800">Saldo kas proyek</h3>
            <CashLine points={report.cashByDate} />
          </div>
        )}
        {report.expenseByCategory.length > 0 && (
          <div className={`${box} lg:col-span-2`}>
            <h3 className="text-sm font-semibold text-slate-800">Komposisi biaya operasional</h3>
            <CategoryBars rows={report.expenseByCategory} />
          </div>
        )}
      </div>
    </section>
  );
}
