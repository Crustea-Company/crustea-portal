import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Employee = {
  id: string;
  email: string;
  full_name: string;
  dept_code: string | null;
  job_title: string | null;
  emp_status: "PKWTT" | "PKWT" | "INTERN";
  app_role: "admin" | "ceo" | "head" | "staff";
  ats_required: boolean;
};

// Mengembalikan data karyawan yang sedang login, atau null kalau
// emailnya tidak terdaftar di tabel employees / tidak aktif.
// Dibungkus cache() supaya hanya diambil sekali per permintaan halaman.
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const supabase = await createClient();

  // Fungsi me() di database mencocokkan email login dengan karyawan aktif.
  const { data: id, error } = await supabase.rpc("me");
  if (error || !id) return null;

  const { data } = await supabase
    .from("employees")
    .select(
      "id, email, full_name, dept_code, job_title, emp_status, app_role, ats_required",
    )
    .eq("id", id)
    .single();

  return (data as Employee | null) ?? null;
});
