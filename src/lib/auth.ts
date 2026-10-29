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
// Satu permintaan ke database: email dibaca dari token login (diverifikasi di server, tanpa
// bertanya ke Supabase), lalu dicocokkan seperti fungsi me(): email sama (huruf besar/kecil
// diabaikan) dan karyawan aktif. RLS employees tetap hanya mengizinkan karyawan aktif membaca.
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : "";
  if (!email) return null;

  // ilike tanpa wildcard: % _ \ di-escape supaya hanya cocok persis.
  const { data } = await supabase
    .from("employees")
    .select(
      "id, email, full_name, dept_code, job_title, emp_status, app_role, ats_required",
    )
    .ilike("email", email.replace(/[\\%_]/g, (ch) => `\\${ch}`))
    .eq("is_active", true)
    .maybeSingle();

  return (data as Employee | null) ?? null;
});
