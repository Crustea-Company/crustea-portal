"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_ORDER, type TaskStatus } from "@/lib/tasks";

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!STATUS_ORDER.includes(status)) {
    return { ok: false, message: "Status tidak dikenal." };
  }

  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const supabase = await createClient();
  // Hak ubah diperiksa oleh database (RLS). Kalau tidak berhak, tidak ada baris yang berubah.
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("id");

  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, message: "Anda tidak berhak mengubah tugas ini." };
  }

  revalidatePath("/tugas");
  return { ok: true };
}
