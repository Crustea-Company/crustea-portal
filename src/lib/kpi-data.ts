import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { REVENUE_COLUMNS, quarterMonths, realization, type QuarterTarget, type Revenue, type TargetSource } from "@/lib/kpi";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PaidLead = {
  number: string;
  customer: string;
  value: number;
  closed_on: string | null;
  paid_on: string | null;
  linked: boolean; // punya pendapatan tertaut: dihitung dari pendapatannya, bukan dari value
};

// Sumber, pendapatan, penjualan lunas, dan realisasi satu kuartal (dipakai halaman Target kuartal dan Beranda).
export async function loadQuarter(supabase: Supabase, t: QuarterTarget) {
  const months = quarterMonths(t);
  const from = `${months[0]}-01`;
  const end = new Date(Date.UTC(t.year, t.quarter * 3, 1)).toISOString().slice(0, 10); // awal kuartal berikutnya

  const [{ data: sourceRows }, { data: revRows }, { data: leadRows }] = await Promise.all([
    supabase
      .from("target_sources")
      .select(
        "id, target_id, name, division, weight, target_amount, alloc_label, from_sales, sort, strategies:target_strategies(id, source_id, strategy, projection, note, realization, realization_note, sort)",
      )
      .eq("target_id", t.id)
      .order("sort"),
    fetchAll(() => supabase.from("revenues").select(REVENUE_COLUMNS).gte("revenue_date", from).lt("revenue_date", end).order("revenue_date")),
    fetchAll(() =>
      supabase
        .from("sales_leads")
        .select("number, customer, value, closed_on, paid_on, revenue_links:revenue_leads(revenue_id)")
        .gte("paid_on", from).lt("paid_on", end).order("paid_on"),
    ),
  ]);
  const sources = ((sourceRows ?? []) as unknown as TargetSource[]).map((s) => ({
    ...s,
    weight: s.weight == null ? null : Number(s.weight),
    strategies: [...s.strategies].sort((a, b) => a.sort - b.sort),
  }));
  const revenues = revRows as unknown as Revenue[];
  const leads: PaidLead[] = (
    leadRows as unknown as (Omit<PaidLead, "linked"> & { revenue_links: { revenue_id: string }[] })[]
  ).map(({ revenue_links, ...l }) => ({ ...l, linked: revenue_links.length > 0 }));
  return { months, sources, revenues, leads, real: realization(t, sources, revenues, leads) };
}
