import type { Employee } from "@/lib/auth";

// Masukan & Komunitas (migrasi 021). Aturan status sama dengan change_feedback_status di database.

export type FeedbackStatus = "new" | "reviewed" | "followed_up" | "in_progress" | "done" | "rejected" | "not_followed";
export type FeedbackCategory = "saran" | "keluhan" | "apresiasi" | "lainnya";
export type FeedbackTarget = "person" | "dept" | "company";

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Baru",
  reviewed: "Ditinjau",
  followed_up: "Ditindaklanjuti",
  in_progress: "Sedang diproses",
  done: "Selesai",
  rejected: "Ditolak",
  not_followed: "Tidak ditindaklanjuti",
};

export const STATUS_STYLE: Record<FeedbackStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  reviewed: "bg-slate-200 text-slate-800",
  followed_up: "bg-brand-100 text-brand-800",
  in_progress: "bg-brand-100 text-brand-800",
  done: "bg-brand-700 text-white",
  rejected: "bg-red-100 text-red-700",
  not_followed: "bg-slate-100 text-slate-600",
};

// Langkah progres yang tampil di papan komunitas.
export const PUBLIC_STEPS: FeedbackStatus[] = ["followed_up", "in_progress", "done"];

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  saran: "Saran",
  keluhan: "Keluhan",
  apresiasi: "Apresiasi",
  lainnya: "Lainnya",
};

export const TARGET_LABEL: Record<FeedbackTarget, string> = {
  person: "Seorang karyawan",
  dept: "Tim / departemen",
  company: "Perusahaan secara umum",
};

// Status tujuan yang boleh dipilih CA dari status sekarang.
export function nextStatuses(s: FeedbackStatus): FeedbackStatus[] {
  switch (s) {
    case "new":
      return ["reviewed", "followed_up", "rejected", "not_followed"];
    case "reviewed":
      return ["followed_up", "rejected", "not_followed"];
    case "followed_up":
      return ["in_progress", "done"];
    case "in_progress":
      return ["done"];
    case "done":
      return ["in_progress"];
    case "rejected":
    case "not_followed":
      return ["reviewed"];
  }
}

export function isReopen(from: FeedbackStatus, to: FeedbackStatus): boolean {
  return (from === "done" && to === "in_progress") || ((from === "rejected" || from === "not_followed") && to === "reviewed");
}

// Wajib catatan untuk pengirim: menolak / tidak ditindaklanjuti / membuka lagi.
export function needsNote(from: FeedbackStatus, to: FeedbackStatus): boolean {
  return to === "rejected" || to === "not_followed" || isReopen(from, to);
}

export function isFeedbackReviewer(me: Employee): boolean {
  return me.dept_code === "CA" || me.app_role === "admin";
}

export type FeedbackItem = {
  id: string;
  number: string;
  target_kind: FeedbackTarget;
  target_dept: string | null;
  category: FeedbackCategory;
  subject: string;
  body: string;
  is_anonymous: boolean;
  status: FeedbackStatus;
  status_since: string;
  created_at: string;
  sender: { full_name: string } | null;
  target: { full_name: string } | null;
};

export const FEEDBACK_COLUMNS =
  "id, number, target_kind, target_dept, category, subject, body, is_anonymous, status, status_since, created_at, " +
  "sender:employees!feedback_items_sender_id_fkey(full_name), target:employees!feedback_items_target_employee_id_fkey(full_name)";

export function targetText(f: Pick<FeedbackItem, "target_kind" | "target_dept" | "target">): string {
  if (f.target_kind === "person") return f.target?.full_name ?? "-";
  if (f.target_kind === "dept") return `Departemen ${f.target_dept ?? "-"}`;
  return "Perusahaan secara umum";
}

export type CommunityPost = {
  feedback_id: string;
  title: string;
  summary: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  published_at: string;
  updated_at: string;
};
