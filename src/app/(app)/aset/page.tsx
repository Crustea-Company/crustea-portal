import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  ASSET_CATEGORIES,
  ASSET_COLUMNS,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_STYLE,
  bookValue,
  canManageAssets,
  toAsset,
  type AssetStatus,
} from "@/lib/sales";

export const metadata: Metadata = { title: "Aset - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rp = (n: number) => `Rp${formatNumber(n)}`;

export default async function AsetPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in ASSET_STATUS_LABEL ? (sp.status as AssetStatus) : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const today = todayJakarta();
  const { data } = await fetchAll(() => supabase.from("assets").select(ASSET_COLUMNS).order("created_at", { ascending: false }));
  const all = (data as unknown as Record<string, unknown>[]).map(toAsset);
  const active = all.filter((a) => a.status !== "disposed");
  const list = all.filter(
    (a) =>
      (status ? a.status === status : a.status !== "disposed") &&
      (!q || `${a.code ?? ""} ${a.name} ${a.location ?? ""} ${a.holder ?? ""}`.toLowerCase().includes(q)),
  );
  const totalValue = active.reduce((s, a) => s + (a.value ?? 0), 0);
  const totalBook = active.reduce((s, a) => s + (bookValue(a, today) ?? a.value ?? 0), 0);
  const count = (s: AssetStatus) => all.filter((a) => a.status === s).length;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Aset</p>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen aset</h1>
          <p className="mt-1 text-sm text-slate-600">Aset tetap & perangkat teknologi: dari serah terima sampai penghapusan.</p>
        </div>
        {canManageAssets(me) && (
          <Link href="/aset/baru" className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
            + Serah terima aset
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Aset aktif" value={formatNumber(active.length)} />
        <Stat label="Nilai perolehan" value={rp(totalValue)} />
        <Stat label="Nilai buku (perkiraan)" value={rp(totalBook)} />
        <Stat label="Belum terdaftar" value={formatNumber(count("received"))} warn={count("received") > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip href="/aset" active={!status} label={`Aktif (${active.length})`} />
        {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) =>
          count(s) ? <Chip key={s} href={`/aset?status=${s}`} active={status === s} label={`${ASSET_STATUS_LABEL[s]} (${count(s)})`} /> : null,
        )}
        <form action="/aset" className="ml-auto flex gap-1">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cari kode / nama / lokasi"
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
          />
        </form>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Belum ada aset di sini.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id}>
              <Link
                href={`/aset/${a.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">{a.code ?? "Belum ada kode"}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${ASSET_STATUS_STYLE[a.status]}`}>{ASSET_STATUS_LABEL[a.status]}</span>
                    <span>{ASSET_CATEGORIES[a.category]}</span>
                  </div>
                  <p className="truncate font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    {a.location ?? "Lokasi belum diisi"}
                    {a.holder ? ` · ${a.holder}` : ""} · BAST {formatDate(a.received_on)}
                  </p>
                </div>
                {a.value !== null && (
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums text-slate-900">{rp(a.value)}</p>
                    {bookValue(a, today) !== null && <p className="text-xs text-slate-500">nilai buku {rp(bookValue(a, today) as number)}</p>}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${warn ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
    >
      {label}
    </Link>
  );
}
