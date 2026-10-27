import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { todayJakarta } from "@/lib/format";
import ReimburseForm from "../ReimburseForm";

export const metadata: Metadata = { title: "Ajukan Reimburse - Crustea Portal" };

export default async function ReimburseBaruPage() {
  const me = (await getCurrentEmployee())!;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Klaim reimburse</h1>
        <p className="mt-1 text-sm text-slate-600">
          Satu pengajuan untuk satu transaksi. Ditinjau Finance & Accounting maksimal 2 hari kerja per status.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ReimburseForm employeeId={me.id} fullName={me.full_name} today={todayJakarta()} />
      </div>
      <Link href="/pengajuan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pengajuan saya
      </Link>
    </main>
  );
}
