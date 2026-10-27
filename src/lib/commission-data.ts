import type { createClient } from "@/lib/supabase/server";
import { PRODUCT_COLUMNS, toProduct, type Product, type ReferralOwner } from "@/lib/commission";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Data untuk form klaim komisi: semua versi produk, kode referral karyawan aktif, dan kode saya.
export async function loadCommissionFormProps(
  supabase: Supabase,
  meId: string,
): Promise<{ products: Product[]; referrals: ReferralOwner[]; myCode: string }> {
  const [prodRes, empRes] = await Promise.all([
    supabase.from("products").select(PRODUCT_COLUMNS).order("name").order("valid_from"),
    supabase.from("employees").select("id, full_name, referral_code").eq("is_active", true).order("full_name"),
  ]);
  const emps = (empRes.data ?? []) as { id: string; full_name: string; referral_code: string | null }[];
  return {
    products: (prodRes.data ?? []).map((r) => toProduct(r as Record<string, unknown>)),
    referrals: emps.filter((e) => e.referral_code).map((e) => ({ code: e.referral_code as string, name: e.full_name })),
    myCode: emps.find((e) => e.id === meId)?.referral_code ?? "",
  };
}
