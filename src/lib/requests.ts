// Mesin pengajuan bersama (reimburse, permintaan pembayaran, pengadaan, dinas, komisi).
// Lihat migrations/007_pengajuan_reimburse.sql dan docs/fase-2-3/01-mesin-pengajuan.md.

export type RequestKind = "reimburse" | "payment" | "procurement" | "travel" | "commission";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "ceo_review"
  | "assigner_approved"
  | "st_issued"
  | "head_approved"
  | "vendor_compared"
  | "fa_verified"
  | "fa_approved"
  | "ceo_approved"
  | "po_issued"
  | "received"
  | "returned"
  | "payment_approved"
  | "approved"
  | "paid"
  | "completed"
  | "needs_revision"
  | "rejected";

export const KIND_LABEL: Record<RequestKind, string> = {
  reimburse: "Reimburse",
  payment: "Permintaan pembayaran",
  procurement: "Pengadaan",
  travel: "Perjalanan dinas",
  commission: "Klaim komisi",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draf",
  submitted: "Belum di-review",
  in_review: "Sedang di-review",
  ceo_review: "Menunggu CEO",
  assigner_approved: "Disetujui penugas",
  st_issued: "Surat tugas terbit",
  head_approved: "Disetujui head",
  vendor_compared: "Vendor dibandingkan",
  fa_verified: "Diverifikasi Finance",
  fa_approved: "Disetujui Head F&A",
  ceo_approved: "Disetujui CEO",
  po_issued: "PO terbit",
  received: "Barang/jasa diterima",
  returned: "Diretur",
  payment_approved: "Pembayaran disetujui",
  approved: "Diterima",
  paid: "Ditransfer",
  completed: "Selesai",
  needs_revision: "Perlu perbaikan",
  rejected: "Ditolak",
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  in_review: "bg-violet-100 text-violet-800",
  ceo_review: "bg-sky-100 text-sky-800",
  assigner_approved: "bg-sky-100 text-sky-800",
  st_issued: "bg-indigo-100 text-indigo-800",
  head_approved: "bg-sky-100 text-sky-800",
  vendor_compared: "bg-amber-100 text-amber-800",
  fa_verified: "bg-violet-100 text-violet-800",
  fa_approved: "bg-brand-100 text-brand-800",
  ceo_approved: "bg-brand-100 text-brand-800",
  po_issued: "bg-indigo-100 text-indigo-800",
  received: "bg-brand-100 text-brand-800",
  returned: "bg-orange-100 text-orange-800",
  payment_approved: "bg-brand-100 text-brand-800",
  approved: "bg-brand-100 text-brand-800",
  paid: "bg-brand-700 text-white",
  completed: "bg-brand-800 text-white",
  needs_revision: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Label per jenis (sama dengan request_status_label(s, k) di database): dinas memakai istilahnya sendiri.
export function statusLabel(status: RequestStatus, kind?: RequestKind): string {
  if (kind === "travel") {
    if (status === "submitted") return "Diajukan";
    if (status === "approved") return "Diverifikasi Finance";
    if (status === "paid") return "Uang muka dicairkan";
  }
  if (kind === "procurement") {
    if (status === "submitted") return "Menunggu head";
    if (status === "paid") return "Dibayar ke vendor";
  }
  return STATUS_LABEL[status];
}

// Urutan tab di halaman Review F&A.
export const REVIEW_TABS: RequestStatus[] = [
  "submitted",
  "in_review",
  "ceo_review",
  "assigner_approved",
  "st_issued",
  "vendor_compared",
  "fa_verified",
  "fa_approved",
  "ceo_approved",
  "payment_approved",
  "head_approved",
  "po_issued",
  "received",
  "returned",
  "approved",
  "needs_revision",
  "paid",
  "completed",
  "rejected",
];

export type RequestRow = {
  id: string;
  kind: RequestKind;
  number: string;
  requester_id: string;
  dept_code: string | null;
  title: string;
  amount: number;
  status: RequestStatus;
  status_since: string;
  sla_due: string | null;
  submitted_at: string | null;
  paid_on: string | null;
  assigner_id: string | null;
  st_number: string | null;
  created_at: string;
  data: Record<string, unknown>;
  requester?: { full_name: string } | null;
};

// Kolom yang diambil untuk daftar & detail. sla_due dihitung database (2 hari kerja).
export const REQUEST_COLUMNS =
  "id, kind, number, requester_id, dept_code, title, amount, status, status_since, sla_due, submitted_at, paid_on, assigner_id, st_number, created_at, data, requester:employees!requests_requester_id_fkey(full_name)";

export function isOverdue(r: { sla_due: string | null }): boolean {
  return r.sla_due !== null && Date.parse(r.sla_due) < Date.now();
}

export type RequestFile = {
  id: string;
  kind: "file" | "link";
  purpose: "proof" | "transfer" | "report" | "document";
  path: string | null;
  url: string | null;
  name: string;
  size_bytes: number | null;
};

// Lampiran yang dikirim dari form (sudah diunggah ke Storage, atau berupa link).
export type AttachmentInput =
  | { kind: "file"; path: string; name: string; size_bytes: number; id?: string }
  | { kind: "link"; url: string; name: string; id?: string };

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const BUCKET = "request-files";

// ---------- Reimburse ----------

export const REIMBURSE_CATEGORIES = [
  "Biaya Administrasi Bank",
  "Biaya Bahan Baku",
  "Biaya Vendor & Subkon",
  "Biaya Human Resource",
  "Biaya Konsumsi",
  "Biaya Transportasi",
  "Biaya Iklan & Promosi",
  "Biaya Fasilitas Kantor",
  "Biaya Informasi & Software",
  "Biaya Pengembangan",
] as const;

export type MissionReport = { activity: string; description: string; result: string; evaluation: string };

export type ReimburseData = {
  transaction_date: string;
  categories: string[]; // dari REIMBURSE_CATEGORIES
  category_other: string; // "Lainnya" diisi sendiri, kosong kalau tidak ada
  mission: MissionReport | null;
  no_mission_reason: string; // wajib kalau mission = null
};

export type ReimburseInput = ReimburseData & { description: string; amount: number };

// ---------- Permintaan pembayaran ----------

export const PAYMENT_PRIORITIES = {
  urgent: "Segera (urgent / jatuh tempo hari ini)",
  normal: "Normal (sesuai jadwal pembayaran)",
  scheduled: "Tunda / terjadwal",
} as const;
export type PaymentPriority = keyof typeof PAYMENT_PRIORITIES;

export const PAYMENT_METHODS = ["QRIS", "Virtual Account", "Bank Transfer"] as const;

export const PAYMENT_CONTRACT = {
  contract: "Sesuai kontrak yang sudah ada dengan vendor",
  one_time: "Pembayaran sekali",
} as const;
export type PaymentContract = keyof typeof PAYMENT_CONTRACT;

// Permintaan pembayaran >= nilai ini perlu persetujuan CEO setelah diterima F&A (migrasi 008).
export const CEO_APPROVAL_MIN = 5_000_000;

export type PaymentData = {
  priority: PaymentPriority;
  payment_date: string;
  method: string; // dari PAYMENT_METHODS, atau isian "Lainnya"
  vendor: string; // nama penerima + wilayah
  account: string; // nomor rekening / VA / QRIS
  purpose: string;
  contract: PaymentContract[];
};

export type PaymentInput = PaymentData & { amount: number };

export function isUrgent(r: { kind: RequestKind; data: Record<string, unknown> }): boolean {
  return r.kind === "payment" && r.data.priority === "urgent";
}

// ---------- Pengadaan barang & jasa (migrasi 010) ----------

export type VendorQuote = {
  name: string;
  avl: boolean; // ada di Approved Vendor List
  price: number; // harga total (Rp)
  spec: string;
  lead_time: string;
  warranty: string;
  pros: string;
  cons: string;
};

export const MIN_VENDORS = 3;

export const PROCUREMENT_METHODS = ["Pembelian langsung", "Penunjukan langsung", "Pemilihan vendor (perbandingan harga)", "Kontrak"];

export type ProcurementInput = {
  title: string; // judul kebutuhan
  specification: string;
  quantity: number;
  unit: string;
  estimate: number; // estimasi harga total (Rp)
  budgeted: boolean; // sudah dianggarkan?
  needed_date: string;
};

export type ProcurementData = Omit<ProcurementInput, "title"> & {
  // Diisi oleh alur (change_request_status):
  vendors?: VendorQuote[]; // TechOps
  recommended?: number; // indeks vendor rekomendasi TechOps
  selected?: number; // indeks vendor pilihan Head F&A
  method?: string; // metode pengadaan pilihan Head F&A
  po_number?: string; // PO-2026-001
};

// Sama dengan is_techops() di database.
export function isTechOps(me: { dept_code: string | null; app_role: string }): boolean {
  return me.dept_code === "TO" || me.app_role === "admin";
}

// Sama dengan is_fa_head() di database.
export function isFaHead(me: { dept_code: string | null; app_role: string }): boolean {
  return (me.dept_code === "FA" && me.app_role === "head") || me.app_role === "admin";
}

// Penyetuju PR (langkah 2): head departemen pemohon; CEO dan admin sebagai cadangan.
export function isProcurementHead(me: { dept_code: string | null; app_role: string }, dept: string | null): boolean {
  return (me.app_role === "head" && me.dept_code === dept) || me.app_role === "ceo" || me.app_role === "admin";
}

// Sama dengan is_request_reviewer() di database: departemen FA (termasuk head FA) dan admin.
export function canReviewRequests(me: { dept_code: string | null; app_role: string }): boolean {
  return me.dept_code === "FA" || me.app_role === "admin";
}

// Boleh memutuskan pengajuan berstatus "Menunggu CEO" (sama dengan change_request_status).
export function canApproveAsCeo(me: { app_role: string }): boolean {
  return me.app_role === "ceo" || me.app_role === "admin";
}

// Boleh membuka halaman Review (CEO hanya melihat).
export function canSeeAllRequests(me: { dept_code: string | null; app_role: string }): boolean {
  return canReviewRequests(me) || me.app_role === "ceo";
}
