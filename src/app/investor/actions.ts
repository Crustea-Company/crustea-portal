"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { INVESTOR_COOKIE, INVESTOR_COOKIE_OPTIONS, loadInvestorDashboard } from "./data";

export type EnterState = { message: string } | null;

// Investor memasukkan kode: dicek ke database, lalu disimpan di cookie httpOnly (hanya untuk /investor).
export async function enterCode(_prev: EnterState, form: FormData): Promise<EnterState> {
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { message: "Masukkan kode akses dari Crustea." };
  const res = await loadInvestorDashboard(code);
  if (!res.ok) return { message: res.message };
  (await cookies()).set(INVESTOR_COOKIE, code, INVESTOR_COOKIE_OPTIONS);
  redirect("/investor");
}

export async function leaveDashboard() {
  (await cookies()).delete({ name: INVESTOR_COOKIE, path: "/investor" });
  redirect("/investor");
}
