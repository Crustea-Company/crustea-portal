"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message: string };

const PERIOD_RE = /^\d{4}-\d{2}-01$/;

// Menutup periode (pertama kali) atau mengunci ulang periode yang pernah dibuka.
// Snapshot yang sudah ada tidak dihitung ulang (diatur oleh fungsi close_period di database).
export async function closePeriod(periodMonth: string, reason: string): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh melakukan ini." };
  if (!PERIOD_RE.test(periodMonth)) return { ok: false, message: "Periode tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_period", {
    p_month: periodMonth,
    p_reason: reason.trim() || null,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  revalidatePath("/log-kerja");
  return { ok: true, message: `Periode ditutup. Snapshot baru dibuat: ${data ?? 0}.` };
}

export async function reopenPeriod(periodMonth: string, reason: string): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh melakukan ini." };
  if (!PERIOD_RE.test(periodMonth)) return { ok: false, message: "Periode tidak valid." };
  if (!reason.trim()) return { ok: false, message: "Alasan wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_period", { p_month: periodMonth, p_reason: reason.trim() });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  revalidatePath("/log-kerja");
  return { ok: true, message: "Periode dibuka kembali. Snapshot lama tetap tersimpan." };
}
