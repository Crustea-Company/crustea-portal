"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";

export type FormState = { ok: boolean; message: string } | null;

type LogValues = { log_date: string; activity: string; minutes: number; proof: string | null };

// Membaca dan memeriksa isian form (dipakai untuk catat baru dan ubah).
function parseLogForm(formData: FormData): { error: string } | { values: LogValues } {
  const logDate = String(formData.get("log_date") ?? "");
  const activity = String(formData.get("activity") ?? "").trim();
  const proof = String(formData.get("proof") ?? "").trim();
  const hours = Number(formData.get("hours") || 0);
  const mins = Number(formData.get("minutes") || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return { error: "Tanggal belum diisi." };
  if (logDate > todayJakarta()) return { error: "Tanggal tidak boleh di masa depan." };
  if (!activity) return { error: "Aktivitas belum diisi." };
  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    return { error: "Jam harus bilangan bulat 0-24." };
  }
  if (!Number.isInteger(mins) || mins < 0 || mins > 59) {
    return { error: "Menit harus bilangan bulat 0-59." };
  }
  const minutes = hours * 60 + mins;
  if (minutes <= 0) return { error: "Durasi harus lebih dari 0." };
  if (minutes > 24 * 60) return { error: "Durasi satu catatan tidak boleh lebih dari 24 jam." };

  return { values: { log_date: logDate, activity, minutes, proof: proof || null } };
}

export async function addWorkLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const parsed = parseLogForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  const supabase = await createClient();
  // period_month dan is_correction diisi otomatis oleh trigger di database.
  const { data, error } = await supabase
    .from("work_logs")
    .insert({ employee_id: me.id, ...parsed.values })
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

export async function updateWorkLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const id = String(formData.get("id") ?? "");
  const parsed = parseLogForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  const supabase = await createClient();
  // Database hanya mengizinkan mengubah log milik sendiri di periode yang belum ditutup,
  // dan menolak kalau tanggal baru dipindah ke periode yang sudah ditutup.
  const { data, error } = await supabase
    .from("work_logs")
    .update(parsed.values)
    .eq("id", id)
    .eq("employee_id", me.id)
    .select("id");

  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Tanggal baru masuk ke periode yang sudah ditutup. Catat sebagai log baru (koreksi) bila perlu."
          : `Gagal menyimpan: ${error.message}`,
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "Log ini tidak bisa diubah (periodenya sudah ditutup)." };
  }

  revalidatePath("/log-kerja");
  return { ok: true, message: "Perubahan tersimpan." };
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
