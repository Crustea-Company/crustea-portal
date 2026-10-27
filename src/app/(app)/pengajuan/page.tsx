import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_COLUMNS, canSeeAllRequests, type RequestRow } from "@/lib/requests";
import RequestList from "@/components/requests/RequestList";

export const metadata: Metadata = { title: "Pengajuan - Crustea Portal" };

const FINISHED = ["paid", "rejected"];

export default async function PengajuanPage() {
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .select(REQUEST_COLUMNS)
    .eq("requester_id", me.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as RequestRow[];
  const active = rows.filter((r) => !FINISHED.includes(r.status));
  const done = rows.filter((r) => FINISHED.includes(r.status));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
          <h1 className="text-2xl font-bold text-slate-900">Pengajuan saya</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeAllRequests(me) && (
            <Link
              href="/pengajuan/review"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Review F&A
            </Link>
          )}
          <Link
            href="/pengajuan/reimburse/baru"
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            + Ajukan reimburse
          </Link>
          <Link
            href="/pengajuan/pembayaran/baru"
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            + Permintaan pembayaran
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat pengajuan: {error.message}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-slate-900">Sedang berjalan</h2>
        <RequestList rows={active} empty="Belum ada pengajuan yang sedang berjalan." />
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-slate-900">Selesai</h2>
          <RequestList rows={done} empty="" />
        </section>
      )}
    </main>
  );
}
