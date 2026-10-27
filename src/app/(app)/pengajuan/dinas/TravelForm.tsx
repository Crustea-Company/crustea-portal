"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { formatDate, formatNumber } from "@/lib/format";
import {
  LOCAL_ZONE_NOTE,
  ZONE_LABEL,
  calcTravel,
  type TravelInput,
  type TravelParams,
  type TravelRate,
} from "@/lib/travel";
import { submitTravel } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

export type Assigner = { id: string; full_name: string; job_title: string | null };
export type TravelInitial = { id: string; input: TravelInput };

const EMPTY: TravelInput = {
  assigner_id: "",
  destination: "",
  target: "",
  depart_date: "",
  return_date: "",
  distance_km: 0,
  province_factor: 100,
  ticket: 0,
  private_km: 0,
  representation: 0,
  advance: false,
  emergency_reason: "",
};

function NumberInput({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={value ? formatNumber(value) : ""}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      placeholder="0"
      className={inputClass}
    />
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-slate-200 pt-2 font-bold text-slate-900" : ""}`}>
      <span className={strong ? "" : "text-slate-600"}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

const rp = (n: number) => `Rp${formatNumber(n)}`;

export default function TravelForm({
  meId,
  fullName,
  rate,
  params,
  holidays,
  today,
  assigners,
  initial,
}: {
  meId: string;
  fullName: string;
  rate: TravelRate | null;
  params: TravelParams;
  holidays: string[];
  today: string;
  assigners: Assigner[];
  initial?: TravelInitial; // terisi saat mengubah pengajuan "Perlu perbaikan" / draf
}) {
  const router = useRouter();
  const [input, setInput] = useState<TravelInput>(initial?.input ?? EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof TravelInput>(key: K, value: TravelInput[K]) => setInput((v) => ({ ...v, [key]: value }));

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const calc = rate ? calcTravel(input, rate, params, today, holidaySet) : null;
  const overRep = rate !== null && input.representation > rate.representation;

  if (!rate) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        Golongan jabatan Anda belum diatur, jadi tarif dinas belum bisa dihitung. Hubungi admin.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!input.assigner_id) return setError("Pilih siapa yang menugaskan.");
    if (!calc) return setError("Tanggal kembali tidak boleh sebelum tanggal berangkat.");
    if (overRep) return setError("Representasi melebihi plafon golongan Anda.");
    if (!calc.meets_notice && !input.emergency_reason.trim()) return setError("Tuliskan alasan darurat.");
    setPending(true);
    const res = await submitTravel(input, [], initial?.id ?? null);
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      return;
    }
    router.push(`/pengajuan/${res.id}?terkirim=1`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <p>
          Nama: <span className="font-semibold text-slate-900">{fullName}</span>
        </p>
        <p>
          Golongan jabatan: <span className="font-semibold text-slate-900">{rate.label}</span>
        </p>
        <p>Tanggal form: {formatDate(today)}</p>
      </div>

      <label className={labelClass}>
        Ditugaskan oleh
        <select
          required
          value={input.assigner_id}
          onChange={(e) => set("assigner_id", e.target.value)}
          className={inputClass}
        >
          <option value="">Pilih penugas</option>
          {assigners
            .filter((a) => a.id !== meId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
                {a.job_title ? ` (${a.job_title})` : ""}
              </option>
            ))}
        </select>
        <span className={hintClass}>Penugas akan menyetujui penugasan ini di aplikasi.</span>
      </label>

      <label className={labelClass}>
        Tujuan / lokasi
        <input
          type="text"
          required
          value={input.destination}
          onChange={(e) => set("destination", e.target.value)}
          placeholder="Contoh: Tambak mitra, Banyuwangi"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Target tugas
        <textarea
          required
          rows={2}
          value={input.target}
          onChange={(e) => set("target", e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Tanggal berangkat
          <input
            type="date"
            required
            value={input.depart_date}
            onChange={(e) => set("depart_date", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Tanggal kembali
          <input
            type="date"
            required
            min={input.depart_date || undefined}
            value={input.return_date}
            onChange={(e) => set("return_date", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {calc && !calc.meets_notice && (
        <label className={`${labelClass} rounded-xl border border-orange-200 bg-orange-50 p-3`}>
          <span className="text-orange-900">
            Tenggat tidak terpenuhi: baru {calc.notice_days} hari kerja sebelum berangkat (minimal{" "}
            {params.min_notice_days}). Tuliskan alasan darurat.
          </span>
          <textarea
            required
            rows={2}
            value={input.emergency_reason}
            onChange={(e) => set("emergency_reason", e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className={labelClass}>
          <label htmlFor="distance">Jarak dari kantor (km)</label>
          <NumberInput id="distance" value={input.distance_km} onChange={(n) => set("distance_km", n)} />
        </div>
        {calc?.zone === "province" && (
          <label className={labelClass}>
            Faktor uang harian (%)
            <input
              type="number"
              min={70}
              max={100}
              required
              value={input.province_factor}
              onChange={(e) => set("province_factor", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        )}
      </div>

      <div className={labelClass}>
        <label htmlFor="ticket">Tiket pesawat/kereta/bus (estimasi)</label>
        <RupiahInput id="ticket" value={input.ticket} onChange={(n) => set("ticket", n)} />
      </div>

      <div className={labelClass}>
        <label htmlFor="private-km">Kendaraan pribadi (km pulang-pergi)</label>
        <NumberInput id="private-km" value={input.private_km} onChange={(n) => set("private_km", n)} />
        <span className={hintClass}>Rp{formatNumber(params.private_km_rate)}/km. Isi 0 kalau tidak memakai.</span>
      </div>

      <div className={labelClass}>
        <label htmlFor="rep">Estimasi representasi</label>
        <RupiahInput id="rep" value={input.representation} onChange={(n) => set("representation", n)} />
        <span className={overRep ? "font-normal text-red-700" : hintClass}>
          {rate.representation
            ? `Plafon golongan Anda: ${rp(rate.representation)} per kegiatan.`
            : "Golongan Anda tidak mendapat biaya representasi."}
        </span>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Uang muka diminta?</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            [true, "Ya"],
            [false, "Tidak"],
          ].map(([value, label]) => (
            <label key={String(value)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="advance"
                checked={input.advance === value}
                onChange={() => set("advance", value as boolean)}
                className="h-4 w-4 accent-brand-700"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-1.5 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm">
        <h2 className="mb-1 font-semibold text-slate-900">Perhitungan estimasi</h2>
        {calc ? (
          <>
            <Row label="Jumlah hari" value={`${calc.days} hari (${calc.nights} malam)`} />
            <Row label="Zona" value={`${ZONE_LABEL[calc.zone]} · faktor ${Math.round(calc.factor * 100)}%`} />
            <Row label={`Uang harian (${rp(rate.daily)} × ${Math.round(calc.factor * 100)}% × ${calc.days})`} value={rp(calc.daily_total)} />
            <Row label={`Hotel (${rp(rate.hotel)} × ${calc.nights} malam)`} value={rp(calc.hotel)} />
            <Row label={`Transport lokal (${rp(rate.local_transport)} × ${calc.days})`} value={rp(calc.local_transport)} />
            <Row label="Tiket" value={rp(calc.ticket)} />
            <Row label="Kendaraan pribadi" value={rp(calc.private_vehicle)} />
            <Row label="Representasi" value={rp(calc.representation)} />
            <Row label="Total estimasi" value={rp(calc.total)} strong />
            <p className="mt-1 text-slate-600">
              Batas FPTD & laporan misi: <span className="font-semibold">{formatDate(calc.report_due)}</span>
            </p>
            {calc.zone === "local" && <p className="text-slate-600">{LOCAL_ZONE_NOTE}</p>}
          </>
        ) : (
          <p className="text-slate-600">Isi tanggal berangkat dan kembali untuk melihat perhitungan.</p>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : initial ? "Simpan & kirim ulang" : "Kirim penugasan"}
      </button>
    </form>
  );
}
