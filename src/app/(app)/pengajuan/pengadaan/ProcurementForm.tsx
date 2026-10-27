"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import FileOrLinkInput, { resolveAttachments, type AttachmentItem } from "@/components/requests/FileOrLinkInput";
import RupiahInput from "@/components/requests/RupiahInput";
import { CEO_APPROVAL_MIN, type ProcurementInput } from "@/lib/requests";
import { submitProcurement } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";
const optionClass = "flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm";

export type ProcurementInitial = { id: string; input: ProcurementInput; attachments: AttachmentItem[] };

export default function ProcurementForm({
  employeeId,
  fullName,
  deptCode,
  today,
  initial,
}: {
  employeeId: string;
  fullName: string;
  deptCode: string | null;
  today: string;
  initial?: ProcurementInitial; // terisi saat mengubah pengajuan "Perlu perbaikan" / draf
}) {
  const router = useRouter();
  const start = initial?.input;
  const [title, setTitle] = useState(start?.title ?? "");
  const [specification, setSpecification] = useState(start?.specification ?? "");
  const [quantity, setQuantity] = useState(start ? String(start.quantity) : "");
  const [unit, setUnit] = useState(start?.unit ?? "");
  const [estimate, setEstimate] = useState(start?.estimate ?? 0);
  const [budgeted, setBudgeted] = useState<boolean | null>(start ? start.budgeted : null);
  const [neededDate, setNeededDate] = useState(start?.needed_date ?? "");
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initial?.attachments ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return setError("Jumlah harus angka bulat lebih dari 0.");
    if (estimate <= 0) return setError("Estimasi harga (Rp) belum diisi.");
    if (budgeted === null) return setError("Pilih apakah kebutuhan ini sudah dianggarkan.");

    setPending(true);
    const files = await resolveAttachments(attachments, employeeId);
    if (!files.ok) {
      setError(files.message);
      setPending(false);
      return;
    }
    const res = await submitProcurement(
      { title, specification, quantity: qty, unit, estimate, budgeted, needed_date: neededDate },
      files.list,
      initial?.id ?? null,
    );
    if (!res.ok) {
      setError(res.message);
      setPending(false);
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
        {deptCode && (
          <>
            {" "}
            · Departemen: <span className="font-semibold text-slate-900">{deptCode}</span>
          </>
        )}
      </div>

      <label className={labelClass}>
        Judul kebutuhan
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Contoh: Laptop untuk staf Digital Marketing"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Spesifikasi
        <span className={hintClass}>Merek/tipe, ukuran, kapasitas, atau lingkup pekerjaan (untuk jasa).</span>
        <textarea
          required
          rows={4}
          value={specification}
          onChange={(e) => setSpecification(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Jumlah
          <input
            type="number"
            required
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Satuan
          <input
            type="text"
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="unit, pcs, paket"
            className={inputClass}
          />
        </label>
      </div>

      <div className={labelClass}>
        <label htmlFor="estimate">Estimasi harga total (Rp)</label>
        <RupiahInput id="estimate" value={estimate} onChange={setEstimate} />
        {estimate >= CEO_APPROVAL_MIN && (
          <span className={hintClass}>Nilai ≥ Rp5 juta: perlu approval final CEO sebelum PO terbit.</span>
        )}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Sudah dianggarkan?</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            [true, "Sudah"],
            [false, "Belum"],
          ].map(([value, label]) => (
            <label key={String(value)} className={optionClass}>
              <input
                type="radio"
                name="budgeted"
                checked={budgeted === value}
                onChange={() => setBudgeted(value as boolean)}
                className="h-4 w-4 accent-brand-700"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={labelClass}>
        Tanggal dibutuhkan
        <input
          type="date"
          required
          min={initial ? undefined : today}
          value={neededDate}
          onChange={(e) => setNeededDate(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        <span>
          Lampiran <span className={hintClass}>(boleh kosong: contoh produk, penawaran, foto)</span>
        </span>
        <FileOrLinkInput items={attachments} onChange={setAttachments} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : initial ? "Simpan & kirim ulang" : "Kirim permohonan"}
      </button>
    </form>
  );
}
