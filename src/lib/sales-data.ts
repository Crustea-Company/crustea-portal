import type { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, LEAD_STAGES, WON_RANK, toLead, type Lead, type LeadClaim } from "@/lib/sales";
import type { ReferralOwner } from "@/lib/commission";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Pilihan produk (satu per kode, nama versi terbaru), kode referral, dan karyawan aktif (PIC sales; BDS di atas).
export async function loadLeadFormProps(supabase: Supabase): Promise<{
  products: { code: string; name: string }[];
  referrals: ReferralOwner[];
  people: { id: string; full_name: string }[];
}> {
  const [prodRes, empRes] = await Promise.all([
    supabase.from("products").select("code, name, valid_from").order("valid_from"),
    supabase.from("employees").select("id, full_name, dept_code, referral_code").eq("is_active", true).order("full_name"),
  ]);
  const products = [
    ...new Map(((prodRes.data ?? []) as { code: string; name: string }[]).map((p) => [p.code, { code: p.code, name: p.name }])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const emps = (empRes.data ?? []) as { id: string; full_name: string; dept_code: string | null; referral_code: string | null }[];
  return {
    products,
    referrals: emps.filter((e) => e.referral_code).map((e) => ({ code: e.referral_code as string, name: e.full_name })),
    people: [...emps.filter((e) => e.dept_code === "BDS"), ...emps.filter((e) => e.dept_code !== "BDS")].map((e) => ({
      id: e.id,
      full_name: e.dept_code === "BDS" ? e.full_name : `${e.full_name} (${e.dept_code ?? "-"})`,
    })),
  };
}

export async function loadLeadClaims(supabase: Supabase, ids: string[]): Promise<LeadClaim[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.rpc("lead_commission_claims", { p_ids: ids });
  return (data ?? []) as LeadClaim[];
}

// Penjualan yang bisa saya klaim komisinya: sudah closing, saya pemilik referral (atau PIC sales bila tanpa
// referral), dan belum diklaim di pengajuan lain (klaim yang sedang diubah, requestId, tetap dihitung milik saya).
export async function loadClaimableLeads(supabase: Supabase, meId: string, requestId: string | null): Promise<Lead[]> {
  const closed = LEAD_STAGES.slice(WON_RANK);
  const { data } = await supabase
    .from("sales_leads")
    .select(LEAD_COLUMNS)
    .in("stage", closed)
    .or(`referral_id.eq.${meId},and(referral_id.is.null,sales_id.eq.${meId})`)
    .order("closed_on", { ascending: false });
  const leads = (data ?? []).map((r) => toLead(r as Record<string, unknown>));
  const claims = await loadLeadClaims(supabase, leads.map((l) => l.id));
  const taken = new Set(claims.filter((c) => c.request_id !== requestId).map((c) => c.lead_id));
  return leads.filter((l) => !taken.has(l.id));
}
