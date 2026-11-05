"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import { PROJECT_TYPES, TYPE_LABEL, isSimpleType, type ProjectType } from "@/lib/aquaculture";
import { downloadProjectTemplate, readProjectFile } from "@/lib/project-xlsx";
import { saveProject, type ProjectInput } from "./actions";
import XlsxButtons from "./XlsxButtons";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";

const PARTNER_HINT: Record<ProjectType, string> = {
  aquagrowth: "calon investor / mitra lahan",
  mini_ras: "calon mitra / investor",
  workshop: "partner / penyelenggara",
  training: "instansi / peserta",
  grant: "pemberi dana / donor",
  csr: "perusahaan / mitra / penerima manfaat",
};

// Form data peluang proyek (SOP Aquaculture langkah 1).
export default function ProjectForm({
  meId,
  people,
  initial,
}: {
  meId: string;
  people: { id: string; full_name: string; email: string | null }[];
  initial: { id: string | null; input: Partial<ProjectInput>; typeLocked: boolean };
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectInput>({
    type: "aquagrowth",
    name: "",
    location: "",
    partner: "",
    contact: "",
    source: "",
    description: "",
    estimated_value: 0,
    estimated_start: "",
    pic_id: meId,
    ...initial.input,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<ProjectInput>) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await saveProject(form, initial.id);
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      return;
    }
    router.push(`/projects/${res.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <XlsxButtons
        hint="Bisa juga isi lewat Excel: unduh template (ikut berisi isian form saat ini), isi, lalu pilih Isi dari Excel."
        onDownload={() => downloadProjectTemplate(form, people)}
        onFile={async (file) => {
          const { input, warnings } = await readProjectFile(file, people);
          if (initial.typeLocked && input.type && input.type !== form.type) {
            delete input.type;
            warnings.push("Jenis proyek terkunci; jenis dari file diabaikan.");
          }
          set(input);
          return warnings;
        }}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-slate-700">Jenis proyek</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROJECT_TYPES.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                form.type === t ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 bg-white text-slate-700"
              } ${initial.typeLocked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={form.type === t}
                disabled={initial.typeLocked}
                onChange={() => set({ type: t })}
                className="sr-only"
              />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </div>
        {isSimpleType(form.type) && (
          <p className="text-xs text-slate-500">Grant & CSR tanpa kelayakan finansial/RAB: cukup catatan, update status, dan PIC.</p>
        )}
        {initial.typeLocked && <p className="text-xs text-slate-500">Jenis hanya bisa diganti di tahap Identifikasi peluang.</p>}
      </fieldset>

      <label className={labelClass}>
        Nama proyek
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="mis. Aquagrowth Serang - Ikan Nila"
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Lokasi
          <input type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Mitra <span className={hintClass}>({PARTNER_HINT[form.type]})</span>
          </span>
          <input type="text" value={form.partner} onChange={(e) => set({ partner: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Kontak <span className={hintClass}>(no. HP / WA / email)</span>
          </span>
          <input type="text" value={form.contact} onChange={(e) => set({ contact: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Asal peluang <span className={hintClass}>(referensi, event, inbound, dll.)</span>
          </span>
          <input type="text" value={form.source} onChange={(e) => set({ source: e.target.value })} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        <span>
          Data peluang <span className={hintClass}>(latar belakang, kebutuhan, potensi, skala)</span>
        </span>
        <textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={labelClass}>
          <label htmlFor="estimated-value">
            Perkiraan nilai <span className={hintClass}>(Rp; modal/pendapatan proyek)</span>
          </label>
          <RupiahInput id="estimated-value" value={form.estimated_value} onChange={(n) => set({ estimated_value: n })} />
        </div>
        <label className={labelClass}>
          Perkiraan mulai
          <input
            type="date"
            value={form.estimated_start}
            onChange={(e) => set({ estimated_start: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>
      <label className={labelClass}>
        PIC proyek
        <select value={form.pic_id} onChange={(e) => set({ pic_id: e.target.value })} className={inputClass}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan..." : initial.id ? "Simpan perubahan" : "Simpan peluang"}
      </button>
    </form>
  );
}
