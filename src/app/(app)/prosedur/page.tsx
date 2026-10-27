import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProcedureList, { type ProcedureRow } from "./ProcedureList";

export const metadata: Metadata = { title: "Prosedur - Crustea Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProsedurPage({ searchParams }: { searchParams: SearchParams }) {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const params = await searchParams;
  const sop = typeof params.sop === "string" ? params.sop.toUpperCase() : "";

  const [procRes, deptRes] = await Promise.all([
    supabase
      .from("procedures")
      .select("id, sop_code, title, dept_code, sort_order, body, updated_at")
      .order("sort_order")
      .order("title"),
    supabase.from("departments").select("code, name").order("code"),
  ]);

  if (procRes.error || deptRes.error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat prosedur: {(procRes.error ?? deptRes.error)!.message}
        </p>
      </main>
    );
  }

  const rows = (procRes.data ?? []) as (ProcedureRow & { body: string })[];

  // Link dari kode SOP di kartu tugas: langsung buka prosedurnya kalau ada.
  if (sop) {
    const match = rows.find((r) => r.sop_code === sop);
    if (match) redirect(`/prosedur/${match.id}`);
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Panduan kerja</p>
          <h1 className="text-2xl font-bold text-slate-900">Prosedur</h1>
        </div>
        {me.app_role === "admin" && (
          <Link
            href="/prosedur/baru"
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            + Tambah prosedur
          </Link>
        )}
      </div>

      {sop && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prosedur untuk kode <strong>{sop}</strong> belum diisi.
          {me.app_role === "admin" ? " Tambahkan lewat tombol Tambah prosedur dan isi kolom Kode SOP." : " Hubungi admin."}
        </p>
      )}

      <ProcedureList
        rows={rows.map((r) => ({ ...r, excerpt: r.body.replace(/[#*|>`_\-[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) }))}
        departments={deptRes.data ?? []}
      />
    </main>
  );
}
