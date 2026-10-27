import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { ReimburseData, RequestFile } from "@/lib/requests";
import type { AttachmentItem } from "@/components/requests/FileOrLinkInput";
import ReimburseForm from "../../reimburse/ReimburseForm";

export const metadata: Metadata = { title: "Ubah Pengajuan - Crustea Portal" };

type Params = Promise<{ id: string }>;

// Ubah pengajuan milik sendiri yang berstatus Draf / Perlu perbaikan, lalu kirim ulang.
export default async function UbahPengajuanPage({ params }: { params: Params }) {
  const me = (await getCurrentEmployee())!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [reqRes, fileRes] = await Promise.all([
    supabase.from("requests").select("id, kind, requester_id, title, amount, status, data").eq("id", id).maybeSingle(),
    supabase
      .from("request_files")
      .select("id, kind, purpose, path, url, name, size_bytes")
      .eq("request_id", id)
      .eq("purpose", "proof")
      .order("created_at"),
  ]);
  const req = reqRes.data;
  if (!req) notFound();
  if (req.requester_id !== me.id || !["draft", "needs_revision"].includes(req.status) || req.kind !== "reimburse") {
    redirect(`/pengajuan/${id}`);
  }

  const data = req.data as ReimburseData;
  const attachments: AttachmentItem[] = ((fileRes.data ?? []) as RequestFile[]).map((f) =>
    f.kind === "file"
      ? { key: f.id, kind: "file", id: f.id, path: f.path ?? "", name: f.name, size_bytes: f.size_bytes ?? 0 }
      : { key: f.id, kind: "link", id: f.id, url: f.url ?? "", name: f.name },
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Pengajuan</p>
        <h1 className="text-2xl font-bold text-slate-900">Perbaiki klaim reimburse</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ReimburseForm
          employeeId={me.id}
          fullName={me.full_name}
          today={todayJakarta()}
          initial={{
            id: req.id as string,
            input: { ...data, description: req.title as string, amount: Number(req.amount) },
            attachments,
          }}
        />
      </div>
      <Link href={`/pengajuan/${id}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Kembali ke detail
      </Link>
    </main>
  );
}
