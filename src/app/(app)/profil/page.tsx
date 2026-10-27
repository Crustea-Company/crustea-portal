import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CopyButton from "./CopyButton";

export const metadata: Metadata = { title: "Profil Saya - Crustea Portal" };

const ROLE_LABEL: Record<string, string> = { admin: "Admin", ceo: "CEO", head: "Kepala Departemen", staff: "Staf" };

export default async function ProfilPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("referral_code").eq("id", me.id).single();
  const code = (data?.referral_code as string | null) ?? null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{me.full_name}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Email</dt>
            <dd className="break-all text-slate-900">{me.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Departemen</dt>
            <dd className="text-slate-900">{me.dept_code ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Jabatan</dt>
            <dd className="text-slate-900">{me.job_title ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Status kerja · peran aplikasi</dt>
            <dd className="text-slate-900">
              {me.emp_status} · {ROLE_LABEL[me.app_role] ?? me.app_role}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600/40 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Kode referral saya</h2>
        {code ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl bg-brand-50 px-4 py-2 font-mono text-2xl font-bold tracking-wide text-brand-900">{code}</span>
            <CopyButton text={code} />
          </div>
        ) : (
          <p className="text-sm text-slate-600">Belum ada kode referral. Hubungi admin.</p>
        )}
        <p className="text-sm text-slate-600">
          Bagikan kode ini ke calon customer atau rekan. Penjualan yang memakai kode Anda tercatat sebagai lead dari Anda dan
          dapat diklaim komisinya.
        </p>
        <Link href="/pengajuan/komisi/baru" className="text-sm font-medium text-brand-700 hover:underline">
          Ajukan klaim komisi →
        </Link>
      </section>
    </main>
  );
}
