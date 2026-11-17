import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, todayJakarta } from "@/lib/format";
import { formatHours } from "@/lib/ats";
import { formatDayLong } from "@/lib/reminder-brief";
import { pct, quarterLabel, type QuarterTarget } from "@/lib/kpi";
import { loadQuarter } from "@/lib/kpi-data";
import { isAquaEditor } from "@/lib/aquaculture";
import { canManageStock } from "@/lib/sales";
import LogForm from "./log-kerja/LogForm";
import AttentionPanel from "./AttentionPanel";
import OpenOnDesktop from "./OpenOnDesktop";
import ReminderBrief, { parseFlash } from "./ReminderBrief";

const REQUEST_LINKS = [
  { href: "/pengajuan/reimburse/baru", label: "Reimburse" },
  { href: "/pengajuan/pembayaran/baru", label: "Permintaan pembayaran" },
  { href: "/pengajuan/pengadaan/baru", label: "Pengadaan barang/jasa" },
  { href: "/pengajuan/dinas/baru", label: "Perjalanan dinas" },
  { href: "/pengajuan/komisi/baru", label: "Klaim komisi" },
];

const rp = (n: number) => `Rp${formatNumber(n)}`;
// Ringkas: Rp2,2 M / Rp800 jt.
const rpShort = (n: number) => {
  const fmt = (x: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(x);
  if (n >= 1e9) return `Rp${fmt(n / 1e9)} M`;
  if (n >= 1e6) return `Rp${fmt(n / 1e6)} jt`;
  return rp(n);
};

const chip =
  "shrink-0 whitespace-nowrap rounded-full border border-brand-800 bg-white px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-50";
const chipPrimary = "shrink-0 whitespace-nowrap rounded-full bg-brand-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-900";

// Beranda = pekerjaan saya hari ini: sapaan, Reminder, perlu perhatian, catat pekerjaan, pintasan, target.
export default async function Home({ searchParams }: { searchParams: Promise<{ flash?: string | string[] }> }) {
  const employee = (await getCurrentEmployee())!;
  const today = todayJakarta();
  const sp = await searchParams;

  return (
    <main className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <div className="lg:col-span-2">
        <h1 className="text-xl font-bold leading-tight text-slate-900 md:text-xl">Halo, {employee.full_name}</h1>
        <p className="text-sm text-slate-500">{formatDayLong(today)}</p>
      </div>

      <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2">
        <ReminderBrief me={employee} today={today} flash={parseFlash(sp.flash)} />
        <AttentionPanel me={employee} today={today} />
      </div>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
        <LogSection meId={employee.id} today={today} />

        <nav className="flex min-w-0 flex-col gap-2" aria-label="Pintasan">
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
            <Link href="/tugas?pic=saya" className={chipPrimary}>
              Lihat tugas saya
            </Link>
            <Link href="/penjualan/baru" className={chip}>
              Catat lead penjualan
            </Link>
            {canManageStock(employee) && (
              <Link href="/stok#catat-mutasi" className={chip}>
                Catat stok
              </Link>
            )}
            {isAquaEditor(employee) && (
              <Link href="/projects/baru" className={chip}>
                Catat peluang proyek
              </Link>
            )}
          </div>
          <details className="group">
            <summary className={`${chip} inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}>
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

        <TargetCard today={today} />
      </div>
    </main>
  );
}

// Catat pekerjaan: satu baris "Hari ini: x jam"; formnya terbuka otomatis di layar lebar.
async function LogSection({ meId, today }: { meId: string; today: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("work_logs").select("minutes").eq("employee_id", meId).eq("log_date", today);
  const minutes = (data ?? []).reduce((t, r) => t + (r.minutes as number), 0);
  return (
    <OpenOnDesktop
      summary={
        <>
          <span className="text-base font-bold text-slate-900">
            Hari ini: {formatHours(minutes)} jam <span className="font-semibold text-brand-700">· Catat</span>
          </span>
          <span className="text-sm text-slate-400 transition-transform group-open:rotate-180" aria-hidden>▾</span>
        </>
      }
    >
      <LogForm today={today} />
      <Link href="/log-kerja" className="mt-3 inline-block text-[13px] font-medium md:text-xs text-brand-700 hover:underline">
        Log saya →
      </Link>
    </OpenOnDesktop>
  );
}

// Target kuartal berjalan dalam satu baris + satu batang.
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
      <p className="text-sm text-slate-500">
        Target Q{quarter} {year} belum dibuat.{" "}
        <Link href="/kpi/target" className="font-medium text-brand-700 hover:underline">
          Buka Target kuartal
        </Link>
      </p>
    );
  }
  const { real } = await loadQuarter(supabase, target);
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  const totalReal = sum([...real.values()].map(sum));
  const share = pct(totalReal, target.total);

  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Target kuartal">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] text-slate-800 md:text-sm">
          <span className="font-semibold">{quarterLabel(target)}</span> · {rpShort(totalReal)} dari {rpShort(target.total)}{" "}
          <span className="font-semibold tabular-nums">({share}%)</span>
        </p>
        <Link href={`/kpi/target?q=${target.id}`} className="shrink-0 text-[13px] font-medium text-brand-700 hover:underline md:text-xs">
          Rincian →
        </Link>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(share, 100)}%` }} />
      </div>
    </section>
  );
}
