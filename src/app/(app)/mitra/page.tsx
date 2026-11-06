import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatNumber } from "@/lib/format";
import { normalizeText, searchTerms } from "@/lib/search";
import {
  CHAMPION_TARGET,
  PARTNER_COLUMNS,
  PARTNER_KINDS,
  PARTNER_STATUS,
  canDeletePartners,
  canEditPartners,
  type Partner,
  type PartnerKind,
  type PartnerStatus,
} from "@/lib/partners";
import PartnerCard, { NewPartner } from "./PartnerCard";

export const metadata: Metadata = { title: "Mitra - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Daftar mitra: pembudidaya, champion farmers, vendor teknologi, lainnya (migrasi 028).
export default async function MitraPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const kind = typeof sp.jenis === "string" && sp.jenis in PARTNER_KINDS ? (sp.jenis as PartnerKind) : null;
  const status = typeof sp.status === "string" && sp.status in PARTNER_STATUS ? (sp.status as PartnerStatus) : null;
  const q = typeof sp.q === "string" ? sp.q : "";

  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const editable = canEditPartners(me);
  const [{ data: rows }, { data: people }] = await Promise.all([
    fetchAll(() => supabase.from("partners").select(PARTNER_COLUMNS).order("name")),
    editable ? supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const all = (rows ?? []) as unknown as Partner[];
  const terms = searchTerms(q);
  const list = all.filter(
    (p) =>
      (!kind || p.kind === kind) &&
      (!status || p.status === status) &&
      terms.every((t) => normalizeText([p.name, p.location, p.commodity, p.contact, p.notes, p.pic?.full_name].filter(Boolean).join(" ")).includes(t)),
  );
  const championsActive = all.filter((p) => p.kind === "champion" && p.status === "active").length;

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ jenis: kind, status, q: q || null, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/mitra?${s}` : "/mitra";
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`;
  const count = (k: PartnerKind) => all.filter((p) => p.kind === k).length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan & Aset</p>
          <h1 className="text-2xl font-bold text-slate-900">Mitra</h1>
          <p className="mt-1 text-sm text-slate-600">
            Champion farmers aktif: <b>{formatNumber(championsActive)}</b> dari target {CHAMPION_TARGET}.
          </p>
        </div>
        {editable && <NewPartner defaultKind={kind ?? "champion"} people={people ?? []} />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ jenis: null })} className={chip(!kind)}>
          Semua ({all.length})
        </Link>
        {(Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k) => (
          <Link key={k} href={href({ jenis: k })} className={chip(kind === k)}>
            {PARTNER_KINDS[k]} ({count(k)})
          </Link>
        ))}
      </div>
      <form action="/mitra" className="flex flex-wrap gap-2">
        {kind && <input type="hidden" name="jenis" value={kind} />}
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Status"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
        >
          <option value="">Semua status</option>
          {Object.entries(PARTNER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Cari nama, lokasi, komoditas"
          className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
        />
        <button type="submit" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
          Terapkan
        </button>
      </form>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Belum ada mitra di sini.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id}>
              <PartnerCard partner={p} people={people ?? []} canEdit={editable} canDelete={canDeletePartners(me)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
