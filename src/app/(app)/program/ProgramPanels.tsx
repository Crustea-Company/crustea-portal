"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HEALTH, PRIORITY_LABEL, PROGRAM_STATUS, type Health, type Milestone, type Program, type ProgramStatus } from "@/lib/programs";
import { formatDate } from "@/lib/format";
import {
  addProgramUpdate,
  deleteMilestone,
  deleteProgram,
  moveProgram,
  saveMilestone,
  saveProgram,
  setPriority,
  toggleMilestone,
  type ProgramInput,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const primary = "rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60";
const neutral = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100";

type People = { id: string; full_name: string }[];
type Res = { ok: boolean; message?: string; id?: string };

// Menjalankan aksi server, menampilkan error, lalu memuat ulang data.
function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<Res>, after?: (r: Res) => void) {
    setError("");
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return setError(res.message ?? "Gagal menyimpan.");
    after?.(res);
    router.refresh();
  }
  return { pending, error, run };
}

export function ProgramForm({
  program,
  people,
  canPrioritize,
  onDone,
}: {
  program: Program | null;
  people: People;
  canPrioritize: boolean;
  onDone: (id?: string) => void;
}) {
  const { pending, error, run } = useAction();
  const [f, setF] = useState<ProgramInput>({
    name: program?.name ?? "",
    description: program?.description ?? "",
    priority: program?.priority ?? 2,
    status: program?.status ?? "active",
    start_date: program?.start_date ?? "",
    end_date: program?.end_date ?? "",
    people: program?.program_people.map((p) => ({ employee_id: p.employee_id, role: p.role ?? "", is_lead: p.is_lead })) ?? [],
  });
  const set = (patch: Partial<ProgramInput>) => setF((x) => ({ ...x, ...patch }));
  const setPerson = (i: number, patch: Partial<ProgramInput["people"][number]>) =>
    set({ people: f.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const free = people.filter((p) => !f.people.some((x) => x.employee_id === p.id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveProgram(f, program?.id ?? null), (r) => onDone(r.id));
      }}
      className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-4"
    >
      <label className={labelClass}>
        Nama program
        <input required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="mis. P4G Jawa Barat: CB & WE" className={inputClass} />
      </label>
      <label className={labelClass}>
        Deskripsi, tujuan, dan risiko
        <textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={labelClass}>
          Prioritas
          <select
            value={f.priority}
            disabled={!canPrioritize}
            onChange={(e) => set({ priority: Number(e.target.value) })}
            className={`${inputClass} disabled:bg-slate-100`}
          >
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select value={f.status} onChange={(e) => set({ status: e.target.value as ProgramStatus })} className={inputClass}>
            {Object.entries(PROGRAM_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Mulai
          <input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Selesai
          <input type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} className={inputClass} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">PIC & anggota (centang = ketua/PIC utama)</legend>
        {f.people.map((p, i) => (
          <div key={p.employee_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <span className="min-w-40 flex-1 text-sm font-medium text-slate-800">{people.find((x) => x.id === p.employee_id)?.full_name ?? "Karyawan nonaktif"}</span>
            <input
              value={p.role}
              onChange={(e) => setPerson(i, { role: e.target.value })}
              placeholder="Peran (mis. WE, CB)"
              aria-label="Peran"
              className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1 text-sm text-slate-700">
              <input type="checkbox" checked={p.is_lead} onChange={(e) => setPerson(i, { is_lead: e.target.checked })} className="h-4 w-4 accent-brand-700" />
              Ketua
            </label>
            <button type="button" onClick={() => set({ people: f.people.filter((_, j) => j !== i) })} className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" aria-label="Keluarkan">
              ✕
            </button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && set({ people: [...f.people, { employee_id: e.target.value, role: "", is_lead: f.people.length === 0 }] })}
          className={inputClass}
          aria-label="Tambah anggota"
        >
          <option value="">+ Tambah anggota</option>
          {free.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Menyimpan..." : program ? "Simpan perubahan" : "Buat program"}
        </button>
        <button type="button" onClick={() => onDone()} className={neutral}>
          Batal
        </button>
        {program && canPrioritize && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm(`Hapus program "${program.name}"? Milestone dan laporan statusnya ikut terhapus; tugas tetap ada.`) && run(() => deleteProgram(program.id), () => (window.location.href = "/program"))}
            className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Hapus program
          </button>
        )}
      </div>
    </form>
  );
}

export function NewProgram({ people }: { people: People }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
        + Program baru
      </button>
    );
  }
  return (
    <div className="basis-full">
      <ProgramForm program={null} people={people} canPrioritize onDone={(id) => (id ? router.push(`/program/${id}`) : setOpen(false))} />
    </div>
  );
}

export function EditProgram({ program, people, canPrioritize }: { program: Program; people: People; canPrioritize: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={neutral}>
        Ubah program & anggota
      </button>
    );
  }
  return <ProgramForm program={program} people={people} canPrioritize={canPrioritize} onDone={() => setOpen(false)} />;
}

// Naik/turun dan ganti prioritas (admin, CEO, CTO, CMO).
export function PriorityControls({ id, priority }: { id: string; priority: number }) {
  const { pending, error, run } = useAction();
  const btn = "rounded-lg px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="flex items-center gap-1" title={error || undefined}>
      <button type="button" disabled={pending} onClick={() => run(() => moveProgram(id, -1))} className={btn} aria-label="Naikkan urutan">
        ↑
      </button>
      <button type="button" disabled={pending} onClick={() => run(() => moveProgram(id, 1))} className={btn} aria-label="Turunkan urutan">
        ↓
      </button>
      <select
        value={priority}
        disabled={pending}
        onChange={(e) => run(() => setPriority(id, Number(e.target.value)))}
        aria-label="Prioritas"
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {[1, 2, 3].map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function Milestones({
  programId,
  milestones,
  people,
  canEdit,
  today,
}: {
  programId: string;
  milestones: Milestone[];
  people: People;
  canEdit: boolean;
  today: string;
}) {
  const { pending, error, run } = useAction();
  const [m, setM] = useState({ title: "", due_date: "", pic_id: "" });
  return (
    <div className="flex flex-col gap-2">
      {milestones.length === 0 && <p className="text-sm text-slate-500">Belum ada milestone.</p>}
      <ul className="flex flex-col divide-y divide-slate-100">
        {milestones.map((x) => {
          const late = !x.done_at && x.due_date && x.due_date < today;
          return (
            <li key={x.id} className="flex items-start gap-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={!!x.done_at}
                disabled={!canEdit || pending}
                onChange={(e) => run(() => toggleMilestone(programId, x.id, e.target.checked))}
                className="mt-0.5 h-4 w-4 accent-brand-700"
                aria-label="Tandai selesai"
              />
              <div className="min-w-0 flex-1">
                <p className={x.done_at ? "text-slate-500 line-through" : "text-slate-900"}>{x.title}</p>
                <p className={`text-xs ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>
                  {x.due_date ? formatDate(x.due_date) : "Tanpa tanggal"}
                  {late && " · terlambat"}
                  {x.pic && ` · PIC ${x.pic.full_name}`}
                </p>
              </div>
              {canEdit && (
                <button type="button" disabled={pending} onClick={() => confirm("Hapus milestone ini?") && run(() => deleteMilestone(programId, x.id))} className="rounded px-2 text-red-700 hover:bg-red-50" aria-label="Hapus milestone">
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveMilestone(programId, m), () => setM({ title: "", due_date: "", pic_id: "" }));
          }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_12rem_auto]"
        >
          <input required value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="Milestone baru (mis. Doorprize siap)" className={inputClass} />
          <input type="date" value={m.due_date} onChange={(e) => setM({ ...m, due_date: e.target.value })} className={inputClass} aria-label="Tenggat" />
          <select value={m.pic_id} onChange={(e) => setM({ ...m, pic_id: e.target.value })} className={inputClass} aria-label="PIC milestone">
            <option value="">PIC (boleh kosong)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={primary}>
            Tambah
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function UpdateForm({ programId, health }: { programId: string; health: Health }) {
  const { pending, error, run } = useAction();
  const [h, setH] = useState<Health>(health);
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addProgramUpdate(programId, h, body), () => setBody(""));
      }}
      className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3"
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(HEALTH) as Health[]).map((k) => (
          <label key={k} className={`cursor-pointer rounded-full px-3 py-1 text-sm font-medium ring-1 ${h === k ? "bg-brand-800 text-white ring-brand-800" : "bg-white text-slate-700 ring-slate-200"}`}>
            <input type="radio" name="health" className="sr-only" checked={h === k} onChange={() => setH(k)} />
            {HEALTH[k]}
          </label>
        ))}
      </div>
      <textarea
        required
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Progres minggu ini, kendala, keputusan yang dibutuhkan"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={pending} className={`${primary} self-start`}>
        {pending ? "Mengirim..." : "Kirim laporan status"}
      </button>
    </form>
  );
}
