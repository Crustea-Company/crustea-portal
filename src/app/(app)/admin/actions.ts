"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_PARAM_KEYS, defaultGrade, type TravelParams, type TravelRate } from "@/lib/travel";

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

// ---------- Kelola karyawan ----------
// Tabel employees hanya boleh diubah admin (aturan database admin_employees).

export type EmployeeInput = {
  email: string;
  full_name: string;
  dept_code: string;
  job_title: string;
  emp_status: "PKWTT" | "PKWT" | "INTERN";
  app_role: "admin" | "ceo" | "head" | "staff";
  ats_required: boolean;
  grade: string; // golongan jabatan (tarif dinas)
};

const EMP_STATUSES = ["PKWTT", "PKWT", "INTERN"];
const APP_ROLES = ["admin", "ceo", "head", "staff"];

export async function saveEmployee(input: EmployeeInput, id: string | null): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh melakukan ini." };

  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Format email tidak valid." };
  if (!fullName) return { ok: false, message: "Nama lengkap wajib diisi." };
  if (!input.dept_code) return { ok: false, message: "Departemen wajib dipilih." };
  if (!EMP_STATUSES.includes(input.emp_status)) return { ok: false, message: "Status kerja tidak dikenal." };
  if (!APP_ROLES.includes(input.app_role)) return { ok: false, message: "Peran tidak dikenal." };
  // Mencegah admin mengunci dirinya sendiri dari halaman Admin.
  if (id === me.id && input.app_role !== "admin") {
    return { ok: false, message: "Anda tidak bisa mencabut peran admin dari akun Anda sendiri." };
  }

  const row = {
    email,
    full_name: fullName,
    dept_code: input.dept_code,
    job_title: input.job_title.trim() || null,
    emp_status: input.emp_status,
    app_role: input.app_role,
    ats_required: input.ats_required,
    grade: input.grade || defaultGrade(input.app_role, input.emp_status),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("employees").update(row).eq("id", id).select("id")
    : await supabase.from("employees").insert({ ...row, is_active: true }).select("id");
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "Email ini sudah terdaftar untuk karyawan lain." : `Gagal menyimpan: ${error.message}`,
    };
  }
  if (!data?.length) return { ok: false, message: "Data karyawan tidak ditemukan." };

  revalidatePath("/admin");
  return { ok: true, message: id ? `Data ${fullName} disimpan.` : `${fullName} ditambahkan dan sudah bisa login.` };
}

// Nonaktifkan: tidak bisa login lagi dan tidak tampil di laporan ATS. Data lama tetap tersimpan.
export async function setEmployeeActive(id: string, active: boolean, leftAt: string | null): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh melakukan ini." };
  if (id === me.id && !active) return { ok: false, message: "Anda tidak bisa menonaktifkan akun Anda sendiri." };
  if (!active && leftAt && !/^\d{4}-\d{2}-\d{2}$/.test(leftAt)) return { ok: false, message: "Tanggal keluar tidak valid." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .update({ is_active: active, left_at: active ? null : leftAt })
    .eq("id", id)
    .select("full_name");
  if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
  if (!data?.length) return { ok: false, message: "Data karyawan tidak ditemukan." };

  revalidatePath("/admin");
  return {
    ok: true,
    message: active ? `${data[0].full_name} diaktifkan kembali.` : `${data[0].full_name} dinonaktifkan.`,
  };
}

// Simpan tarif & parameter perjalanan dinas (tab Admin > Tarif dinas).
export async function saveTravelRates(rates: TravelRate[], params: TravelParams): Promise<Result> {
  const me = await getCurrentEmployee();
  if (me?.app_role !== "admin") return { ok: false, message: "Hanya admin yang boleh melakukan ini." };
  const amounts = rates.flatMap((r) => [r.daily, r.hotel, r.local_transport, r.representation]);
  if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0)) return { ok: false, message: "Tarif tidak boleh negatif." };
  if (TRAVEL_PARAM_KEYS.some((k) => !Number.isFinite(params[k]) || params[k] < 0)) {
    return { ok: false, message: "Parameter tidak boleh negatif." };
  }

  const supabase = await createClient();
  for (const r of rates) {
    const { error } = await supabase
      .from("travel_rates")
      .update({ daily: r.daily, hotel: r.hotel, local_transport: r.local_transport, representation: r.representation })
      .eq("grade", r.grade);
    if (error) return { ok: false, message: `Gagal menyimpan tarif: ${error.message}` };
  }
  for (const k of TRAVEL_PARAM_KEYS) {
    const { error } = await supabase.from("travel_params").update({ value: params[k] }).eq("key", k);
    if (error) return { ok: false, message: `Gagal menyimpan parameter: ${error.message}` };
  }
  revalidatePath("/admin");
  return { ok: true, message: "Tarif dinas disimpan." };
}
