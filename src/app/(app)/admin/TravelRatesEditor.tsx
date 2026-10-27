"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatNumber } from "@/lib/format";
import { TRAVEL_PARAM_KEYS, type TravelParams, type TravelRate } from "@/lib/travel";
import { saveTravelRates } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

const RATE_FIELDS: { key: "daily" | "hotel" | "local_transport" | "representation"; label: string }[] = [
  { key: "daily", label: "Uang harian/hari" },
  { key: "hotel", label: "Hotel/malam (maks)" },
  { key: "local_transport", label: "Transport lokal/hari (maks)" },
  { key: "representation", label: "Representasi/kegiatan (maks, 0 = tidak ada)" },
];

const PARAM_LABEL: Record<keyof TravelParams, string> = {
  min_notice_days: "Tenggat penugasan minimal (hari kerja)",
  report_days: "Batas FPTD & laporan misi setelah kembali (hari kerja)",
  local_km: "Zona lokal sampai (km)",
  province_km: "Dalam provinsi sampai (km)",
  private_km_rate: "Kendaraan pribadi (Rp/km)",
};

function Num({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={formatNumber(value)}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      className={inputClass}
    />
  );
}

export default function TravelRatesEditor({ rates: initialRates, params: initialParams }: { rates: TravelRate[]; params: TravelParams }) {
  const router = useRouter();
  const [rates, setRates] = useState(initialRates);
  const [params, setParams] = useState(initialParams);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setRate = (grade: string, key: (typeof RATE_FIELDS)[number]["key"], n: number) =>
    setRates((list) => list.map((r) => (r.grade === grade ? { ...r, [key]: n } : r)));

  const save = () =>
    startTransition(async () => {
      const res = await saveTravelRates(rates, params);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {rates.map((r) => (
          <div key={r.grade} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 font-semibold text-slate-900">{r.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATE_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-600">
                  {f.label}
                  <Num value={r[f.key]} onChange={(n) => setRate(r.grade, f.key, n)} label={`${r.label}: ${f.label}`} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 font-semibold text-slate-900">Parameter</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRAVEL_PARAM_KEYS.map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm text-slate-700">
              {PARAM_LABEL[k]}
              <span className="w-28 shrink-0">
                <Num value={params[k]} onChange={(n) => setParams((p) => ({ ...p, [k]: n }))} label={PARAM_LABEL[k]} />
              </span>
            </label>
          ))}
        </div>
      </div>

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="self-start rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan..." : "Simpan tarif"}
      </button>
    </div>
  );
}
