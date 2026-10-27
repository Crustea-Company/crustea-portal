import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { loadTravelFormProps } from "@/lib/travel-data";
import TravelForm from "../TravelForm";

export const metadata: Metadata = { title: "Penugasan Dinas - Crustea Portal" };

export default async function DinasBaruPage() {
  const me = (await getCurrentEmployee())!;
  const props = await loadTravelFormProps(await createClient(), me.id, todayJakarta());
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Penugasan perjalanan dinas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ajukan minimal {props.params.min_notice_days} hari kerja sebelum berangkat. Alur: penugas → surat tugas
          (Corporate Affairs) → verifikasi Finance.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TravelForm meId={me.id} fullName={me.full_name} {...props} />
      </div>
      <Link href="/pengajuan" className="text-sm font-medium text-brand-700 hover:underline">
        ← Pengajuan saya
      </Link>
    </main>
  );
}
