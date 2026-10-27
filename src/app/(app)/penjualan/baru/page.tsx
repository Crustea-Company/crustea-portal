import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { loadLeadFormProps } from "@/lib/sales-data";
import LeadForm from "../LeadForm";

export const metadata: Metadata = { title: "Catat Lead - Crustea Portal" };

export default async function LeadBaruPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const props = await loadLeadFormProps(supabase);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Penjualan</p>
        <h1 className="text-2xl font-bold text-slate-900">Catat lead baru</h1>
        <p className="mt-1 text-sm text-slate-600">
          Catat paling lambat 1×24 jam setelah lead masuk. Isi kode referral bila lead datang dari rekan kerja: pemilik
          kode itu yang nanti mengklaim komisinya.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <LeadForm meId={me.id} today={todayJakarta()} {...props} />
      </div>
      <Link href="/penjualan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pipeline penjualan
      </Link>
    </main>
  );
}
