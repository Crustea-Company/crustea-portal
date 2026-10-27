"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import FileOrLinkInput, { resolveAttachments, type AttachmentItem } from "@/components/requests/FileOrLinkInput";
import RupiahInput from "@/components/requests/RupiahInput";
import {
  CEO_APPROVAL_MIN,
  PAYMENT_CONTRACT,
  PAYMENT_METHODS,
  PAYMENT_PRIORITIES,
  type PaymentContract,
  type PaymentInput,
  type PaymentPriority,
} from "@/lib/requests";
import { submitPayment } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";
const optionClass = "flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm";

const OTHER = "Lainnya";

export type PaymentInitial = { id: string; input: PaymentInput; attachments: AttachmentItem[] };

export default function PaymentForm({
  employeeId,
  fullName,
  initial,
}: {
  employeeId: string;
  fullName: string;
  initial?: PaymentInitial; // terisi saat mengubah pengajuan "Perlu perbaikan" / draf
}) {
  const router = useRouter();
  const start = initial?.input;
  const startOther = Boolean(start && !(PAYMENT_METHODS as readonly string[]).includes(start.method));
  const [priority, setPriority] = useState<PaymentPriority | "">(start?.priority ?? "");
  const [date, setDate] = useState(start?.payment_date ?? "");
  const [method, setMethod] = useState(start ? (startOther ? OTHER : start.method) : "");
  const [methodOther, setMethodOther] = useState(startOther ? (start?.method ?? "") : "");
  const [amount, setAmount] = useState(start?.amount ?? 0);
  const [vendor, setVendor] = useState(start?.vendor ?? "");
  const [account, setAccount] = useState(start?.account ?? "");
  const [purpose, setPurpose] = useState(start?.purpose ?? "");
  const [contract, setContract] = useState<PaymentContract[]>(start?.contract ?? []);
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initial?.attachments ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggleContract = (c: PaymentContract) =>
    setContract((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!priority) return setError("Pilih prioritas pembayaran.");
    if (!method) return setError("Pilih metode pembayaran.");
    if (amount <= 0) return setError("Jumlah (Rp) belum diisi.");
    if (contract.length === 0) return setError("Centang minimal satu pilihan \"Terkait kontrak\".");
    if (attachments.length === 0) return setError("Tempel link invoice atau dokumen pendukung.");

    setPending(true);
    const files = await resolveAttachments(attachments, employeeId);
    if (!files.ok) {
      setError(files.message);
      setPending(false);
      return;
    }
    const res = await submitPayment(
      {
        priority,
        payment_date: date,
        method: method === OTHER ? methodOther : method,
        amount,
        vendor,
        account,
        purpose,
        contract,
      },
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
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Prioritas pembayaran</legend>
        {(Object.entries(PAYMENT_PRIORITIES) as [PaymentPriority, string][]).map(([key, label]) => (
          <label key={key} className={optionClass}>
            <input
              type="radio"
              name="priority"
              checked={priority === key}
              onChange={() => setPriority(key)}
              className="h-4 w-4 accent-brand-700"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className={labelClass}>
        Tanggal pembayaran
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Metode pembayaran</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {[...PAYMENT_METHODS, OTHER].map((m) => (
            <label key={m} className={optionClass}>
              <input
                type="radio"
                name="method"
                checked={method === m}
                onChange={() => setMethod(m)}
                className="h-4 w-4 accent-brand-700"
              />
              {m}
            </label>
          ))}
        </div>
        {method === OTHER && (
          <input
            type="text"
            required
            value={methodOther}
            onChange={(e) => setMethodOther(e.target.value)}
            placeholder="Tulis metode pembayaran"
            aria-label="Metode pembayaran lainnya"
            className={inputClass}
          />
        )}
      </fieldset>

      <div className={labelClass}>
        <label htmlFor="amount">Jumlah (Rp)</label>
        <RupiahInput id="amount" value={amount} onChange={setAmount} />
        {amount >= CEO_APPROVAL_MIN && (
          <span className={hintClass}>Nilai ≥ Rp5 juta: setelah diterima F&A, perlu persetujuan CEO.</span>
        )}
      </div>

      <label className={labelClass}>
        Vendor / nama penerima dan wilayah
        <input
          type="text"
          required
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Contoh: PT Cahya Jaya Abadi Bandung"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Nomor rekening / VA / QRIS
        <span className={hintClass}>Sertakan nama bank dan nama pemilik rekening bila ada.</span>
        <input type="text" required value={account} onChange={(e) => setAccount(e.target.value)} className={inputClass} />
      </label>

      <label className={labelClass}>
        Tujuan pembayaran
        <textarea
          required
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Contoh: Pelunasan invoice pakan udang batch Oktober"
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Invoice atau dokumen pendukung
        <FileOrLinkInput items={attachments} onChange={setAttachments} />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">
          Terkait kontrak? <span className={hintClass}>(boleh lebih dari satu)</span>
        </legend>
        {(Object.entries(PAYMENT_CONTRACT) as [PaymentContract, string][]).map(([key, label]) => (
          <label key={key} className={optionClass}>
            <input
              type="checkbox"
              checked={contract.includes(key)}
              onChange={() => toggleContract(key)}
              className="h-4 w-4 accent-brand-700"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : initial ? "Simpan & kirim ulang" : "Kirim permintaan"}
      </button>
    </form>
  );
}
