import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { todayJakarta } from "@/lib/format";
import { canManageAssets } from "@/lib/sales";
import AssetForm from "../AssetForm";

export const metadata: Metadata = { title: "Aset Baru - Crustea Portal" };

export default async function AsetBaruPage() {
  const me = (await getCurrentEmployee())!;
  if (!canManageAssets(me)) redirect("/aset");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Aset</p>
        <h1 className="text-2xl font-bold text-slate-900">Serah terima aset baru</h1>
        <p className="mt-1 text-sm text-slate-600">
          Setelah disimpan, Finance mendapat notifikasi untuk meregistrasi aset (kode unik, lokasi, nilai) maksimal 5 hari kerja.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <AssetForm today={todayJakarta()} />
      </div>
      <Link href="/aset" className="text-sm font-medium text-brand-700 hover:underline">
        ← Daftar aset
      </Link>
    </main>
  );
}
