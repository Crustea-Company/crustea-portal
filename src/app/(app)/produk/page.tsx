import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { canReviewRequests } from "@/lib/requests";
import { PRODUCT_COLUMNS, isValidOn, toProduct } from "@/lib/commission";
import ProductEditor from "./ProductEditor";
import ProductBrowser from "./ProductBrowser";

export const metadata: Metadata = { title: "Produk & Komisi - Crustea Portal" };

export default async function ProdukPage() {
  const me = (await getCurrentEmployee())!;
  const canEdit = canReviewRequests(me);
  const today = todayJakarta();
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(PRODUCT_COLUMNS).order("name").order("valid_from", { ascending: false });
  const products = (data ?? []).map((r) => toProduct(r as Record<string, unknown>));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Master data</p>
          <h1 className="text-2xl font-bold text-slate-900">Produk & komisi</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Komisi = (total penjualan − HPP) × % komisi. Profit ≤ 0 berarti komisi 0. Jual di bawah harga minimal mengurangi
            komisi. {canEdit ? "Anda (admin/F&A) bisa mengubah data ini." : "Data diubah oleh admin/F&A."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/profil" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Kode referral saya
          </Link>
          <Link href="/pengajuan/komisi/baru" className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            + Klaim komisi
          </Link>
        </div>
      </div>

      {canEdit && <ProductEditor product={null} today={today} />}

      <ProductBrowser
        current={products.filter((p) => isValidOn(p, today))}
        others={products.filter((p) => !isValidOn(p, today))}
        canEdit={canEdit}
        today={today}
      />
    </main>
  );
}
