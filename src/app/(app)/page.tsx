import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";

const ROLE_LABEL = {
  admin: "Admin",
  ceo: "CEO",
  head: "Kepala Departemen",
  staff: "Staf",
} as const;

// Beranda sementara: menyapa karyawan yang sudah login.
export default async function Home() {
  const employee = (await getCurrentEmployee())!;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
      <div>
        <p className="text-sm font-medium text-teal-700">Selamat datang,</p>
        <h1 className="text-2xl font-bold text-slate-900">{employee.full_name}</h1>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-500">Jabatan</dt>
        <dd className="text-slate-900">{employee.job_title ?? "-"}</dd>
        <dt className="text-slate-500">Departemen</dt>
        <dd className="text-slate-900">{employee.dept_code ?? "-"}</dd>
        <dt className="text-slate-500">Peran aplikasi</dt>
        <dd className="text-slate-900">{ROLE_LABEL[employee.app_role]}</dd>
        <dt className="text-slate-500">Status kerja</dt>
        <dd className="text-slate-900">{employee.emp_status}</dd>
      </dl>
      <Link
        href="/tugas?pic=saya"
        className="rounded-lg bg-teal-700 px-4 py-3 text-center font-semibold text-white hover:bg-teal-800"
      >
        Lihat tugas saya
      </Link>
      <Link
        href="/log-kerja"
        className="rounded-lg border border-teal-700 px-4 py-3 text-center font-semibold text-teal-800 hover:bg-teal-50"
      >
        Catat log kerja
      </Link>
      <Link
        href="/dashboard"
        className="rounded-lg border border-slate-300 px-4 py-3 text-center font-semibold text-slate-700 hover:bg-slate-100"
      >
        Buka dashboard
      </Link>
    </main>
  );
}
