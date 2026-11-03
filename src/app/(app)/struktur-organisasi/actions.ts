"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCENT_RE, structureKey, type OrgPerson, type OrgPillar, type OrgStructureInput, type OrgUnit } from "@/lib/org";

// Simpan seluruh struktur sekaligus lewat RPC save_org_structure (admin/CEO; tercatat di audit_log).
// base = sidik struktur saat halaman dibuka (structureKey).
export async function saveOrgStructure(input: OrgStructureInput, base: string): Promise<{ ok: boolean; message: string }> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin" && me?.app_role !== "ceo") {
    return { ok: false, message: "Hanya admin dan CEO yang boleh mengubah struktur organisasi." };
  }
  const badUnit = input.units.find(
    (u) => !u.display_name.trim() || !ACCENT_RE.test(u.accent) || Object.values(u.colors ?? {}).some((c) => !ACCENT_RE.test(String(c))),
  );
  if (badUnit) return { ok: false, message: `Kartu ${badUnit.dept_code}: nama tampilan dan warna wajib diisi.` };
  if (new Set(input.people.map((p) => p.employee_id)).size !== input.people.length) {
    return { ok: false, message: "Satu orang hanya boleh muncul sekali di daftar orang khusus." };
  }

  const supabase = await createClient();
  const [pillarRes, unitRes, peopleRes] = await Promise.all([
    supabase.from("org_pillars").select("id, name, sort_order"),
    supabase.from("org_units").select("dept_code, pillar_id, sort_order, display_name, accent, focus, colors"),
    supabase.from("org_people").select("employee_id, lead_dept, display_title"),
  ]);
  const loadError = pillarRes.error ?? unitRes.error ?? peopleRes.error;
  if (loadError) return { ok: false, message: `Gagal memeriksa struktur: ${loadError.message}` };
  if (structureKey((pillarRes.data ?? []) as OrgPillar[], (unitRes.data ?? []) as OrgUnit[], (peopleRes.data ?? []) as OrgPerson[]) !== base) {
    return {
      ok: false,
      message: "Struktur sudah diubah di tempat lain sejak halaman ini dibuka. Muat ulang halaman (tekan F5), lalu ulangi perubahan Anda.",
    };
  }

  const { error } = await supabase.rpc("save_org_structure", { p: input });
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/struktur-organisasi");
  return { ok: true, message: "Struktur organisasi tersimpan." };
}
