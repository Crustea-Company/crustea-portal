import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, todayJakarta } from "@/lib/format";
import { pct, quarterLabel, sourceTarget, type QuarterTarget } from "@/lib/kpi";
import { loadQuarter } from "@/lib/kpi-data";
import { isAquaEditor } from "@/lib/aquaculture";
import { canManageStock } from "@/lib/sales";
import LogForm from "./log-kerja/LogForm";
import AttentionPanel from "./AttentionPanel";

const ROLE_LABEL = {
  admin: "Admin",
  ceo: "CEO",
  head: "Kepala Departemen",
  staff: "Staf",
} as const;

const REQUEST_LINKS = [
  { href: "/pengajuan/reimburse/baru", label: "Reimburse" },
  { href: "/pengajuan/pembayaran/baru", label: "Permintaan pembayaran" },
  { href: "/pengajuan/pengadaan/baru", label: "Pengadaan barang/jasa" },
  { href: "/pengajuan/dinas/baru", label: "Perjalanan dinas" },
  { href: "/pengajuan/komisi/baru", label: "Klaim komisi" },
];

// Warna potongan diagram (kelas ditulis utuh supaya terbaca Tailwind).
const SLICE_COLORS = [
  { stroke: "stroke-brand-800", dot: "bg-brand-800" },
  { stroke: "stroke-logo-lime", dot: "bg-logo-lime" },
  { stroke: "stroke-rose-500", dot: "bg-rose-500" },
  { stroke: "stroke-sky-500", dot: "bg-sky-500" },
  { stroke: "stroke-amber-500", dot: "bg-amber-500" },
  { stroke: "stroke-violet-500", dot: "bg-violet-500" },
  { stroke: "stroke-logo-leaf", dot: "bg-logo-leaf" },
  { stroke: "stroke-slate-400", dot: "bg-slate-400" },
];

const rp = (n: number) => `Rp${formatNumber(n)}`;
// Ringkas: Rp2,2 M / Rp800 jt.
const rpShort = (n: number) => {
  const fmt = (x: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(x);
  if (n >= 1e9) return `Rp${fmt(n / 1e9)} M`;
  if (n >= 1e6) return `Rp${fmt(n / 1e6)} jt`;
  return rp(n);
};

const primaryBtn = "rounded-lg bg-brand-800 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-brand-900";
const outlineBtn =
  "flex items-center justify-center gap-2 rounded-lg border border-brand-800 bg-white px-3 py-2 text-center text-sm font-semibold text-brand-800 hover:bg-brand-50";

// Beranda: profil singkat, pintasan penting, target kuartal berjalan, dan catat log kerja.
export default async function Home() {
  const employee = (await getCurrentEmployee())!;
  const today = todayJakarta();

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[15rem_minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
      {/* ---------- Profil + pintasan ---------- */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-brand-700">Selamat datang,</p>
          <h1 className="text-xl font-bold leading-tight text-slate-900">{employee.full_name}</h1>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
          <dt className="text-slate-500">Jabatan</dt>
          <dd className="text-slate-900">{employee.job_title ?? "-"}</dd>
          <dt className="text-slate-500">Departemen</dt>
          <dd className="text-slate-900">{employee.dept_code ?? "-"}</dd>
          <dt className="text-slate-500">Peran aplikasi</dt>
          <dd className="text-slate-900">{ROLE_LABEL[employee.app_role]}</dd>
          <dt className="text-slate-500">Status kerja</dt>
          <dd className="text-slate-900">{employee.emp_status}</dd>
        </dl>
        <nav className="flex flex-col gap-2" aria-label="Pintasan">
          <Link href="/tugas?pic=saya" className={primaryBtn}>
            Lihat tugas saya
          </Link>
          <Link href="/penjualan/baru" className={outlineBtn}>
            Catat lead penjualan
          </Link>
          {canManageStock(employee) && (
            <Link href="/stok#catat-mutasi" className={outlineBtn}>
              Catat stok
            </Link>
          )}
          {isAquaEditor(employee) && (
            <Link href="/aquaculture/baru" className={outlineBtn}>
              Catat peluang proyek
            </Link>
          )}
          <details className="group relative">
            <summary className={`${outlineBtn} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              Ajukan... <span className="text-sm transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <ul className="mt-1.5 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
              {REQUEST_LINKS.map((l) => (
                <li key={l.href} className="border-b border-slate-100 last:border-0">
                  <Link href={l.href} className="block px-3 py-2 text-slate-700 hover:bg-brand-50 hover:text-brand-800">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/pengajuan" className="block px-3 py-2 text-slate-500 hover:bg-slate-50">
                  Lihat pengajuan saya →
                </Link>
              </li>
            </ul>
          </details>
        </nav>
      </div>

      {/* ---------- Target kuartal berjalan ---------- */}
      <TargetCard today={today} />

      {/* ---------- Catat log kerja ---------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Catat pekerjaan</h2>
          <Link href="/log-kerja" className="text-xs font-medium text-brand-700 hover:underline">
            Log saya →
          </Link>
        </div>
        <LogForm today={today} />
      </section>

      {/* ---------- Perlu perhatian saya ---------- */}
      <AttentionPanel me={employee} today={today} />
    </main>
  );
}

// Komponen terpisah supaya dimuat bersamaan dengan "Perlu perhatian saya".
async function TargetCard({ today }: { today: string }) {
  const supabase = await createClient();
  const year = Number(today.slice(0, 4));
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  const { data: targetRow } = await supabase
    .from("quarter_targets")
    .select("id, year, quarter, total, notes")
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();
  const target = targetRow as QuarterTarget | null;
  if (!target) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Target Kuartal & Realisasi (Q{quarter} {year})
        </h2>
        <p className="mt-2 text-sm text-slate-500">Target kuartal ini belum dibuat.</p>
        <Link href="/kpi/target" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
          Buka Target kuartal
        </Link>
      </section>
    );
  }
  const { sources, real } = await loadQuarter(supabase, target);
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  const totalReal = sum([...real.values()].map(sum));
  const slices = sources
    .map((s) => {
      const t = sourceTarget(target.total, s);
      const r = sum(real.get(String(s.id)) ?? []);
      return { id: s.id, name: s.name, target: t, real: r, left: Math.max(t - r, 0) };
    })
    .filter((s) => s.target > 0);
  const sliceTotal = sum(slices.map((s) => s.target));
  const share = pct(totalReal, target.total);

  // Diagram donat: tiap potongan = target alokasi satu sumber.
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.map((s, i) => {
    const len = sliceTotal > 0 ? (s.target / sliceTotal) * C : 0;
    const arc = { ...s, len, offset, color: SLICE_COLORS[i % SLICE_COLORS.length] };
    offset += len;
    return arc;
  });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">Target Kuartal & Realisasi ({quarterLabel(target)})</h2>
      <div>
        <p className="text-sm text-slate-600">Target {quarterLabel(target)}</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900">{rp(target.total)}</p>
      </div>
      <div>
        <p className="text-sm text-slate-600">Realisasi (lunas)</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900">{rp(totalReal)}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="shrink-0 text-sm text-slate-600">{share}% dari target</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(share, 100)}%` }} />
          </div>
        </div>
      </div>

      {arcs.length > 0 && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <svg viewBox="0 0 100 100" className="h-44 w-44 shrink-0 -rotate-90" role="img" aria-label="Komposisi target per sumber">
            {arcs.map((a) => (
              <circle
                key={a.id}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="16"
                className={a.color.stroke}
                strokeDasharray={`${Math.max(a.len - 0.6, 0)} ${C}`}
                strokeDashoffset={-a.offset}
              >
                <title>{`${a.name}: target ${rp(a.target)}, sisa ${rp(a.left)}`}</title>
              </circle>
            ))}
          </svg>
          <ul className="flex w-full flex-col gap-2 text-sm">
            {arcs.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.color.dot}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800">{a.name}</span>
                  <span className="block text-xs text-slate-500">
                    Sisa: {rpShort(a.left)} · {pct(a.real, a.target)}% tercapai
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/kpi/target?q=${target.id}`} className="self-center text-sm font-semibold text-brand-800 underline underline-offset-4">
        Lihat lebih detail
      </Link>
    </section>
  );
}
