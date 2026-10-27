// Master produk, klaim komisi, dan kode referral (migrasi 011, docs/fase-2-3/06-produk-komisi-referral.md).
// Perhitungan komisi resmi dilakukan database (prepare_commission_claim); fungsi di sini untuk pratinjau.

export type ProductType = "unit" | "bundle";

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = { unit: "Satuan", bundle: "Bundle" };

export type Product = {
  id: string;
  code: string;
  name: string;
  type: ProductType;
  price: number; // harga jual acuan, excl. VAT
  hpp: number; // HPP per unit
  commission_pct: number; // 0.025 = 2,5%
  max_discount: number; // 0.05 = 5%
  bundle_items: string | null;
  promo_price: number | null;
  notes: string | null;
  valid_from: string;
  valid_to: string | null;
};

export const PRODUCT_COLUMNS =
  "id, code, name, type, price, hpp, commission_pct, max_discount, bundle_items, promo_price, notes, valid_from, valid_to";

// Angka dari Supabase (numeric) bisa berupa string; disamakan jadi number.
export function toProduct(row: Record<string, unknown>): Product {
  return {
    ...(row as unknown as Product),
    price: Number(row.price),
    hpp: Number(row.hpp),
    commission_pct: Number(row.commission_pct),
    max_discount: Number(row.max_discount),
    promo_price: row.promo_price === null ? null : Number(row.promo_price),
  };
}

export function isValidOn(p: Product, date: string): boolean {
  return p.valid_from <= date && (p.valid_to === null || p.valid_to >= date);
}

// Versi produk yang berlaku pada tanggal tertentu (sama dengan pencarian di database).
export function productOn(products: Product[], code: string, date: string): Product | null {
  return (
    products
      .filter((p) => p.code === code && isValidOn(p, date))
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null
  );
}

export type ProductMetrics = {
  profit: number; // per unit
  margin: number; // gross margin (0..1)
  commission: number; // komisi standar per unit
  min_price: number; // harga minimal (setelah diskon maks)
  min_profit: number; // profit di harga minimal
  min_commission: number; // komisi per unit di harga minimal
};

export function productMetrics(p: Product): ProductMetrics {
  const profit = p.price - p.hpp;
  const commission = Math.round(profit * p.commission_pct);
  const min_price = Math.round(p.price * (1 - p.max_discount));
  const min_profit = min_price - p.hpp;
  const ratio = profit > 0 ? Math.min(1, Math.max(0, min_profit / profit)) : 0;
  return {
    profit,
    margin: p.price > 0 ? profit / p.price : 0,
    commission,
    min_price,
    min_profit,
    min_commission: profit <= 0 ? 0 : Math.round(commission * ratio),
  };
}

// 0.025 -> "2,5%"
export function formatPct(n: number): string {
  return `${(Math.round(n * 10000) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

// ---------- Klaim komisi ----------

export type CommissionLineInput = {
  customer: string;
  invoice: string; // No. Invoice / PO / Kontrak
  closing_date: string;
  product_code: string;
  units: number;
  sales_total: number; // total nominal penjualan (Rp)
  justification: string; // link bukti leads
  referral_code: string;
};

// Baris yang sudah dihitung database.
export type CommissionLine = CommissionLineInput & {
  referral_id: string | null;
  referral_name: string | null;
  product_id: string;
  product_name: string;
  commission_pct: number;
  hpp_unit: number;
  hpp_total: number;
  profit: number;
  commission: number;
  no_profit: boolean;
  below_min: boolean;
};

export type CommissionData = {
  lines: CommissionLine[];
  sales_paid?: boolean; // dicentang F&A saat menerima klaim
  sales_paid_at?: string;
};

export const MAX_COMMISSION_LINES = 30;

export type LinePreview = {
  product: Product;
  hpp_total: number;
  profit: number;
  commission: number;
  no_profit: boolean;
  below_min: boolean;
};

export function previewLine(line: CommissionLineInput, products: Product[]): LinePreview | null {
  if (!line.closing_date || !line.product_code) return null;
  const product = productOn(products, line.product_code, line.closing_date);
  if (!product) return null;
  const hpp_total = line.units * product.hpp;
  const profit = line.sales_total - hpp_total;
  return {
    product,
    hpp_total,
    profit,
    commission: profit <= 0 ? 0 : Math.round(profit * product.commission_pct),
    no_profit: profit <= 0,
    below_min: line.sales_total < line.units * Math.round(product.price * (1 - product.max_discount)),
  };
}

export type ReferralOwner = { code: string; name: string };
