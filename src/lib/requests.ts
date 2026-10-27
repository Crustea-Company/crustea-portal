// Mesin pengajuan bersama (reimburse, permintaan pembayaran, pengadaan, dinas, komisi).
// Lihat migrations/007_pengajuan_reimburse.sql dan docs/fase-2-3/01-mesin-pengajuan.md.

export type RequestKind = "reimburse" | "payment" | "procurement" | "travel" | "commission";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "ceo_review"
  | "approved"
  | "paid"
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
  approved: "Diterima",
  paid: "Ditransfer",
  needs_revision: "Perlu perbaikan",
  rejected: "Ditolak",
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  in_review: "bg-violet-100 text-violet-800",
  ceo_review: "bg-sky-100 text-sky-800",
  approved: "bg-brand-100 text-brand-800",
  paid: "bg-brand-700 text-white",
  needs_revision: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Urutan tab di halaman Review F&A.
export const REVIEW_TABS: RequestStatus[] = ["submitted", "in_review", "ceo_review", "approved", "needs_revision", "paid", "rejected"];

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
  created_at: string;
  data: Record<string, unknown>;
  requester?: { full_name: string } | null;
};

// Kolom yang diambil untuk daftar & detail. sla_due dihitung database (2 hari kerja).
export const REQUEST_COLUMNS =
  "id, kind, number, requester_id, dept_code, title, amount, status, status_since, sla_due, submitted_at, paid_on, created_at, data, requester:employees!requests_requester_id_fkey(full_name)";

export function isOverdue(r: { sla_due: string | null }): boolean {
  return r.sla_due !== null && Date.parse(r.sla_due) < Date.now();
}

export type RequestFile = {
  id: string;
  kind: "file" | "link";
  purpose: "proof" | "transfer";
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
