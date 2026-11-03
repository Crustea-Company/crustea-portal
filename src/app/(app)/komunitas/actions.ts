"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, TARGET_LABEL, type FeedbackCategory, type FeedbackStatus, type FeedbackTarget } from "@/lib/feedback";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

export type FeedbackInput = {
  target_kind: FeedbackTarget;
  target_employee: string;
  target_dept: string;
  category: FeedbackCategory;
  subject: string;
  body: string;
  anonymous: boolean;
};

function revalidateFeedback(id?: string) {
  revalidatePath("/komunitas", "layout");
  if (id) revalidatePath(`/komunitas/masukan/${id}`);
}

export async function submitFeedback(input: FeedbackInput): Promise<Result> {
  if (!(input.target_kind in TARGET_LABEL)) return { ok: false, message: "Pilih masukan ini tentang siapa." };
  if (!(input.category in CATEGORY_LABEL)) return { ok: false, message: "Pilih kategori." };
  if (input.target_kind === "person" && !input.target_employee) return { ok: false, message: "Pilih karyawan yang dituju." };
  if (input.target_kind === "dept" && !input.target_dept) return { ok: false, message: "Pilih departemen yang dituju." };
  if (!input.subject.trim()) return { ok: false, message: "Judul singkat belum diisi." };
  if (!input.body.trim()) return { ok: false, message: "Isi masukan belum diisi." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_feedback", {
    p_target_kind: input.target_kind,
    p_target_employee: input.target_kind === "person" ? input.target_employee : null,
    p_target_dept: input.target_kind === "dept" ? input.target_dept : null,
    p_category: input.category,
    p_subject: input.subject.trim(),
    p_body: input.body.trim(),
    p_anonymous: input.anonymous,
  });
  if (error) return { ok: false, message: error.message };
  revalidateFeedback(data as string);
  return { ok: true, id: data as string };
}

export async function changeFeedbackStatus(
  id: string,
  to: FeedbackStatus,
  note: string,
  publicNote: string,
  title: string,
  summary: string,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_feedback_status", {
    p_id: id,
    p_to: to,
    p_note: note.trim() || null,
    p_public_note: publicNote.trim() || null,
    p_title: title.trim() || null,
    p_summary: summary.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateFeedback(id);
  return { ok: true };
}

export async function updateCommunityPost(id: string, title: string, summary: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_community_post", { p_id: id, p_title: title.trim(), p_summary: summary.trim() });
  if (error) return { ok: false, message: error.message };
  revalidateFeedback(id);
  return { ok: true };
}

export async function addFeedbackNote(id: string, note: string, internal: boolean): Promise<SimpleResult> {
  if (!note.trim()) return { ok: false, message: "Catatan kosong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_feedback_note", { p_id: id, p_note: note.trim(), p_internal: internal });
  if (error) return { ok: false, message: error.message };
  revalidateFeedback(id);
  return { ok: true };
}

export async function addComment(id: string, body: string): Promise<SimpleResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: "Komentar kosong." };
  if (text.length > 2000) return { ok: false, message: "Komentar maksimal 2.000 karakter." };
  const supabase = await createClient();
  const { error } = await supabase.from("community_comments").insert({ feedback_id: id, body: text });
  if (error) return { ok: false, message: `Gagal mengirim komentar: ${error.message}` };
  revalidatePath(`/komunitas/${id}`);
  return { ok: true };
}

export async function deleteComment(postId: string, commentId: number): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("community_comments").delete().eq("id", commentId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Anda tidak boleh menghapus komentar ini." };
  revalidatePath(`/komunitas/${postId}`);
  return { ok: true };
}
