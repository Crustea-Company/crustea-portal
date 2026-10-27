"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import {
  BUCKET,
  MAX_FILES,
  PAYMENT_CONTRACT,
  PAYMENT_PRIORITIES,
  REIMBURSE_CATEGORIES,
  type AttachmentInput,
  type PaymentData,
  type PaymentInput,
  type ReimburseData,
  type ReimburseInput,
  type RequestKind,
  type RequestStatus,
} from "@/lib/requests";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateRequests(id?: string) {
  revalidatePath("/pengajuan");
  revalidatePath("/pengajuan/review");
  if (id) revalidatePath(`/pengajuan/${id}`);
}

// Memeriksa lampiran: link harus http(s), file harus di folder Storage milik sendiri.
function checkAttachments(list: AttachmentInput[], employeeId: string): string | null {
  if (list.length > MAX_FILES) return `Maksimal ${MAX_FILES} lampiran.`;
  for (const a of list) {
    if (a.kind === "link" && !/^https?:\/\/\S+$/i.test(a.url.trim())) return `Link tidak valid: ${a.url}`;
    if (a.kind === "file" && !a.id && !a.path.startsWith(`${employeeId}/`)) return "Lampiran tidak valid.";
  }
  return null;
}

// Menyamakan lampiran di database dengan daftar dari form: hapus yang dibuang, tambah yang baru.
async function syncAttachments(
  supabase: Supabase,
  requestId: string,
  purpose: "proof" | "transfer",
  list: AttachmentInput[],
): Promise<string | null> {
  const { data: existing, error: readErr } = await supabase
    .from("request_files")
    .select("id, kind, path")
    .eq("request_id", requestId)
    .eq("purpose", purpose);
  if (readErr) return readErr.message;

  const keep = new Set(list.map((a) => a.id).filter(Boolean));
  const removed = (existing ?? []).filter((f) => !keep.has(f.id));
  if (removed.length) {
    const { error } = await supabase.from("request_files").delete().in("id", removed.map((f) => f.id));
    if (error) return error.message;
    const paths = removed.filter((f) => f.kind === "file" && f.path).map((f) => f.path as string);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  const added = list.filter((a) => !a.id);
  if (added.length) {
    const { error } = await supabase.from("request_files").insert(
      added.map((a) =>
        a.kind === "file"
          ? { request_id: requestId, purpose, kind: "file", path: a.path, name: a.name, size_bytes: a.size_bytes }
          : { request_id: requestId, purpose, kind: "link", url: a.url.trim(), name: a.name.trim() || a.url.trim() },
      ),
    );
    if (error) return error.message;
  }
  return null;
}

function parseReimburse(input: ReimburseInput): { error: string } | { title: string; amount: number; data: ReimburseData } {
  const description = input.description.trim();
  const categories = input.categories.filter((c) => (REIMBURSE_CATEGORIES as readonly string[]).includes(c));
  const other = input.category_other.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transaction_date)) return { error: "Tanggal transaksi belum diisi." };
  if (input.transaction_date > todayJakarta()) return { error: "Tanggal transaksi tidak boleh di masa depan." };
  if (!description) return { error: "Uraian transaksi belum diisi." };
  if (categories.length === 0 && !other) return { error: "Pilih minimal satu kategori transaksi." };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { error: "Jumlah (Rp) harus lebih dari 0." };

  let mission = input.mission;
  const reason = input.no_mission_reason.trim();
  if (mission) {
    mission = {
      activity: mission.activity.trim(),
      description: mission.description.trim(),
      result: mission.result.trim(),
      evaluation: mission.evaluation.trim(),
    };
    if (!mission.activity || !mission.description || !mission.result || !mission.evaluation) {
      return { error: "Lengkapi keempat kolom mission report, atau centang \"Tidak ada mission report\" dan beri alasannya." };
    }
  } else if (!reason) {
    return { error: "Tuliskan alasan tidak ada mission report." };
  }

  return {
    title: description,
    amount: input.amount,
    data: {
      transaction_date: input.transaction_date,
      categories,
      category_other: other,
      mission,
      no_mission_reason: mission ? "" : reason,
    },
  };
}

// Simpan lalu kirim pengajuan. id = null untuk pengajuan baru;
// id terisi untuk mengubah draf / pengajuan "Perlu perbaikan" lalu mengirimnya ulang.
async function saveAndSubmit(
  kind: RequestKind,
  row: { title: string; amount: number; data: object },
  attachments: AttachmentInput[],
  id: string | null,
  missingFiles: string,
): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  if (attachments.length === 0) return { ok: false, message: missingFiles };
  const badFile = checkAttachments(attachments, me.id);
  if (badFile) return { ok: false, message: badFile };

  const supabase = await createClient();
  let requestId = id;

  if (requestId) {
    // Database hanya mengizinkan mengubah milik sendiri saat Draf / Perlu perbaikan.
    const { data, error } = await supabase.from("requests").update(row).eq("id", requestId).select("id");
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    if (!data?.length) return { ok: false, message: "Pengajuan ini tidak bisa diubah lagi." };
  } else {
    const { data, error } = await supabase
      .from("requests")
      .insert({ kind, requester_id: me.id, ...row })
      .select("id")
      .single();
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    requestId = data.id as string;
  }

  const fileErr = await syncAttachments(supabase, requestId, "proof", attachments);
  if (fileErr) {
    // Pengajuan baru yang gagal dibatalkan supaya tidak ada draf setengah jadi.
    // (File di Storage dibiarkan; form memakainya lagi saat dikirim ulang.)
    if (!id) await supabase.from("requests").delete().eq("id", requestId);
    return { ok: false, message: `Gagal menyimpan lampiran: ${fileErr}` };
  }

  const { error: submitErr } = await supabase.rpc("change_request_status", { p_id: requestId, p_to: "submitted" });
  if (submitErr) {
    if (!id) await supabase.from("requests").delete().eq("id", requestId);
    return { ok: false, message: `Gagal mengirim: ${submitErr.message}` };
  }

  revalidateRequests(requestId);
  return { ok: true, id: requestId };
}

export async function submitReimburse(
  input: ReimburseInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const parsed = parseReimburse(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  return saveAndSubmit("reimburse", parsed, attachments, id, "Lampirkan bukti nota (file atau link).");
}

function parsePayment(input: PaymentInput): { error: string } | { title: string; amount: number; data: PaymentData } {
  const vendor = input.vendor.trim();
  const account = input.account.trim();
  const purpose = input.purpose.trim();
  const method = input.method.trim();
  const contract = input.contract.filter((c) => c in PAYMENT_CONTRACT);

  if (!(input.priority in PAYMENT_PRIORITIES)) return { error: "Pilih prioritas pembayaran." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payment_date)) return { error: "Tanggal pembayaran belum diisi." };
  if (!method) return { error: "Pilih metode pembayaran." };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { error: "Jumlah (Rp) harus lebih dari 0." };
  if (!vendor) return { error: "Vendor / nama penerima belum diisi." };
  if (!account) return { error: "Nomor rekening / VA / QRIS belum diisi." };
  if (!purpose) return { error: "Tujuan pembayaran belum diisi." };
  if (contract.length === 0) return { error: "Centang minimal satu pilihan \"Terkait kontrak\"." };

  const firstLine = purpose.split("\n")[0];
  return {
    title: `${vendor}: ${firstLine}`.slice(0, 200),
    amount: input.amount,
    data: { priority: input.priority, payment_date: input.payment_date, method, vendor, account, purpose, contract },
  };
}

export async function submitPayment(
  input: PaymentInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const parsed = parsePayment(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  return saveAndSubmit("payment", parsed, attachments, id, "Lampirkan link invoice atau dokumen pendukung.");
}

// Ubah status oleh peninjau (atau kirim ulang oleh pemohon). Aturan urutan & peran ada di database.
export async function changeRequestStatus(
  id: string,
  to: RequestStatus,
  note: string,
  paidOn: string | null,
  transferFiles: AttachmentInput[] = [],
): Promise<SimpleResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const supabase = await createClient();
  if (to === "paid") {
    if (!paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, message: "Tanggal transfer wajib diisi." };
    if (transferFiles.length) {
      const bad = checkAttachments(transferFiles, me.id);
      if (bad) return { ok: false, message: bad };
      const err = await syncAttachments(supabase, id, "transfer", transferFiles);
      if (err) return { ok: false, message: `Gagal menyimpan bukti transfer: ${err}` };
    }
  }

  const { error } = await supabase.rpc("change_request_status", {
    p_id: id,
    p_to: to,
    p_note: note.trim() || null,
    p_paid_on: to === "paid" ? paidOn : null,
  });
  if (error) return { ok: false, message: error.message };

  revalidateRequests(id);
  return { ok: true };
}

export async function addRequestNote(id: string, note: string): Promise<SimpleResult> {
  if (!note.trim()) return { ok: false, message: "Catatan belum diisi." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_request_note", { p_id: id, p_note: note.trim() });
  if (error) return { ok: false, message: error.message };
  revalidateRequests(id);
  return { ok: true };
}

// Hapus draf yang belum pernah dikirim (beserta lampirannya di Storage).
export async function deleteDraft(id: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data: files } = await supabase.from("request_files").select("kind, path").eq("request_id", id);
  const { data, error } = await supabase.from("requests").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Hanya draf yang belum dikirim yang bisa dihapus." };
  const paths = (files ?? []).filter((f) => f.kind === "file" && f.path).map((f) => f.path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  revalidateRequests();
  return { ok: true };
}
