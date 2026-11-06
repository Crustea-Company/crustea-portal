"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { PARTNER_KINDS, PARTNER_STATUS, PARTNER_STATUS_STYLE, type Partner, type PartnerKind } from "@/lib/partners";
import { deletePartner, savePartner, type PartnerInput } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";

type People = { id: string; full_name: string }[];

const OBLIGATION_HINT: Record<PartnerKind, string> = {
  farmer: "mis. skema kerja sama, bagi hasil",
  champion: "mis. beli langsung / kirim rekap petambak tertarik / buat video",
  vendor: "mis. SLA, garansi, leadtime",
  other: "",
};

export function PartnerForm({
  partner,
  defaultKind,
  people,
  canDelete,
  onDone,
}: {
  partner: Partner | null;
  defaultKind: PartnerKind;
  people: People;
  canDelete: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<PartnerInput>({
    kind: partner?.kind ?? defaultKind,
    name: partner?.name ?? "",
    contact: partner?.contact ?? "",
    location: partner?.location ?? "",
    commodity: partner?.commodity ?? "",
    pic_id: partner?.pic_id ?? "",
    status: partner?.status ?? "active",
    obligation: partner?.obligation ?? "",
    tech_note: partner?.tech_note ?? "",
    notes: partner?.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<PartnerInput>) => setF((x) => ({ ...x, ...patch }));
  const text = (key: "name" | "contact" | "location" | "commodity", label: string) => (
    <label className={labelClass}>
      {label}
      <input required={key === "name"} value={f[key]} onChange={(e) => set({ [key]: e.target.value })} className={inputClass} />
    </label>
  );

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError("");
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return setError(res.message ?? "Gagal menyimpan.");
    onDone();
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePartner(f, partner?.id ?? null));
      }}
      className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Jenis
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value as PartnerKind })} className={inputClass}>
            {Object.entries(PARTNER_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select value={f.status} onChange={(e) => set({ status: e.target.value as PartnerInput["status"] })} className={inputClass}>
            {Object.entries(PARTNER_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {text("name", "Nama")}
        {text("contact", "Kontak (HP/WA/email)")}
        {text("location", "Lokasi")}
        {text("commodity", f.kind === "vendor" ? "Produk / layanan" : "Komoditas")}
        <label className={labelClass}>
          PIC Crustea
          <select value={f.pic_id} onChange={(e) => set({ pic_id: e.target.value })} className={inputClass}>
            <option value="">-</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Teknologi Crustea yang diterima
          <input value={f.tech_note} onChange={(e) => set({ tech_note: e.target.value })} placeholder="mis. 2 Brush Aerator, 12 Okt 2026" className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        <span>
          Kesepakatan / kewajiban <span className="font-normal text-slate-500">{OBLIGATION_HINT[f.kind] && `(${OBLIGATION_HINT[f.kind]})`}</span>
        </span>
        <textarea rows={2} value={f.obligation} onChange={(e) => set({ obligation: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Catatan
        <textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? "Menyimpan..." : partner ? "Simpan perubahan" : "Tambah mitra"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
          Batal
        </button>
        {partner && canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm(`Hapus mitra "${partner.name}"?`) && run(() => deletePartner(partner.id))}
            className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Hapus
          </button>
        )}
      </div>
    </form>
  );
}

// Satu mitra: ringkas, klik untuk detail; tombol Ubah bagi yang berhak.
export default function PartnerCard({ partner: p, people, canEdit, canDelete }: { partner: Partner; people: People; canEdit: boolean; canDelete: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <PartnerForm partner={p} defaultKind={p.kind} people={people} canDelete={canDelete} onDone={() => setEditing(false)} />;
  const rows: [string, string | null][] = [
    ["Kontak", p.contact],
    ["Kesepakatan / kewajiban", p.obligation],
    ["Teknologi diterima", p.tech_note],
    ["Catatan", p.notes],
  ];
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{p.name}</p>
          <p className="text-xs text-slate-500">
            {[PARTNER_KINDS[p.kind], p.location, p.commodity, p.pic && `PIC ${p.pic.full_name}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PARTNER_STATUS_STYLE[p.status]}`}>{PARTNER_STATUS[p.status]}</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-slate-100 p-3 text-sm">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="whitespace-pre-wrap text-slate-800">{v || "-"}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Diperbarui {formatDate(p.updated_at.slice(0, 10))}</span>
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Ubah
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

export function NewPartner({ defaultKind, people }: { defaultKind: PartnerKind; people: People }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
        + Tambah mitra
      </button>
    );
  }
  return <PartnerForm partner={null} defaultKind={defaultKind} people={people} canDelete={false} onDone={() => setOpen(false)} />;
}
