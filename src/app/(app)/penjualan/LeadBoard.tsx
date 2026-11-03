"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import { normalizeText, searchTerms } from "@/lib/search";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  STAGE_LABEL,
  STAGE_STYLE,
  TECH_FAMILIES,
  WON_RANK,
  daysSince,
  stageRank,
  techFamily,
  techLabel,
  type Lead,
  type LeadStage,
  type TechFamily,
} from "@/lib/sales";

const rp = (n: number) => `Rp${formatNumber(n)}`;

export const LEAD_GROUPS = {
  aktif: "Prospek aktif",
  closing: "Closing & purna jual",
  gagal: "Gagal",
  semua: "Semua",
} as const;
export type LeadGroup = keyof typeof LEAD_GROUPS;

function inGroup(l: Lead, g: LeadGroup): boolean {
  if (g === "semua") return true;
  if (g === "gagal") return l.stage === "lost";
  if (l.stage === "lost") return false;
  return g === "closing" ? stageRank(l.stage) >= WON_RANK : stageRank(l.stage) < WON_RANK;
}

const SORTS = {
  terbaru: "Terbaru masuk",
  az: "Customer A-Z",
  za: "Customer Z-A",
  nilai_tinggi: "Nilai tertinggi",
  nilai_rendah: "Nilai terendah",
  pic: "PIC A-Z",
  tahap: "Tahap (awal → akhir)",
  lama: "Paling lama di tahap",
} as const;
type Sort = keyof typeof SORTS;

const ALL_STAGES: LeadStage[] = [...LEAD_STAGES, "lost"];
const STAGE_ORDER = (s: LeadStage) => (s === "lost" ? 99 : stageRank(s));

export type BoardInitial = { group: LeadGroup; mine: boolean; q: string; stage: string; tech: string; pic: string; sort: string };

const selectClass =
  "min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-600";

export default function LeadBoard({
  leads,
  productNames,
  meId,
  manager,
  initial,
}: {
  leads: Lead[];
  productNames: Record<string, string>;
  meId: string;
  manager: boolean; // head BDS, CEO, admin: boleh mengubah semua lead
  initial: BoardInitial;
}) {
  const names = useMemo(() => new Map(Object.entries(productNames)), [productNames]);
  const [group, setGroup] = useState<LeadGroup>(initial.group);
  const [mine, setMine] = useState(initial.mine);
  const [q, setQ] = useState(initial.q);
  const [stage, setStage] = useState(ALL_STAGES.includes(initial.stage as LeadStage) ? initial.stage : "");
  const [tech, setTech] = useState(initial.tech in TECH_FAMILIES ? initial.tech : "");
  const [pic, setPic] = useState(initial.pic);
  const [sort, setSort] = useState<Sort>(initial.sort in SORTS ? (initial.sort as Sort) : "terbaru");
  const [open, setOpen] = useState<string | null>(null);

  // Simpan pilihan di alamat halaman supaya tetap sama saat kembali dari halaman detail.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const set = (k: string, v: string | null) => (v ? p.set(k, v) : p.delete(k));
    set("tab", group === "aktif" ? null : group);
    set("saya", mine ? "1" : null);
    set("q", q.trim() || null);
    set("tahap", stage || null);
    set("tek", tech || null);
    set("pic", pic || null);
    set("urut", sort === "terbaru" ? null : sort);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [group, mine, q, stage, tech, pic, sort]);

  const people = useMemo(
    () =>
      [...new Map(leads.map((l) => [l.sales_id, l.sales?.full_name ?? "-"])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [leads],
  );

  // Lead sebelum filter tahap (dipakai untuk jumlah per kelompok dan pilihan tahap).
  const base = useMemo(() => {
    const terms = searchTerms(q);
    return leads.filter((l) => {
      if (mine && l.sales_id !== meId && l.referral_id !== meId) return false;
      if (tech && techFamily(l) !== tech) return false;
      if (pic && l.sales_id !== pic) return false;
      if (terms.length) {
        const hay = normalizeText(
          `${l.number} ${l.customer} ${l.location ?? ""} ${l.referral_code ?? ""} ${techLabel(l, names)} ${l.sales?.full_name ?? ""}`,
        );
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [leads, mine, meId, tech, pic, q, names]);

  const list = useMemo(() => {
    const rows = base.filter((l) => inGroup(l, group) && (!stage || l.stage === stage));
    const by = (f: (a: Lead, b: Lead) => number) => rows.sort((a, b) => f(a, b) || b.created_at.localeCompare(a.created_at));
    switch (sort) {
      case "az":
        return by((a, b) => a.customer.localeCompare(b.customer, "id"));
      case "za":
        return by((a, b) => b.customer.localeCompare(a.customer, "id"));
      case "nilai_tinggi":
        return by((a, b) => b.value - a.value);
      case "nilai_rendah":
        return by((a, b) => a.value - b.value);
      case "pic":
        return by((a, b) => (a.sales?.full_name ?? "").localeCompare(b.sales?.full_name ?? "", "id"));
      case "tahap":
        return by((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage));
      case "lama":
        return by((a, b) => a.stage_since.localeCompare(b.stage_since));
      default:
        return by((a, b) => b.lead_date.localeCompare(a.lead_date));
    }
  }, [base, group, stage, sort]);

  const stageChoices = ALL_STAGES.filter((s) => base.some((l) => l.stage === s && inGroup(l, group)));
  const filtered = Boolean(q.trim() || stage || tech || pic || mine);
  const totalValue = list.reduce((s, l) => s + l.value, 0);
  const totalUnits = list.reduce((s, l) => s + l.units, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LEAD_GROUPS) as LeadGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGroup(g);
              setStage("");
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              g === group ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {LEAD_GROUPS[g]} ({base.filter((l) => inGroup(l, g)).length})
          </button>
        ))}
      </div>

      {/* Cari, filter, urutkan */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari customer, no. lead, lokasi…"
          aria-label="Cari"
          className={`${selectClass} col-span-2 sm:col-span-3 lg:col-span-2`}
        />
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Tahap" className={selectClass}>
          <option value="">Semua tahap</option>
          {stageChoices.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Jenis teknologi" className={selectClass}>
          <option value="">Semua teknologi</option>
          {(Object.keys(TECH_FAMILIES) as TechFamily[]).map((t) => (
            <option key={t} value={t}>
              {TECH_FAMILIES[t]}
            </option>
          ))}
        </select>
        <select value={pic} onChange={(e) => setPic(e.target.value)} aria-label="PIC sales" className={selectClass}>
          <option value="">Semua PIC</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan" className={selectClass}>
          {(Object.keys(SORTS) as Sort[]).map((s) => (
            <option key={s} value={s}>
              Urut: {SORTS[s]}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex flex-wrap items-center gap-3 text-sm sm:col-span-3 lg:col-span-6">
          <label className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-brand-700" />
            Lead saya (PIC / referral)
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setStage("");
                setTech("");
                setPic("");
                setMine(false);
              }}
              className="font-medium text-brand-700 hover:underline"
            >
              Hapus filter
            </button>
          )}
          <span className="ml-auto text-slate-600">
            {formatNumber(list.length)} lead · {formatNumber(totalUnits)} unit ·{" "}
            <span className="font-semibold text-slate-900">{rp(totalValue)}</span>
          </span>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Tidak ada lead yang cocok.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {list.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              tech={techLabel(l, names)}
              open={open === l.id}
              onToggle={() => setOpen((o) => (o === l.id ? null : l.id))}
              canEdit={manager || l.sales_id === meId || l.created_by === meId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LeadRow({
  lead: l,
  tech,
  open,
  onToggle,
  canEdit,
}: {
  lead: Lead;
  tech: string;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
}) {
  const closed = l.stage !== "lost" && stageRank(l.stage) >= WON_RANK;
  return (
    <li className={open ? "bg-brand-50/40" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_13rem_10.5rem_7.5rem_8.5rem]"
      >
        <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            <span className="truncate font-semibold text-slate-900">{l.customer}</span>
          </span>
          <span className="block truncate pl-5 text-xs text-slate-500">
            <span className="font-mono">{l.number}</span>
            {l.location ? ` · ${l.location}` : ""}
          </span>
        </span>

        <span className="col-span-2 flex min-w-0 items-center gap-1.5 pl-5 sm:col-span-1 sm:pl-0">
          <span className="truncate rounded-md bg-logo-lime/25 px-2 py-0.5 text-xs font-medium text-slate-800">{tech}</span>
          <span className="shrink-0 text-xs font-semibold text-slate-700">×{formatNumber(l.units)}</span>
        </span>

        <span className="col-span-2 flex flex-wrap items-center gap-1 pl-5 sm:col-span-1 sm:pl-0">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_STYLE[l.stage]}`}>
            {STAGE_LABEL[l.stage]}
          </span>
          {closed && !l.paid_on && (
            <span className="whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">Belum lunas</span>
          )}
        </span>

        <span className="hidden truncate text-sm text-slate-600 sm:block">{l.sales?.full_name ?? "-"}</span>

        <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
          <span className="block font-bold tabular-nums text-slate-900">{l.value ? rp(l.value) : "-"}</span>
          <span className="block text-xs text-slate-500 sm:hidden">{l.sales?.full_name ?? "-"}</span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-3 pb-3 pt-2 sm:pl-8">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Item label="Teknologi">
              {tech} · {formatNumber(l.units)} unit
            </Item>
            <Item label="Nilai">{l.value ? rp(l.value) : "Belum diisi"}</Item>
            <Item label="Sumber">
              {LEAD_SOURCES[l.source]}
              {l.referral_code ? ` · ${l.referral_code}` : ""}
            </Item>
            <Item label="PIC sales">{l.sales?.full_name ?? "-"}</Item>
            <Item label="Masuk">{formatDate(l.lead_date)}</Item>
            <Item label="Di tahap ini">{daysSince(l.stage_since)} hari</Item>
            <Item label="Kontak">{l.contact || "-"}</Item>
            <Item label="Lokasi">{l.location || "-"}</Item>
            {l.so_number && <Item label="No. SO">{l.so_number}</Item>}
            {l.closed_on && <Item label="Closing">{formatDate(l.closed_on)}</Item>}
            {closed && <Item label="Pelunasan">{l.paid_on ? `Lunas ${formatDate(l.paid_on)}` : "Belum lunas"}</Item>}
            {l.stage === "lost" && l.lost_reason && <Item label="Alasan gagal">{l.lost_reason}</Item>}
          </dl>
          {l.notes && <p className="line-clamp-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{l.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/penjualan/${l.id}`}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Detail & ubah tahap
            </Link>
            {canEdit && (
              <Link
                href={`/penjualan/${l.id}/ubah`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ubah data
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-words text-slate-900">{children}</dd>
    </div>
  );
}
