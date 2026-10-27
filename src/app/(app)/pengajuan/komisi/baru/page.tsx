import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { loadCommissionFormProps } from "@/lib/commission-data";
import { loadClaimableLeads } from "@/lib/sales-data";
import CommissionForm from "../CommissionForm";

export const metadata: Metadata = { title: "Klaim Komisi - Crustea Portal" };

export default async function KomisiBaruPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const [props, leads] = await Promise.all([loadCommissionFormProps(supabase, me.id), loadClaimableLeads(supabase, me.id, null)]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Klaim komisi</h1>
        <p className="mt-1 text-sm text-slate-600">
          Satu klaim boleh berisi beberapa penjualan. Komisi = (total penjualan − HPP) × % komisi produk. Ditinjau Finance &
          Accounting maksimal 2 hari kerja per status; diterima setelah penjualan lunas.{" "}
          <Link href="/produk" className="font-medium text-brand-700 hover:underline">
            Lihat master produk
          </Link>
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <CommissionForm
          fullName={me.full_name}
          today={todayJakarta()}
          {...props}
          leads={leads}
          initialLeadIds={lead ? lead.split(",") : []}
        />
      </div>
      <Link href="/pengajuan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pengajuan saya
      </Link>
    </main>
  );
}
