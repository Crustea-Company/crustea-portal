import type { createClient } from "@/lib/supabase/server";
import { TRAVEL_PARAM_KEYS, type TravelParams, type TravelRate } from "@/lib/travel";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Tarif, parameter, dan hari libur untuk kalkulator dinas (dipakai halaman form dan server action).
export async function loadTravelSetup(supabase: Supabase, fromDate: string) {
  const [rateRes, paramRes, holidayRes] = await Promise.all([
    supabase.from("travel_rates").select("grade, label, sort, daily, hotel, local_transport, representation").order("sort"),
    supabase.from("travel_params").select("key, value"),
    supabase.from("holidays").select("date").gte("date", fromDate),
  ]);
  const rates = ((rateRes.data ?? []) as TravelRate[]).map((r) => ({
    ...r,
    daily: Number(r.daily),
    hotel: Number(r.hotel),
    local_transport: Number(r.local_transport),
    representation: Number(r.representation),
  }));
  const values = new Map((paramRes.data ?? []).map((p) => [p.key as string, Number(p.value)]));
  const params = Object.fromEntries(TRAVEL_PARAM_KEYS.map((k) => [k, values.get(k) ?? 0])) as TravelParams;
  const holidays = (holidayRes.data ?? []).map((h) => h.date as string);
  const error = rateRes.error?.message ?? paramRes.error?.message ?? null;
  return { rates, params, holidays, error };
}

// Yang boleh dipilih sebagai penugas: kepala departemen dan pimpinan (CEO, admin).
export const ASSIGNER_ROLES = ["head", "ceo", "admin"];

// Data untuk TravelForm: tarif golongan pemohon, parameter, libur, dan daftar calon penugas.
export async function loadTravelFormProps(supabase: Supabase, meId: string, today: string) {
  const [setup, meRes, empRes] = await Promise.all([
    loadTravelSetup(supabase, today),
    supabase.from("employees").select("grade").eq("id", meId).single(),
    supabase.from("employees").select("id, full_name, job_title")
      .eq("is_active", true)
      .in("app_role", ASSIGNER_ROLES)
      .order("full_name"),
  ]);
  return {
    rate: setup.rates.find((r) => r.grade === meRes.data?.grade) ?? null,
    params: setup.params,
    holidays: setup.holidays,
    today,
    assigners: (empRes.data ?? []) as { id: string; full_name: string; job_title: string | null }[],
  };
}
