import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeLedger, type LedgerData } from "@/lib/project-ledger";
import type { AquaStage, ProjectType } from "@/lib/aquaculture";

export const INVESTOR_COOKIE = "crustea_investor";
export const INVESTOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/investor",
  maxAge: 60 * 60 * 24 * 30, // 30 hari (kode tetap dicek ke database setiap halaman dibuka)
};

export type InvestorDashboard = {
  label: string;
  project: {
    id: string;
    number: string;
    type: ProjectType;
    name: string;
    location: string | null;
    stage: AquaStage;
    category: string | null;
    contract_signed_on: string | null;
    investor_capital: number;
    investor_count: number;
    params: Record<string, number>;
  };
  ledger: LedgerData;
  updatedAt: string;
};

export type LoadResult = { ok: true; data: InvestorDashboard } | { ok: false; reason: "invalid" | "limited" | "unavailable"; message: string };

// Alamat IP pengunjung (dari proxy/load balancer), untuk membatasi percobaan kode.
async function clientAddress(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "tanpa-ip";
}

export async function loadInvestorDashboard(code: string): Promise<LoadResult> {
  const sb = createServiceClient();
  if (!sb) return { ok: false, reason: "unavailable", message: "Akses investor belum diaktifkan di server. Hubungi Crustea." };
  const { data, error } = await sb.rpc("investor_dashboard", { p_code: code.slice(0, 64), p_client: await clientAddress() });
  if (error) {
    if (error.message.includes("Terlalu banyak")) return { ok: false, reason: "limited", message: error.message };
    console.error("investor_dashboard:", error.message);
    return { ok: false, reason: "unavailable", message: "Dashboard sedang tidak bisa dimuat. Coba lagi beberapa saat." };
  }
  if (!data) return { ok: false, reason: "invalid", message: "Kode tidak dikenal, sudah dicabut, atau sudah kedaluwarsa." };
  const d = data as {
    label: string;
    project: InvestorDashboard["project"];
    budget: unknown[];
    transactions: unknown[];
    stock_items: unknown[];
    stock_moves: unknown[];
    updated_at: string;
  };
  return {
    ok: true,
    data: {
      label: d.label,
      project: { ...d.project, investor_capital: Number(d.project.investor_capital) || 0 },
      ledger: normalizeLedger({ budget: d.budget, transactions: d.transactions, stockItems: d.stock_items, stockMoves: d.stock_moves }),
      updatedAt: d.updated_at,
    },
  };
}
