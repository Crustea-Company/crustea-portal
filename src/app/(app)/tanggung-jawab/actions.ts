"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };

// Ganti seluruh jobdesc satu karyawan (admin & CEO; dicek aturan database).
export async function saveJobdesc(employeeId: string, items: { item: string; keywords: string }[]): Promise<Result> {
  const rows = items
    .filter((i) => i.item.trim())
    .map((i, k) => ({ employee_id: employeeId, item: i.item.trim(), keywords: i.keywords.trim() || null, sort: k + 1 }));
  const supabase = await createClient();
  const { error: delErr, count } = await supabase.from("employee_jobdesc").delete({ count: "exact" }).eq("employee_id", employeeId);
  if (delErr) return { ok: false, message: delErr.message };
  if (rows.length) {
    const { error } = await supabase.from("employee_jobdesc").insert(rows);
    if (error) return { ok: false, message: error.message.includes("row-level") ? "Hanya admin dan CEO yang bisa mengubah jobdesc." : error.message };
  } else if (!count) {
    return { ok: true };
  }
  revalidatePath("/tanggung-jawab");
  return { ok: true };
}
