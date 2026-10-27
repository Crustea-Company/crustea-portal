"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import FileOrLinkInput, { resolveAttachments, type AttachmentItem } from "@/components/requests/FileOrLinkInput";
import RupiahInput from "@/components/requests/RupiahInput";
import { REIMBURSE_CATEGORIES, type MissionReport, type ReimburseInput } from "@/lib/requests";
import { submitReimburse } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

const EMPTY_MISSION: MissionReport = { activity: "", description: "", result: "", evaluation: "" };

const MISSION_FIELDS: { key: keyof MissionReport; label: string }[] = [
  { key: "activity", label: "Kegiatan" },
  { key: "description", label: "Deskripsi kegiatan" },
  { key: "result", label: "Hasil kegiatan" },
  { key: "evaluation", label: "Evaluasi dan rekomendasi" },
];

export type ReimburseInitial = { id: string; input: ReimburseInput; attachments: AttachmentItem[] };

export default function ReimburseForm({
  employeeId,
  fullName,
  today,
  initial,
}: {
  employeeId: string;
  fullName: string;
  today: string;
  initial?: ReimburseInitial; // terisi saat mengubah pengajuan "Perlu perbaikan" / draf
}) {
  const router = useRouter();
  const start = initial?.input;
  const [date, setDate] = useState(start?.transaction_date ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [categories, setCategories] = useState<string[]>(start?.categories ?? []);
  const [otherOn, setOtherOn] = useState(Boolean(start?.category_other));
  const [other, setOther] = useState(start?.category_other ?? "");
  const [amount, setAmount] = useState(start?.amount ?? 0);
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initial?.attachments ?? []);
  const [noMission, setNoMission] = useState(start ? start.mission === null : false);
  const [mission, setMission] = useState<MissionReport>(start?.mission ?? EMPTY_MISSION);
  const [reason, setReason] = useState(start?.no_mission_reason ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggleCategory = (c: string) =>
    setCategories((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (categories.length === 0 && !(otherOn && other.trim())) {
      setError("Pilih minimal satu kategori transaksi.");
      return;
    }
    if (amount <= 0) {
      setError("Jumlah (Rp) belum diisi.");
      return;
    }
    if (attachments.length === 0) {
      setError("Lampirkan bukti nota (foto/PDF atau link).");
      return;
    }

    setPending(true);
    const files = await resolveAttachments(attachments, employeeId);
    if (!files.ok) {
      setError(files.message);
      setPending(false);
      return;
    }
    const res = await submitReimburse(
      {
        transaction_date: date,
        description,
        categories,
        category_other: otherOn ? other : "",
        amount,
        mission: noMission ? null : mission,
        no_mission_reason: noMission ? reason : "",
      },
      files.list,
      initial?.id ?? null,
    );
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      // File yang sudah terunggah dipakai lagi kalau dikirim ulang (tidak diunggah dua kali).
      setAttachments(files.list.map((a, i) => ({ ...a, key: attachments[i].key })));
      return;
    }
    router.push(`/pengajuan/${res.id}?terkirim=1`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Nama: <span className="font-semibold text-slate-900">{fullName}</span>
      </div>

      <label className={labelClass}>
        Tanggal transaksi
        <span className={hintClass}>Tanggal pembelian atau pembayaran, bukan tanggal pengisian form ini.</span>
        <input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </label>

      <label className={labelClass}>
        Uraian transaksi
        <textarea
          required
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Contoh: Pembelian meterai 10 lembar untuk kontrak vendor"
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">
          Kategori transaksi <span className={hintClass}>(boleh lebih dari satu)</span>
        </legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {REIMBURSE_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={categories.includes(c)}
                onChange={() => toggleCategory(c)}
                className="h-4 w-4 accent-brand-700"
              />
              {c}
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={otherOn}
              onChange={(e) => setOtherOn(e.target.checked)}
              className="h-4 w-4 accent-brand-700"
            />
            Lainnya
          </label>
        </div>
        {otherOn && (
          <input
            type="text"
            required
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Tulis kategori lainnya"
            aria-label="Kategori lainnya"
            className={inputClass}
          />
        )}
      </fieldset>

      <div className={labelClass}>
        <label htmlFor="amount">Jumlah (Rp)</label>
        <RupiahInput id="amount" value={amount} onChange={setAmount} />
      </div>

      <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Bukti nota
        <FileOrLinkInput items={attachments} onChange={setAttachments} />
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
        <div>
          <h2 className="font-semibold text-slate-900">Mission report</h2>
          <p className="text-sm text-slate-600">
            Jika tidak ada, berikan alasannya, misal, one-time purchase seperti pembelian meterai.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={noMission}
            onChange={(e) => setNoMission(e.target.checked)}
            className="h-4 w-4 accent-brand-700"
          />
          Tidak ada mission report
        </label>
        {noMission ? (
          <label className={labelClass}>
            Alasan
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: one-time purchase, pembelian meterai"
              className={inputClass}
            />
          </label>
        ) : (
          MISSION_FIELDS.map((f) => (
            <label key={f.key} className={labelClass}>
              {f.label}
              <textarea
                required
                rows={2}
                value={mission[f.key]}
                onChange={(e) => setMission((m) => ({ ...m, [f.key]: e.target.value }))}
                className={inputClass}
              />
            </label>
          ))
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : initial ? "Simpan & kirim ulang" : "Kirim pengajuan"}
      </button>
    </form>
  );
}
