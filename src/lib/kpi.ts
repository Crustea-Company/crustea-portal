// Monitoring KPI + target kuartal (migrasi 013). Lihat docs/fase-2-3/08-monitoring-kpi-target.md.

export const DEPT_ORDER = ["MGT", "CA", "FA", "BDS", "DM", "AQ", "TO"];

export type KpiItem = {
  id: number;
  objective_code: string;
  objective: string;
  dept_code: string;
  item: string;
  pic_type: "person" | "department";
  pic_id: string | null;
  target_value: number | null;
  target_unit: string | null;
  target_period: string | null;
  target_weeks: string | null;
  is_done: boolean;
  realization_note: string | null;
  updated_at: string | null;
  pic: { full_name: string } | null;
  editor: { full_name: string } | null;
};

export const KPI_COLUMNS =
  "id, objective_code, objective, dept_code, item, pic_type, pic_id, target_value, target_unit, target_period, target_weeks, is_done, realization_note, updated_at, pic:employees!kpi_items_pic_id_fkey(full_name), editor:employees!kpi_items_updated_by_fkey(full_name)";

type Me = { id: string; dept_code: string | null; app_role: string };

// Sama dengan fungsi can_edit_kpi di database.
export function canEditKpi(me: Me, k: Pick<KpiItem, "dept_code" | "pic_type" | "pic_id">): boolean {
  if (me.app_role === "admin" || me.app_role === "ceo") return true;
  if (me.app_role === "head" && me.dept_code === k.dept_code) return true;
  return k.pic_type === "person" ? k.pic_id === me.id : me.dept_code === k.dept_code;
}

export function isMyKpi(me: Me, k: Pick<KpiItem, "dept_code" | "pic_type" | "pic_id">): boolean {
  return k.pic_type === "person" ? k.pic_id === me.id : me.dept_code === k.dept_code;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// "9-W1;9-W2" -> "Sep W1, Sep W2"
export function formatWeeks(weeks: string | null): string {
  if (!weeks) return "";
  return weeks
    .split(";")
    .map((w) => {
      const [m, wk] = w.trim().split("-");
      const name = MONTHS[Number(m) - 1];
      return name ? `${name} ${wk ?? ""}`.trim() : w.trim();
    })
    .join(", ");
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// ---------- Target kuartal ----------

export type QuarterTarget = { id: number; year: number; quarter: number; total: number; notes: string | null };

export type TargetStrategy = {
  id: number;
  source_id: number;
  strategy: string;
  projection: number;
  note: string | null;
  realization: number | null; // diisi manual; kosong = belum dirinci
  realization_note: string | null;
  sort: number;
};

// Divisi PIC target kuartal (Open Project = TechOps).
export const TARGET_DIVISIONS = ["Bisdev", "Aquaculture", "TechOps"] as const;

export type TargetSource = {
  id: number;
  target_id: number;
  name: string;
  division: string;
  weight: number | null; // persen
  target_amount: number | null; // target alokasi tetap; bila ada, menggantikan bobot x total
  alloc_label: string;
  from_sales: boolean;
  sort: number;
  strategies: TargetStrategy[];
};

export type Revenue = {
  id: string;
  revenue_date: string;
  amount: number;
  allocation: string | null;
  status: "paid" | "unpaid";
  description: string;
  creator: { full_name: string } | null;
};

export const REVENUE_COLUMNS =
  "id, revenue_date, amount, allocation, status, description, creator:employees!revenues_created_by_fkey(full_name)";

export const REVENUE_STATUS = { paid: "Lunas (PAID)", unpaid: "Belum lunas" } as const;

export const quarterLabel = (t: { year: number; quarter: number }) => `Q${t.quarter} ${t.year}`;

// Kuartal kalender: Q4 = Okt-Des. Mengembalikan ["2026-10", "2026-11", "2026-12"].
export function quarterMonths(t: { year: number; quarter: number }): string[] {
  return [0, 1, 2].map((i) => `${t.year}-${String((t.quarter - 1) * 3 + i + 1).padStart(2, "0")}`);
}

export const sourceTarget = (total: number, s: Pick<TargetSource, "weight" | "target_amount">) =>
  s.target_amount != null ? s.target_amount : s.weight == null ? 0 : Math.round((total * s.weight) / 100);

export const hasTarget = (s: Pick<TargetSource, "weight" | "target_amount">) => s.weight != null || s.target_amount != null;

export const sourceProjection = (s: Pick<TargetSource, "strategies">) =>
  s.strategies.reduce((sum, g) => sum + g.projection, 0);

export const OTHER_KEY = "__other";

// Realisasi per sumber per bulan. Lunas saja: lead penjualan pada bulan paid_on (ke sumber from_sales),
// pendapatan manual pada bulan tanggalnya (ke sumber dengan label alokasi yang sama; selain itu "lain").
// Lead yang punya pendapatan tertaut (revenue_leads, migrasi 016) dihitung dari pendapatannya saja, supaya tidak dobel.
export function realization(
  t: QuarterTarget,
  sources: TargetSource[],
  revenues: Pick<Revenue, "revenue_date" | "amount" | "allocation" | "status">[],
  sales: { paid_on: string | null; value: number; linked?: boolean }[],
): Map<string, number[]> {
  const months = quarterMonths(t);
  const out = new Map<string, number[]>();
  const add = (key: string, date: string, amount: number) => {
    const i = months.indexOf(date.slice(0, 7));
    if (i < 0) return;
    const row = out.get(key) ?? [0, 0, 0];
    row[i] += amount;
    out.set(key, row);
  };
  const byLabel = new Map(sources.map((s) => [s.alloc_label.trim().toLowerCase(), String(s.id)]));
  const salesSource = sources.find((s) => s.from_sales);
  for (const l of sales) if (l.paid_on && !l.linked) add(salesSource ? String(salesSource.id) : OTHER_KEY, l.paid_on, l.value);
  for (const r of revenues) {
    if (r.status !== "paid") continue;
    add(byLabel.get((r.allocation ?? "").trim().toLowerCase()) ?? OTHER_KEY, r.revenue_date, r.amount);
  }
  return out;
}
