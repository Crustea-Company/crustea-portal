import type { Employee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EmployeeOption = { id: string; full_name: string; dept_code: string | null; is_active: boolean };

// Karyawan yang log kerjanya boleh diunduh oleh pengguna ini:
// admin = semua karyawan, head = karyawan departemennya, lainnya = diri sendiri.
export async function exportableEmployees(me: Employee): Promise<EmployeeOption[]> {
  const self: EmployeeOption = {
    id: me.id,
    full_name: me.full_name,
    dept_code: me.dept_code,
    is_active: true,
  };
  if (me.app_role !== "admin" && me.app_role !== "head") return [self];

  const supabase = await createClient();
  let query = supabase.from("employees").select("id, full_name, dept_code, is_active").order("full_name");
  if (me.app_role === "head") query = query.eq("dept_code", me.dept_code ?? "");
  const { data } = await query;
  const list = (data ?? []) as EmployeeOption[];
  return list.some((e) => e.id === me.id) ? list : [self, ...list];
}
