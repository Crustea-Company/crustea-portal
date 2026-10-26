"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { saveEmployee, setEmployeeActive, type EmployeeInput } from "./actions";

export type AdminEmployee = EmployeeInput & {
  id: string;
  is_active: boolean;
  left_at: string | null;
};

const ROLE_LABEL: Record<EmployeeInput["app_role"], string> = {
  admin: "Admin",
  ceo: "CEO",
  head: "Kepala Departemen",
  staff: "Staf",
};
const STATUS_LABEL: Record<EmployeeInput["emp_status"], string> = {
  PKWTT: "PKWTT (40 jam/minggu)",
  PKWT: "PKWT (20 jam/minggu)",
  INTERN: "Intern (20 jam/minggu)",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

export default function EmployeeManager({
  employees,
  departments,
  meId,
  today,
}: {
  employees: AdminEmployee[];
  departments: { code: string; name: string }[];
  meId: string;
  today: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"active" | "inactive" | "all">("active");
  const [dept, setDept] = useState("");
  const [editing, setEditing] = useState<AdminEmployee | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [leftAt, setLeftAt] = useState(today);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => (show === "all" ? true : show === "active" ? e.is_active : !e.is_active))
      .filter((e) => !dept || e.dept_code === dept)
      .filter((e) => !q || e.full_name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));
  }, [employees, query, show, dept]);

  const activeCount = employees.filter((e) => e.is_active).length;

  function setActive(e: AdminEmployee, active: boolean) {
    setMessage(null);
    startTransition(async () => {
      const res = await setEmployeeActive(e.id, active, active ? null : leftAt);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDeactivating(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {activeCount} karyawan aktif · {employees.length - activeCount} nonaktif
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
        >
          + Tambah karyawan
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama atau email..."
          className={inputClass}
        />
        <select aria-label="Departemen" value={dept} onChange={(e) => setDept(e.target.value)} className={inputClass}>
          <option value="">Semua departemen</option>
          {departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status aktif"
          value={show}
          onChange={(e) => setShow(e.target.value as typeof show)}
          className={inputClass}
        >
          <option value="active">Hanya aktif</option>
          <option value="inactive">Hanya nonaktif</option>
          <option value="all">Semua</option>
        </select>
      </div>

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.ok ? "border-brand-200 bg-brand-50 text-brand-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Tidak ada karyawan yang cocok.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((e) => (
            <li
              key={e.id}
              className={`rounded-xl border p-3 text-sm ${e.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {e.full_name}
                    {e.id === meId && <span className="ml-1 font-normal text-slate-500">(Anda)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{e.email}</p>
                  <p className="text-xs text-slate-600">
                    {e.dept_code ?? "-"}
                    {e.job_title ? ` · ${e.job_title}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800">
                      {ROLE_LABEL[e.app_role]}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{e.emp_status}</span>
                    {!e.ats_required && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Tidak wajib ATS</span>
                    )}
                    {!e.is_active && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">
                        Nonaktif{e.left_at ? ` sejak ${formatDate(e.left_at)}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Ubah
                  </button>
                  {e.is_active ? (
                    e.id !== meId && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeactivating(deactivating === e.id ? null : e.id);
                          setLeftAt(today);
                        }}
                        className="rounded-lg border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50"
                      >
                        Nonaktifkan
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActive(e, true)}
                      disabled={pending}
                      className="rounded-lg border border-brand-300 px-2.5 py-1 font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Aktifkan kembali
                    </button>
                  )}
                </div>
              </div>

              {deactivating === e.id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs">
                  <p className="text-slate-600">
                    {e.full_name} tidak bisa login lagi dan tidak tampil di laporan ATS. Log kerja, tugas, dan snapshot
                    lamanya tetap tersimpan. Bisa diaktifkan kembali kapan saja.
                  </p>
                  <label className="flex items-center gap-2 font-medium text-slate-700">
                    Tanggal keluar
                    <input
                      type="date"
                      value={leftAt}
                      onChange={(ev) => setLeftAt(ev.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActive(e, false)}
                      disabled={pending}
                      className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {pending ? "Memproses..." : `Nonaktifkan ${e.full_name}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeactivating(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EmployeeForm
          employee={editing === "new" ? null : editing}
          departments={departments}
          isSelf={editing !== "new" && editing.id === meId}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage({ ok: true, text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({
  employee,
  departments,
  isSelf,
  onClose,
  onSaved,
}: {
  employee: AdminEmployee | null;
  departments: { code: string; name: string }[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [input, setInput] = useState<EmployeeInput>(() => ({
    email: employee?.email ?? "",
    full_name: employee?.full_name ?? "",
    dept_code: employee?.dept_code ?? departments[0]?.code ?? "",
    job_title: employee?.job_title ?? "",
    emp_status: employee?.emp_status ?? "PKWTT",
    app_role: employee?.app_role ?? "staff",
    ats_required: employee?.ats_required ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) =>
    setInput((cur) => ({ ...cur, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveEmployee(input, employee?.id ?? null);
      if (!res.ok) return setError(res.message);
      onSaved(res.message);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="flex max-h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{employee ? `Ubah ${employee.full_name}` : "Tambah karyawan"}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-slate-500" aria-label="Tutup">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Email (dipakai untuk login)
            <input
              type="email"
              required
              value={input.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
            />
            {employee && (
              <span className="text-xs font-normal text-slate-500">
                Kalau email diganti, karyawan harus login dengan email baru.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 font-medium text-slate-700">
            Nama lengkap
            <input required value={input.full_name} onChange={(e) => set("full_name", e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Departemen
              <select value={input.dept_code} onChange={(e) => set("dept_code", e.target.value)} className={inputClass}>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Jabatan
              <input value={input.job_title} onChange={(e) => set("job_title", e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Status kerja
              <select
                value={input.emp_status}
                onChange={(e) => set("emp_status", e.target.value as EmployeeInput["emp_status"])}
                className={inputClass}
              >
                {(Object.keys(STATUS_LABEL) as EmployeeInput["emp_status"][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Peran aplikasi
              <select
                value={input.app_role}
                onChange={(e) => set("app_role", e.target.value as EmployeeInput["app_role"])}
                disabled={isSelf}
                className={inputClass}
              >
                {(Object.keys(ROLE_LABEL) as EmployeeInput["app_role"][]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {isSelf && (
                <span className="text-xs font-normal text-slate-500">Peran akun Anda sendiri tidak bisa diubah.</span>
              )}
            </label>
          </div>
          {employee && input.emp_status !== employee.emp_status && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Target jam akan mengikuti status baru untuk periode berjalan dan seterusnya. Snapshot periode yang sudah
              ditutup tidak berubah.
            </p>
          )}
          <label className="flex items-start gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={input.ats_required}
              onChange={(e) => set("ats_required", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-700"
            />
            <span>
              Wajib ATS
              <span className="block text-xs font-normal text-slate-500">
                Matikan untuk CEO, CTO, dan Head of Corporate Affairs: tidak tampil di laporan ketercapaian ATS.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? "Menyimpan..." : employee ? "Simpan perubahan" : "Tambah karyawan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
