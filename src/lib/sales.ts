// Penjualan teknologi, stok, dan aset (migrasi 012, docs/fase-2-3/07-penjualan-aset.md).
// Aturan alur resmi ada di database (change_lead_stage, change_asset_status); di sini label & bantuan tampilan.

type Me = { id: string; dept_code: string | null; app_role: string };

// ---------- Penjualan ----------

export const LEAD_STAGES = [
  "lead",
  "contacted",
  "site_visit",
  "stock_checked",
  "quotation",
  "quotation_approved",
  "negotiation",
  "contract",
  "won",
  "paid",
  "work_order",
  "installed",
  "feedback",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number] | "lost";

export const STAGE_LABEL: Record<LeadStage, string> = {
  lead: "Lead masuk",
  contacted: "Kontak awal",
  site_visit: "Site visit",
  stock_checked: "Stok dicek",
  quotation: "Quotation",
  quotation_approved: "Disetujui CMO",
  negotiation: "Negosiasi",
  contract: "Kontrak",
  won: "Closing (Sales Order)",
  paid: "Lunas",
  work_order: "Work order",
  installed: "Terpasang (BAST)",
  feedback: "Feedback customer",
  lost: "Gagal",
};

// Penjelasan singkat tiap tahap + batas waktu dari SOP.
export const STAGE_HINT: Partial<Record<LeadStage, string>> = {
  lead: "Catat ≤ 1×24 jam setelah lead masuk.",
  contacted: "Jelaskan solusi dan jadwalkan site visit.",
  site_visit: "Site visit report ≤ 2 hari kerja setelah visit.",
  stock_checked: "Cek stok & lead time ke TechOps ≤ 1 hari kerja.",
  quotation: "Produk, harga, waktu instalasi, garansi 6 bulan, T&C.",
  quotation_approved: "Diskon / custom / nilai besar: approval CMO ≤ 1 hari kerja.",
  negotiation: "Follow-up ≤ 2×24 jam.",
  contract: "Bila perlu: Form Permohonan Kontrak ke CA.",
  won: "Sales Order ke FA & TO ≤ 1 hari kerja setelah deal.",
  paid: "Finance mengonfirmasi pelunasan.",
  work_order: "Work order instalasi ≤ 1 hari kerja setelah lunas.",
  installed: "Instalasi 1 hari + BAST.",
  feedback: "Follow-up kepuasan H+7 setelah BAST.",
};

export const STAGE_STYLE: Record<LeadStage, string> = {
  lead: "bg-slate-100 text-slate-700",
  contacted: "bg-slate-100 text-slate-700",
  site_visit: "bg-sky-100 text-sky-800",
  stock_checked: "bg-sky-100 text-sky-800",
  quotation: "bg-amber-100 text-amber-800",
  quotation_approved: "bg-amber-100 text-amber-800",
  negotiation: "bg-amber-100 text-amber-800",
  contract: "bg-amber-100 text-amber-800",
  won: "bg-brand-100 text-brand-800",
  paid: "bg-brand-700 text-white",
  work_order: "bg-violet-100 text-violet-800",
  installed: "bg-violet-100 text-violet-800",
  feedback: "bg-logo-lime/30 text-slate-900",
  lost: "bg-red-100 text-red-700",
};

export function stageRank(s: LeadStage): number {
  return (LEAD_STAGES as readonly string[]).indexOf(s);
}

export const WON_RANK = stageRank("won");

// Tahap yang dihitung sebagai kebutuhan stok (quotation sampai lunas, belum work order).
export const DEMAND_STAGES: LeadStage[] = ["quotation", "quotation_approved", "negotiation", "contract", "won", "paid"];

export const LEAD_SOURCES = {
  dm: "Digital marketing (DM)",
  referral: "Referral",
  event: "Event",
  visit: "Kunjungan",
  other: "Lainnya",
} as const;

export type LeadSource = keyof typeof LEAD_SOURCES;

export type Lead = {
  id: string;
  number: string;
  lead_date: string;
  source: LeadSource;
  referral_code: string | null;
  referral_id: string | null;
  customer: string;
  contact: string | null;
  location: string | null;
  product_code: string | null;
  units: number;
  value: number;
  sales_id: string;
  notes: string | null;
  stage: LeadStage;
  stage_since: string;
  lost_reason: string | null;
  so_number: string | null;
  closed_on: string | null;
  paid_on: string | null;
  installed_on: string | null;
  created_by: string | null;
  created_at: string;
  sales: { full_name: string } | null;
  referral: { full_name: string } | null;
};

export const LEAD_COLUMNS =
  "id, number, lead_date, source, referral_code, referral_id, customer, contact, location, product_code, units, value, sales_id, notes, stage, stage_since, lost_reason, so_number, closed_on, paid_on, installed_on, created_by, created_at, sales:employees!sales_leads_sales_id_fkey(full_name), referral:employees!sales_leads_referral_id_fkey(full_name)";

export function toLead(row: Record<string, unknown>): Lead {
  return { ...(row as unknown as Lead), value: Number(row.value), units: Number(row.units) };
}

export type LeadInput = {
  lead_date: string;
  source: LeadSource;
  referral_code: string;
  customer: string;
  contact: string;
  location: string;
  product_code: string;
  units: number;
  value: number;
  sales_id: string;
  notes: string;
};

export function isSalesManager(me: Me): boolean {
  return (me.app_role === "head" && me.dept_code === "BDS") || me.app_role === "ceo" || me.app_role === "admin";
}

// Boleh mengubah data lead (RLS update_sales_leads).
export function canEditLead(me: Me, lead: Pick<Lead, "sales_id" | "created_by">): boolean {
  return lead.sales_id === me.id || lead.created_by === me.id || isSalesManager(me);
}

// Pengklaim komisi sebuah penjualan: pemilik kode referral, atau PIC sales bila tanpa referral.
export function commissionOwner(lead: Pick<Lead, "referral_id" | "sales_id">): string {
  return lead.referral_id ?? lead.sales_id;
}

export type LeadEvent = {
  id: number;
  action: "create" | "stage" | "note" | "complaint";
  from_stage: LeadStage | null;
  to_stage: LeadStage | null;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
};

export type LeadClaim = { lead_id: string; request_id: string; number: string; status: string; requester_name: string };

// ---------- Stok ----------

export type StockItem = {
  id: string;
  code: string;
  name: string;
  product_code: string | null;
  unit: string;
  min_qty: number;
  notes: string | null;
  is_active: boolean;
};

export const STOCK_MOVE_LABEL = { in: "Masuk", out: "Keluar", adjust: "Penyesuaian (opname)" } as const;
export type StockMoveKind = keyof typeof STOCK_MOVE_LABEL;

export function canManageStock(me: Me): boolean {
  return me.dept_code === "TO" || me.dept_code === "FA" || me.app_role === "admin";
}

// ---------- Aset ----------

export const ASSET_CATEGORIES = {
  ebii: "EBII",
  smart_energy: "Smart Energy",
  aerator: "Aerator",
  solar: "Panel surya",
  tools: "Perkakas",
  other: "Lainnya",
} as const;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;

export const ASSET_STATUS_LABEL = {
  received: "Diterima (belum terdaftar)",
  registered: "Terdaftar",
  placed: "Ditempatkan",
  damaged: "Rusak",
  lost: "Hilang",
  disposal_proposed: "Diusulkan dihapus",
  disposed: "Dihapus",
} as const;
export type AssetStatus = keyof typeof ASSET_STATUS_LABEL;

export const ASSET_STATUS_STYLE: Record<AssetStatus, string> = {
  received: "bg-amber-100 text-amber-800",
  registered: "bg-brand-100 text-brand-800",
  placed: "bg-brand-700 text-white",
  damaged: "bg-orange-100 text-orange-800",
  lost: "bg-red-100 text-red-700",
  disposal_proposed: "bg-violet-100 text-violet-800",
  disposed: "bg-slate-200 text-slate-600",
};

export type Asset = {
  id: string;
  code: string | null;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  status_since: string;
  received_on: string;
  location: string | null;
  holder: string | null;
  value: number | null;
  useful_life_months: number | null;
  reference: string | null;
  lead_id: string | null;
  notes: string | null;
  registered_on: string | null;
  disposal_ceo_at: string | null;
  disposal_fa_at: string | null;
  created_at: string;
};

export const ASSET_COLUMNS =
  "id, code, name, category, status, status_since, received_on, location, holder, value, useful_life_months, reference, lead_id, notes, registered_on, disposal_ceo_at, disposal_fa_at, created_at";

export function toAsset(row: Record<string, unknown>): Asset {
  return { ...(row as unknown as Asset), value: row.value === null ? null : Number(row.value) };
}

export function canManageAssets(me: Me): boolean {
  return canManageStock(me);
}

// Nilai buku garis lurus: nilai × (1 − bulan berjalan / umur manfaat), tidak kurang dari 0.
export function bookValue(a: Pick<Asset, "value" | "useful_life_months" | "received_on">, today: string): number | null {
  if (a.value === null || !a.useful_life_months) return null;
  const [y1, m1] = a.received_on.split("-").map(Number);
  const [y2, m2] = today.split("-").map(Number);
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  return Math.max(0, Math.round(a.value * (1 - months / a.useful_life_months)));
}

export type AssetEvent = {
  id: number;
  action: "create" | "status" | "maintenance" | "opname" | "note";
  from_status: AssetStatus | null;
  to_status: AssetStatus | null;
  note: string | null;
  done_on: string | null;
  created_at: string;
  actor: { full_name: string } | null;
};

// Lama di tahap/status yang sama, dalam hari.
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}
