import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber, todayJakarta } from "@/lib/format";
import { canApproveAsCeo, canReviewRequests, isFaHead, isTechOps } from "@/lib/requests";
import {
  ASSET_CATEGORIES,
  ASSET_COLUMNS,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_STYLE,
  LEAD_STAGES,
  WON_RANK,
  bookValue,
  canManageAssets,
  daysSince,
  toAsset,
  type AssetEvent,
} from "@/lib/sales";
import { AssetLogForm, AssetPanel, EditAsset } from "./AssetPanel";

export const metadata: Metadata = { title: "Detail Aset - Crustea Portal" };

const rp = (n: number) => `Rp${formatNumber(n)}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

const ACTION_LABEL: Record<AssetEvent["action"], string> = {
  create: "Mencatat serah terima aset",
  status: "Mengubah status",
  maintenance: "Pemeliharaan",
  opname: "Stock opname",
  note: "Memberi catatan",
};

export default async function AsetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await getCurrentEmployee())!;
  const supabase = await createClient();
  const today = todayJakarta();
  const [assetRes, eventRes] = await Promise.all([
    supabase.from("assets").select(`${ASSET_COLUMNS}, disposal_ceo_by, disposal_fa_by`).eq("id", id).maybeSingle(),
    supabase
      .from("asset_events")
      .select("id, action, from_status, to_status, note, done_on, created_at, actor:employees!asset_events_actor_fkey(full_name)")
      .eq("asset_id", id)
      .order("created_at"),
  ]);
  if (!assetRes.data) notFound();
  const asset = toAsset(assetRes.data as Record<string, unknown>);
  const events = (eventRes.data ?? []) as unknown as AssetEvent[];
  const approvals = assetRes.data as unknown as { disposal_ceo_by?: string | null; disposal_fa_by?: string | null };
  const manage = canManageAssets(me);
  const book = bookValue(asset, today);

  // Penjualan yang sudah closing, untuk pilihan penempatan di lokasi klien.
  let leads: { id: string; label: string }[] = [];
  let placedLead: string | null = null;
  if (isTechOps(me) && (asset.status === "registered" || asset.status === "damaged")) {
    const { data } = await supabase
      .from("sales_leads")
      .select("id, number, customer")
      .in("stage", LEAD_STAGES.slice(WON_RANK))
      .order("created_at", { ascending: false })
      .limit(100);
    leads = ((data ?? []) as { id: string; number: string; customer: string }[]).map((l) => ({ id: l.id, label: `${l.number} · ${l.customer}` }));
  }
  if (asset.lead_id) {
    const { data } = await supabase.from("sales_leads").select("number, customer").eq("id", asset.lead_id).maybeSingle();
    if (data) placedLead = `${data.number} · ${data.customer}`;
  }
  // Admin boleh mengisi kedua persetujuan; CEO/Head F&A hanya bagiannya sendiri.
  const approver = canApproveAsCeo(me) || isFaHead(me);
  const myApprovalDone =
    me.app_role === "admin"
      ? false
      : me.app_role === "ceo"
        ? Boolean(approvals.disposal_ceo_by)
        : Boolean(approvals.disposal_fa_by);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{asset.code ?? "Belum ada kode"}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ASSET_STATUS_STYLE[asset.status]}`}>{ASSET_STATUS_LABEL[asset.status]}</span>
          <span>· {ASSET_CATEGORIES[asset.category]}</span>
          <span>· {daysSince(asset.status_since)} hari di status ini</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{asset.name}</h1>
        {asset.status === "received" && (
          <p className="text-sm text-orange-800">Menunggu registrasi Finance (maks. 5 hari kerja setelah BAST).</p>
        )}
      </div>

      {asset.status === "disposal_proposed" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Usulan penghapusan · CEO: {asset.disposal_ceo_at ? `disetujui ${formatDate(asset.disposal_ceo_at.slice(0, 10))}` : "belum"} · Head
          F&A: {asset.disposal_fa_at ? `disetujui ${formatDate(asset.disposal_fa_at.slice(0, 10))}` : "belum"}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tanggal serah terima (BAST)">{formatDate(asset.received_on)}</Field>
          <Field label="Tanggal registrasi">{formatDate(asset.registered_on)}</Field>
          <Field label="Lokasi">{asset.location || "-"}</Field>
          <Field label="Penerima / penanggung jawab">{asset.holder || "-"}</Field>
          <Field label="Nilai perolehan">{asset.value !== null ? rp(asset.value) : "-"}</Field>
          <Field label="Nilai buku (garis lurus)">
            {book !== null ? `${rp(book)} · umur manfaat ${formatNumber(asset.useful_life_months ?? 0)} bulan` : "Isi nilai & umur manfaat"}
          </Field>
          <Field label="Referensi (PO / GRN / BAST)">
            {asset.reference && /^https?:\/\//i.test(asset.reference) ? (
              <a href={asset.reference} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                {asset.reference}
              </a>
            ) : (
              asset.reference || "-"
            )}
          </Field>
          {placedLead && asset.lead_id && (
            <Field label="Penjualan terkait">
              <Link href={`/penjualan/${asset.lead_id}`} className="text-brand-700 hover:underline">
                {placedLead}
              </Link>
            </Field>
          )}
        </dl>
        {asset.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{asset.notes}</p>}
      </section>

      {manage && asset.status !== "disposed" && <EditAsset asset={asset} today={today} />}

      {asset.status !== "disposed" && (
        <AssetPanel
          key={asset.status}
          asset={asset}
          leads={leads}
          myApprovalDone={myApprovalDone}
          roles={{ manage, finance: canReviewRequests(me), techops: isTechOps(me), approver }}
        />
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Riwayat, pemeliharaan & opname</h2>
        <ol className="flex flex-col">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span
                className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${
                  e.action === "maintenance" || e.action === "opname" ? "bg-logo-leaf" : e.action === "note" ? "bg-logo-lime" : "bg-brand-600"
                }`}
              />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{e.actor?.full_name ?? "Sistem"}</span> · {ACTION_LABEL[e.action]}
                {e.action === "status" && e.to_status ? `: ${ASSET_STATUS_LABEL[e.to_status]}` : ""}
                {e.done_on ? ` (${formatDate(e.done_on)})` : ""}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
              {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>}
            </li>
          ))}
        </ol>
        <AssetLogForm id={asset.id} today={today} manage={manage} />
      </section>

      <Link href="/aset" className="text-sm font-medium text-brand-700 hover:underline">
        ← Daftar aset
      </Link>
    </main>
  );
}
