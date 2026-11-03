"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BRAND_HEX } from "@/lib/brand";
import { ACCENT_RE, CARD_COLOR_FIELDS, cardColors, structureKey, type CardColorKey, type OrgEmployee, type OrgPerson, type OrgPillar, type OrgUnit } from "@/lib/org";
import { saveOrgStructure } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const smallBtn =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40";

type Props = {
  pillars: OrgPillar[];
  units: OrgUnit[];
  people: OrgPerson[];
  employees: OrgEmployee[];
  departments: { code: string; name: string }[];
};

type PersonRow = OrgPerson & { key: string };

const newId = () => crypto.randomUUID();

function initialState({ pillars, units, people, departments }: Props) {
  const ps = [...pillars].sort((a, b) => a.sort_order - b.sort_order);
  const pIndex = new Map(ps.map((p, i) => [p.id, i]));
  const us: OrgUnit[] = departments.map(
    (d) =>
      units.find((u) => u.dept_code === d.code) ?? {
        dept_code: d.code,
        pillar_id: null,
        sort_order: 0,
        display_name: d.name,
        accent: BRAND_HEX.toUpperCase(),
        focus: "",
        colors: {},
      },
  );
  const group = (u: OrgUnit) => (u.pillar_id && pIndex.has(u.pillar_id) ? pIndex.get(u.pillar_id)! : ps.length);
  us.sort((a, b) => group(a) - group(b) || a.sort_order - b.sort_order);
  return {
    pillars: ps,
    units: us.map((u) => (u.pillar_id && pIndex.has(u.pillar_id) ? u : { ...u, pillar_id: null })),
    people: people.map((p) => ({ ...p, key: p.employee_id })) as PersonRow[],
  };
}

export default function OrgEditor(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => initialState(props));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { pillars, units, people } = state;

  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const swap = <T,>(list: T[], i: number, j: number) => {
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  // ---- pilar
  const movePillar = (i: number, d: -1 | 1) => set({ pillars: swap(pillars, i, i + d) });
  const removePillar = (p: OrgPillar) => {
    const count = units.filter((u) => u.pillar_id === p.id).length;
    if (count && !window.confirm(`Hapus kolom "${p.name || "tanpa judul"}"? ${count} kartu di dalamnya menjadi "Tidak ditampilkan".`)) return;
    setState((s) => ({
      ...s,
      pillars: s.pillars.filter((x) => x.id !== p.id),
      units: s.units.map((u) => (u.pillar_id === p.id ? { ...u, pillar_id: null } : u)),
    }));
  };

  // ---- kartu: urutan dihitung per pilar dari posisi di daftar
  const patchUnit = (code: string, patch: Partial<OrgUnit>) =>
    setState((s) => {
      const moved = patch.pillar_id !== undefined && patch.pillar_id !== s.units.find((u) => u.dept_code === code)?.pillar_id;
      const updated = s.units.map((u) => (u.dept_code === code ? { ...u, ...patch } : u));
      if (!moved) return { ...s, units: updated };
      // Pindah pilar: taruh di urutan terakhir pilar barunya.
      const u = updated.find((x) => x.dept_code === code)!;
      return { ...s, units: [...updated.filter((x) => x.dept_code !== code), u] };
    });
  const moveUnit = (code: string, d: -1 | 1) =>
    setState((s) => {
      const i = s.units.findIndex((u) => u.dept_code === code);
      const same = s.units.map((u, k) => [u, k] as const).filter(([u]) => u.pillar_id === s.units[i].pillar_id).map(([, k]) => k);
      const j = same[same.indexOf(i) + d];
      return j === undefined ? s : { ...s, units: swap(s.units, i, j) };
    });

  // ---- orang khusus
  const patchPerson = (key: string, patch: Partial<OrgPerson>) =>
    set({ people: people.map((p) => (p.key === key ? { ...p, ...patch } : p)) });

  const pillarLabel = (p: OrgPillar, i: number) => p.name.trim() || `Kolom ${i + 1} (tanpa judul)`;
  const groups = [...pillars.map((p, i) => ({ id: p.id as string | null, name: pillarLabel(p, i) })), { id: null, name: "Tidak ditampilkan" }];
  const setColor = (u: OrgUnit, key: CardColorKey, value: string | null) => {
    const colors = { ...u.colors };
    if (value) colors[key] = value.toUpperCase();
    else delete colors[key];
    patchUnit(u.dept_code, { colors });
  };
  const shownUnits = units.filter((u) => u.pillar_id);
  const empById = new Map(props.employees.map((e) => [e.id, e]));

  const save = () => {
    setMessage(null);
    const order = new Map<string | null, number>();
    const payload = {
      pillars: pillars.map((p, i) => ({ id: p.id, name: p.name.trim(), sort_order: i + 1 })),
      units: units.map((u) => {
        const n = (order.get(u.pillar_id) ?? 0) + 1;
        order.set(u.pillar_id, n);
        return { ...u, sort_order: n, accent: u.accent.toUpperCase() };
      }),
      people: people
        .filter((p) => p.employee_id && (p.lead_dept || p.display_title?.trim()))
        .map(({ employee_id, lead_dept, display_title }) => ({ employee_id, lead_dept: lead_dept || null, display_title: display_title?.trim() || null })),
    };
    startTransition(async () => {
      const res = await saveOrgStructure(payload, structureKey(props.pillars, props.units, props.people));
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setState(initialState(props));
            setMessage(null);
            setOpen(true);
          }}
          className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Ubah struktur
        </button>
        {message?.ok && <span className="text-sm text-brand-800">{message.text}</span>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-3 sm:p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Ubah struktur organisasi</h2>
        <p className="text-sm text-slate-600">
          Nama, jabatan asli, departemen, dan status kerja karyawan diubah di Admin &gt; Karyawan. Di sini hanya pengaturan
          tampilan. Perubahan baru tersimpan setelah tombol Simpan ditekan.
        </p>
      </div>

      {/* Pilar */}
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-1 font-semibold text-slate-900">1. Kolom di bawah CEO</h3>
        <p className="mb-2 text-xs text-slate-500">
          Judul kolom boleh dikosongkan: kolom tampil tanpa judul (untuk struktur tanpa pilar).
        </p>
        <ul className="flex flex-col gap-2">
          {pillars.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2">
              <button type="button" className={smallBtn} disabled={i === 0} onClick={() => movePillar(i, -1)} aria-label="Naikkan">↑</button>
              <button type="button" className={smallBtn} disabled={i === pillars.length - 1} onClick={() => movePillar(i, 1)} aria-label="Turunkan">↓</button>
              <input
                value={p.name}
                onChange={(e) => set({ pillars: pillars.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })}
                placeholder={`Kolom ${i + 1} tanpa judul`}
                aria-label={`Judul kolom ${i + 1}`}
                className={inputClass}
              />
              <button type="button" className={`${smallBtn} text-red-700`} onClick={() => removePillar(p)}>Hapus</button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${smallBtn} mt-2`}
          onClick={() => set({ pillars: [...pillars, { id: newId(), name: "", sort_order: 0 }] })}
        >
          + Tambah kolom
        </button>
      </section>

      {/* Kartu departemen */}
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-1 font-semibold text-slate-900">2. Kartu departemen</h3>
        <p className="mb-2 text-xs text-slate-500">Pilih kolom tiap departemen. Anggota kartu otomatis = karyawan aktif departemen itu.</p>
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const list = units.filter((u) => u.pillar_id === g.id);
            if (!list.length) return null;
            return (
              <div key={g.id ?? "none"}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.name}</p>
                <ul className="flex flex-col gap-2">
                  {list.map((u, i) => (
                    <li key={u.dept_code} className="rounded-lg border border-slate-200 p-2" style={{ borderLeft: `4px solid ${ACCENT_RE.test(u.accent) ? u.accent : "#cbd5e1"}` }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-10 text-xs font-bold text-slate-500">{u.dept_code}</span>
                        <button type="button" className={smallBtn} disabled={!g.id || i === 0} onClick={() => moveUnit(u.dept_code, -1)} aria-label="Naikkan">↑</button>
                        <button type="button" className={smallBtn} disabled={!g.id || i === list.length - 1} onClick={() => moveUnit(u.dept_code, 1)} aria-label="Turunkan">↓</button>
                        <select
                          value={u.pillar_id ?? ""}
                          onChange={(e) => patchUnit(u.dept_code, { pillar_id: e.target.value || null })}
                          aria-label={`Kolom ${u.dept_code}`}
                          className={`${inputClass} w-auto min-w-0 flex-1`}
                        >
                          {pillars.map((p, k) => (
                            <option key={p.id} value={p.id}>{pillarLabel(p, k)}</option>
                          ))}
                          <option value="">Tidak ditampilkan</option>
                        </select>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_2fr]">
                        <label className="flex flex-col gap-1 text-xs text-slate-600">
                          Nama tampilan
                          <input value={u.display_name} onChange={(e) => patchUnit(u.dept_code, { display_name: e.target.value })} className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-600">
                          Warna utama
                          <input
                            type="color"
                            value={ACCENT_RE.test(u.accent) ? u.accent : "#000000"}
                            onChange={(e) => patchUnit(u.dept_code, { accent: e.target.value.toUpperCase() })}
                            className="h-[34px] w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                          />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-600 sm:col-span-1">
                          Fokus kerja (satu baris)
                          <input value={u.focus} onChange={(e) => patchUnit(u.dept_code, { focus: e.target.value })} className={inputClass} />
                        </label>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-700">Warna lainnya di dalam kartu</summary>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {CARD_COLOR_FIELDS.map((f) => {
                            const custom = u.colors[f.key];
                            return (
                              <div key={f.key} className="flex flex-col gap-1 text-xs text-slate-600">
                                <span>{f.label}</span>
                                <span className="flex items-center gap-1.5">
                                  <input
                                    type="color"
                                    value={cardColors(u)[f.key]}
                                    onChange={(e) => setColor(u, f.key, e.target.value)}
                                    aria-label={`${u.dept_code}: ${f.label}`}
                                    className="h-[30px] w-12 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5"
                                  />
                                  {custom ? (
                                    <button type="button" className={smallBtn} onClick={() => setColor(u, f.key, null)} title="Kembali ke warna bawaan">
                                      Bawaan
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">bawaan</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Orang khusus */}
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-1 font-semibold text-slate-900">3. Pemimpin kartu & jabatan tampilan</h3>
        <p className="mb-2 text-xs text-slate-500">
          &quot;Memimpin kartu&quot; = tampil paling atas di kartu itu walau departemen aslinya lain (mis. anggota Board).
          &quot;Jabatan tampilan&quot; menggantikan jabatan asli hanya di halaman ini (kosong = jabatan asli).
        </p>
        <ul className="flex flex-col gap-2">
          {people.map((p) => {
            const emp = empById.get(p.employee_id);
            return (
              <li key={p.key} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[2fr_1.5fr_2fr_auto] sm:items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Karyawan
                  <select value={p.employee_id} onChange={(e) => patchPerson(p.key, { employee_id: e.target.value })} className={inputClass}>
                    <option value="">- pilih -</option>
                    {props.employees.map((e) => (
                      <option key={e.id} value={e.id} disabled={e.id !== p.employee_id && people.some((x) => x.employee_id === e.id)}>
                        {e.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Memimpin kartu
                  <select value={p.lead_dept ?? ""} onChange={(e) => patchPerson(p.key, { lead_dept: e.target.value || null })} className={inputClass}>
                    <option value="">- tidak -</option>
                    {shownUnits.map((u) => (
                      <option key={u.dept_code} value={u.dept_code}>{u.display_name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Jabatan tampilan
                  <input
                    value={p.display_title ?? ""}
                    onChange={(e) => patchPerson(p.key, { display_title: e.target.value })}
                    placeholder={emp?.job_title ?? ""}
                    className={inputClass}
                  />
                </label>
                <button type="button" className={`${smallBtn} text-red-700 sm:mb-1`} onClick={() => set({ people: people.filter((x) => x.key !== p.key) })}>
                  Hapus
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={`${smallBtn} mt-2`}
          onClick={() => set({ people: [...people, { key: newId(), employee_id: "", lead_dept: null, display_title: null }] })}
        >
          + Tambah orang
        </button>
      </section>

      {message && !message.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : "Simpan struktur"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
