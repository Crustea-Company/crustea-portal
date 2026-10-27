import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { todayJakarta } from "@/lib/format";
import ProcurementForm from "../ProcurementForm";

export const metadata: Metadata = { title: "Pengadaan Barang & Jasa - Crustea Portal" };

export default async function PengadaanBaruPage() {
  const me = (await getCurrentEmployee())!;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Permohonan pengadaan (PR)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Untuk membeli barang atau jasa. Alur: head departemen → TechOps membandingkan minimal 3 vendor → Finance →
          Head F&A (≥ Rp5 juta: CEO) → PO terbit → barang diterima → pembayaran vendor.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ProcurementForm employeeId={me.id} fullName={me.full_name} deptCode={me.dept_code} today={todayJakarta()} />
      </div>
      <Link href="/pengajuan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pengajuan saya
      </Link>
    </main>
  );
}
