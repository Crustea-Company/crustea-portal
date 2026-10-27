import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import PaymentForm from "../PaymentForm";

export const metadata: Metadata = { title: "Permintaan Pembayaran - Crustea Portal" };

export default async function PembayaranBaruPage() {
  const me = (await getCurrentEmployee())!;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Permintaan pembayaran</h1>
        <p className="mt-1 text-sm text-slate-600">
          Untuk pembayaran ke vendor/pihak lain. Ditinjau Finance & Accounting maksimal 2 hari kerja per status.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <PaymentForm employeeId={me.id} fullName={me.full_name} />
      </div>
      <Link href="/pengajuan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pengajuan saya
      </Link>
    </main>
  );
}
