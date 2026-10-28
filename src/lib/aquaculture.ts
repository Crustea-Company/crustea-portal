// Aquaculture > Project Management (migrasi 015, docs/fase-2-3/10-aquaculture.md).
// Aturan alur resmi ada di database (change_aqua_stage, change_request_status); di sini label, hak akses
// untuk tampilan, dan rumus kelayakan finansial + RAB (sama dengan template Excel RAB Aquagrowth).

type Me = { id: string; dept_code: string | null; app_role: string };

// ---------- Proyek ----------

export const PROJECT_TYPES = ["aquagrowth", "mini_ras", "workshop", "training"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const TYPE_LABEL: Record<ProjectType, string> = {
  aquagrowth: "Aquagrowth",
  mini_ras: "Mini RAS",
  workshop: "Workshop",
  training: "Pelatihan",
};

export const AQUA_STAGES = [
  "opportunity",
  "plan",
  "fa_review",
  "ceo_review",
  "approved",
  "negotiation",
  "contract",
  "signed",
  "execution",
  "harvest",
  "completed",
] as const;

export type AquaStage = (typeof AQUA_STAGES)[number] | "cancelled";

export const STAGE_LABEL: Record<AquaStage, string> = {
  opportunity: "Identifikasi peluang",
  plan: "Kelayakan & RAB",
  fa_review: "Review F&A",
  ceo_review: "Menunggu CEO",
  approved: "Disetujui CEO",
  negotiation: "Presentasi & negosiasi",
  contract: "Proses kontrak",
  signed: "Kontrak ditandatangani",
  execution: "Eksekusi & monitoring",
  harvest: "Panen & penjualan hasil",
  completed: "Selesai",
  cancelled: "Batal",
};

// Penjelasan singkat tiap tahap dari SOP Aquaculture.
export const STAGE_HINT: Partial<Record<AquaStage, string>> = {
  opportunity: "Lengkapi data peluang, lalu susun paket kelayakan finansial & RAB.",
  plan: "Susun RAB + kelayakan finansial, lalu kirim ke F&A.",
  fa_review: "Review F&A (catatan lintas tim TechOps/DM boleh ditambahkan di paket).",
  ceo_review: "Menunggu persetujuan CEO atas rencana usaha.",
  approved: "Presentasikan & negosiasikan dengan mitra, investor, atau peserta.",
  negotiation: "Setelah sepakat, isi Form Permohonan Kontrak (ke CA).",
  contract: "CA memproses perjanjian; catat tanggal tanda tangan.",
  signed: "Mulai eksekusi sesuai rencana.",
  execution: "Isi laporan bulanan di akhir bulan (ke MGT).",
  harvest: "Jual langsung atau lewat Busdev (Trading/Krasty Food).",
};

export const STAGE_STYLE: Record<AquaStage, string> = {
  opportunity: "bg-slate-100 text-slate-700",
  plan: "bg-amber-100 text-amber-800",
  fa_review: "bg-violet-100 text-violet-800",
  ceo_review: "bg-sky-100 text-sky-800",
  approved: "bg-brand-100 text-brand-800",
  negotiation: "bg-amber-100 text-amber-800",
  contract: "bg-indigo-100 text-indigo-800",
  signed: "bg-brand-100 text-brand-800",
  execution: "bg-brand-100 text-brand-800",
  harvest: "bg-brand-700 text-white",
  completed: "bg-brand-800 text-white",
  cancelled: "bg-red-100 text-red-700",
};

// Tahap yang hanya digerakkan status paket RAB (bukan tombol tahap).
export const PLAN_STAGES: AquaStage[] = ["plan", "fa_review", "ceo_review"];

export const stageRank = (s: AquaStage) => (AQUA_STAGES as readonly string[]).indexOf(s);

export type Investor = { name: string; capital: number; percent: number };

export type AquaProject = {
  id: string;
  number: string;
  type: ProjectType;
  name: string;
  location: string | null;
  partner: string | null;
  contact: string | null;
  source: string | null;
  description: string | null;
  estimated_value: number;
  estimated_start: string | null;
  pic_id: string;
  stage: AquaStage;
  stage_since: string;
  plan_id: string | null;
  investors: Investor[];
  contract_number: string | null;
  contract_signed_on: string | null;
  contract_value: number | null;
  cancel_reason: string | null;
  created_at: string;
  pic?: { full_name: string } | null;
};

export const PROJECT_COLUMNS =
  "id, number, type, name, location, partner, contact, source, description, estimated_value, estimated_start, pic_id, stage, stage_since, plan_id, investors, contract_number, contract_signed_on, contract_value, cancel_reason, created_at, pic:employees!aqua_projects_pic_id_fkey(full_name)";

// Sama dengan is_aqua_editor() di database: departemen AQ, admin, CEO.
export function isAquaEditor(me: Me): boolean {
  return me.dept_code === "AQ" || me.app_role === "admin" || me.app_role === "ceo";
}

// Sama dengan is_aqua_manager(): head AQ, admin, CEO.
export function isAquaManager(me: Me): boolean {
  return (me.app_role === "head" && me.dept_code === "AQ") || me.app_role === "admin" || me.app_role === "ceo";
}

// Label alokasi bawaan dana masuk (target_sources.alloc_label "Aquagrowth Project").
export const DEFAULT_ALLOCATION = "Aquagrowth";

// ---------- Kelayakan finansial + RAB ----------

export type CostLine = { desc: string; qty: number; uom: string; volume: number; price: number; note: string };
export type CapexLine = CostLine & { salvage: number; lifetime_months: number };
export type RevenueLine = { commodity: string; desc: string; qty: number; uom: string; price: number; note: string };

export type RabData = {
  project_id: string;
  general: { project_name: string; location: string; period: string; commodity: string; ponds: string; area_per_pond: string };
  commodity: {
    name: string;
    area_m2: number;
    density: number; // ekor/m2
    survival_pct: number;
    size_per_kg: number; // ekor/kg
    fcr: number;
    cycle_months: number;
    cycles_per_year: number;
  };
  capex: CapexLine[];
  workcap: CostLine[];
  opex: CostLine[];
  revenue: RevenueLine[];
  params: { bonus_pct: number; zakat_pct: number; investor_pct: number; bep_unit: string };
  timeline: { activity: string; when: string }[];
  summary: string;
};

export function emptyRab(projectId: string, type: ProjectType, name: string, location: string): RabData {
  const aquagrowth = type === "aquagrowth";
  return {
    project_id: projectId,
    general: { project_name: name, location, period: "", commodity: "", ponds: "", area_per_pond: "" },
    commodity: {
      name: "",
      area_m2: 0,
      density: 0,
      survival_pct: 0,
      size_per_kg: 0,
      fcr: 0,
      cycle_months: 0,
      cycles_per_year: 1,
    },
    capex: [],
    workcap: [],
    opex: [],
    revenue: [],
    params: { bonus_pct: 10, zakat_pct: 2.5, investor_pct: aquagrowth ? 70 : 0, bep_unit: aquagrowth ? "kg" : "" },
    timeline: [],
    summary: "",
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

// Sama dengan aqua_plan_total() di database: qty x volume x harga satuan, dibulatkan per baris.
export function lineTotal(l: Pick<CostLine, "qty" | "volume" | "price">): number {
  return Math.round(num(l.qty) * (l.volume === undefined || l.volume === null ? 1 : num(l.volume)) * num(l.price));
}

export const revenueTotal = (l: Pick<RevenueLine, "qty" | "price">) => Math.round(num(l.qty) * num(l.price));

// (total - harga sisa) / lifetime bulan
export function monthlyDepreciation(l: CapexLine): number {
  const months = num(l.lifetime_months);
  return months > 0 ? Math.max(0, (lineTotal(l) - num(l.salvage)) / months) : 0;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const div = (a: number, b: number) => (b !== 0 && Number.isFinite(b) ? a / b : null);

export type Scenario = { name: string; remark: string; revenue: number; cost: number; operating: number; other: number; net: number };

export type RabResult = {
  commodity: { stocking: number; population: number; biomass: number; feed: number };
  capex: number;
  depreciation: number; // per bulan
  workcap: number;
  opex: number;
  capital: number; // D = A + B + C
  revenue: number; // E per siklus
  grossProfit: number; // F = E - (B + C)
  bonus: number;
  zakat: number;
  otherExpense: number;
  netProfit: number; // H
  investorShare: number;
  crusteaShare: number;
  grossMargin: number | null;
  netMargin: number | null;
  cyclesPerYear: number;
  investorReturnYear: number;
  roiYear: number | null;
  paybackYears: number | null;
  bep: {
    unit: string;
    units: number;
    price: number | null; // rata-rata harga per unit
    variablePerUnit: number | null;
    otherRevenue: number;
    fixedCost: number;
    breakEvenUnits: number | null; // BEP unit
    rupiah: number | null; // BEP Rp
    breakEvenPrice: number | null; // BEP harga
  };
  scenarios: Scenario[];
};

export function computeRab(d: RabData): RabResult {
  const c = d.commodity;
  const stocking = num(c.area_m2) * num(c.density);
  const population = stocking * (num(c.survival_pct) / 100);
  const biomass = num(c.size_per_kg) > 0 ? population / num(c.size_per_kg) : 0;
  const feed = biomass * num(c.fcr);

  const capex = sum(d.capex.map(lineTotal));
  const depreciation = sum(d.capex.map(monthlyDepreciation));
  const workcap = sum(d.workcap.map(lineTotal));
  const opex = sum(d.opex.map(lineTotal));
  const capital = capex + workcap + opex;
  const revenue = sum(d.revenue.map(revenueTotal));

  const p = d.params;
  const otherPct = (num(p.bonus_pct) + num(p.zakat_pct)) / 100;
  const grossProfit = revenue - (workcap + opex);
  const bonus = (grossProfit * num(p.bonus_pct)) / 100;
  const zakat = (grossProfit * num(p.zakat_pct)) / 100;
  const otherExpense = bonus + zakat;
  const netProfit = grossProfit - otherExpense;
  const investorShare = (netProfit * num(p.investor_pct)) / 100;
  const crusteaShare = netProfit - investorShare;

  const cyclesPerYear = num(c.cycles_per_year) || 1;
  // Tanpa investor: payback & ROI memakai laba bersih.
  const investorReturnYear = (num(p.investor_pct) > 0 ? investorShare : netProfit) * cyclesPerYear;
  const roiYear = div(investorReturnYear, capital);
  const paybackYears = investorReturnYear > 0 ? capital / investorReturnYear : null;

  // BEP: unit utama = baris pendapatan bersatuan bep_unit; pendapatan lain mengurangi biaya yang harus ditutup.
  const unit = (p.bep_unit || d.revenue[0]?.uom || "").trim().toLowerCase();
  const unitLines = d.revenue.filter((l) => l.uom.trim().toLowerCase() === unit);
  const units = sum(unitLines.map((l) => num(l.qty)));
  const unitRevenue = sum(unitLines.map(revenueTotal));
  const otherRevenue = revenue - unitRevenue;
  const price = div(unitRevenue, units);
  const variablePerUnit = div(workcap, units);
  const fixedCost = capex + opex;
  const margin = price !== null && variablePerUnit !== null ? price - variablePerUnit : null;
  const bepUnits = margin !== null && margin > 0 ? Math.max(0, fixedCost - otherRevenue) / margin : null;

  const scenario = (name: string, remark: string, revFactor: number, costFactor: number): Scenario => {
    const rev = revenue * revFactor;
    const cost = (workcap + opex) * costFactor;
    const operating = rev - cost;
    const other = Math.max(0, operating) * otherPct;
    return { name, remark, revenue: rev, cost, operating, other, net: operating - other };
  };

  return {
    commodity: { stocking, population, biomass, feed },
    capex,
    depreciation,
    workcap,
    opex,
    capital,
    revenue,
    grossProfit,
    bonus,
    zakat,
    otherExpense,
    netProfit,
    investorShare,
    crusteaShare,
    grossMargin: div(grossProfit, revenue),
    netMargin: div(netProfit, revenue),
    cyclesPerYear,
    investorReturnYear,
    roiYear,
    paybackYears,
    bep: {
      unit,
      units,
      price,
      variablePerUnit,
      otherRevenue,
      fixedCost,
      breakEvenUnits: bepUnits,
      rupiah: bepUnits !== null && price !== null ? bepUnits * price : null,
      breakEvenPrice: div(Math.max(0, capital - otherRevenue), units),
    },
    scenarios: [
      scenario("Optimis", "Pendapatan +15%, efisiensi biaya 5%", 1.15, 0.95),
      scenario("Normal", "Sesuai RAB", 1, 1),
      scenario("Pesimis", "Pendapatan −10%, biaya naik 5%", 0.9, 1.05),
    ],
  };
}

// Persentase investor harus total 100 (sama dengan change_aqua_stage).
export function investorPercentTotal(list: Investor[]): number {
  return Math.round(sum(list.map((i) => num(i.percent))) * 100) / 100;
}
