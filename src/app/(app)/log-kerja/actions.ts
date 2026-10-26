"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";

export type FormState = { ok: boolean; message: string } | null;

export async function addWorkLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const logDate = String(formData.get("log_date") ?? "");
  const activity = String(formData.get("activity") ?? "").trim();
  const proof = String(formData.get("proof") ?? "").trim();
  const hours = Number(formData.get("hours") || 0);
  const mins = Number(formData.get("minutes") || 0);
  const minutes = Math.round(hours * 60 + mins);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return { ok: false, message: "Tanggal belum diisi." };
  }
  if (logDate > todayJakarta()) {
    return { ok: false, message: "Tanggal tidak boleh di masa depan." };
  }
  if (!activity) return { ok: false, message: "Aktivitas belum diisi." };
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, message: "Durasi harus lebih dari 0." };
  }
  if (minutes > 24 * 60) {
    return { ok: false, message: "Durasi satu catatan tidak boleh lebih dari 24 jam." };
  }

  const supabase = await createClient();
  // period_month dan is_correction diisi otomatis oleh trigger di database.
  const { data, error } = await supabase
    .from("work_logs")
    .insert({
      employee_id: me.id,
      log_date: logDate,
      activity,
      minutes,
      proof: proof || null,
    })
    .select("is_correction")
    .single();

  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/log-kerja");
  return {
    ok: true,
    message: data.is_correction
      ? "Tersimpan sebagai koreksi, karena periodenya sudah ditutup. Nilai ketercapaian yang sudah dikunci tidak berubah."
      : "Log kerja tersimpan.",
  };
}

export async function deleteWorkLog(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  // Database hanya mengizinkan menghapus log milik sendiri di periode yang belum ditutup.
  const { data, error } = await supabase.from("work_logs").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: `Gagal menghapus: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, message: "Log ini tidak bisa dihapus (periodenya sudah ditutup)." };
  }
  revalidatePath("/log-kerja");
  return { ok: true };
}
