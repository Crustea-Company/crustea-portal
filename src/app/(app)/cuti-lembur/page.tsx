import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cuti & Lembur - Crustea Portal" };

// Belum dibangun (lihat docs/fase-2-3/09-cuti-lembur.md).
export default function CutiLemburPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Cuti & Lembur</h1>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {["Klaim cuti", "Klaim lembur"].map((t) => (
          <div key={t} className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
            <p className="font-semibold text-slate-900">{t}</p>
            <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Sedang dalam pengembangan
            </span>
            <p className="mt-2 text-sm text-slate-600">Untuk sementara, ajukan lewat Corporate Affairs seperti biasa.</p>
          </div>
        ))}
      </div>
      <Link href="/prosedur" className="text-sm font-medium text-brand-700 hover:underline">
        ← Lihat semua prosedur
      </Link>
    </main>
  );
}
