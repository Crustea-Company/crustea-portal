// Mesin pengajuan bersama (reimburse, permintaan pembayaran, pengadaan, dinas, komisi).
// Lihat migrations/007_pengajuan_reimburse.sql dan docs/fase-2-3/01-mesin-pengajuan.md.

export type RequestKind = "reimburse" | "payment" | "procurement" | "travel" | "commission";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
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
  approved: "Diterima",
  paid: "Ditransfer",
  needs_revision: "Perlu perbaikan",
  rejected: "Ditolak",
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  in_review: "bg-violet-100 text-violet-800",
  approved: "bg-brand-100 text-brand-800",
  paid: "bg-brand-700 text-white",
  needs_revision: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Urutan tab di halaman Review F&A.
export const REVIEW_TABS: RequestStatus[] = ["submitted", "in_review", "approved", "needs_revision", "paid", "rejected"];

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

// Sama dengan is_request_reviewer() di database: departemen FA (termasuk head FA) dan admin.
export function canReviewRequests(me: { dept_code: string | null; app_role: string }): boolean {
  return me.dept_code === "FA" || me.app_role === "admin";
}

// Boleh membuka halaman Review (CEO hanya melihat).
export function canSeeAllRequests(me: { dept_code: string | null; app_role: string }): boolean {
  return canReviewRequests(me) || me.app_role === "ceo";
}
