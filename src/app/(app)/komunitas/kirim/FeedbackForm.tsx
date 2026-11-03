"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABEL, TARGET_LABEL, type FeedbackCategory, type FeedbackTarget } from "@/lib/feedback";
import { submitFeedback } from "../actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";

export default function FeedbackForm({
  employees,
  departments,
}: {
  employees: { id: string; full_name: string; dept_code: string | null }[];
  departments: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [targetKind, setTargetKind] = useState<FeedbackTarget>("dept");
  const [targetEmployee, setTargetEmployee] = useState("");
  const [targetDept, setTargetDept] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("saran");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await submitFeedback({
      target_kind: targetKind,
      target_employee: targetEmployee,
      target_dept: targetDept,
      category,
      subject,
      body,
      anonymous,
    });
    if (!res.ok) {
      setPending(false);
      return setError(res.message);
    }
    router.push(`/komunitas/masukan/${res.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Masukan ini tentang</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(TARGET_LABEL) as FeedbackTarget[]).map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                targetKind === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-900" : "border-slate-300 text-slate-700"
              }`}
            >
              <input type="radio" name="target" checked={targetKind === k} onChange={() => setTargetKind(k)} className="accent-brand-700" />
              {TARGET_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      {targetKind === "person" && (
        <label className={labelClass}>
          Karyawan
          <select value={targetEmployee} onChange={(e) => setTargetEmployee(e.target.value)} className={inputClass}>
            <option value="">— Pilih karyawan —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
                {emp.dept_code ? ` (${emp.dept_code})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {targetKind === "dept" && (
        <label className={labelClass}>
          Departemen
          <select value={targetDept} onChange={(e) => setTargetDept(e.target.value)} className={inputClass}>
            <option value="">— Pilih departemen —</option>
            {departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={labelClass}>
        Kategori
        <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)} className={inputClass}>
          {(Object.keys(CATEGORY_LABEL) as FeedbackCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Judul singkat
        <input type="text" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
      </label>

      <label className={labelClass}>
        Isi masukan
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Ceritakan situasinya, dampaknya, dan saran Anda."
          className={inputClass}
        />
      </label>

      <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-700" />
        <span>
          <span className="font-semibold">Kirim sebagai anonim</span>
          <span className="block text-xs text-slate-600">
            Nama Anda tidak terlihat oleh Corporate Affairs. Anda tetap bisa melihat masukan ini dan menerima kabar statusnya di
            &quot;Masukan saya&quot;. Hindari menulis hal yang menunjukkan identitas Anda di isi masukan.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : "Kirim masukan"}
      </button>
    </form>
  );
}
