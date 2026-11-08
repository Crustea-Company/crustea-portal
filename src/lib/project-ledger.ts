// Dashboard realisasi proyek (migrasi 031): anggaran (baris RAB) vs realisasi, laba rugi, jurnal, stok proyek.
// Dipakai halaman karyawan (/projects/dashboard) dan halaman investor (/investor) dengan bentuk data yang sama.

import { type ProjectType, type RabData } from "@/lib/aquaculture";

export type BudgetKind = "capex" | "expense" | "income";
export type TxKind = "income" | "expense" | "capex" | "capital_in";

export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
  capex: "Investasi awal (Capex)",
  expense: "Biaya",
  income: "Target pendapatan",
};

export const TX_KIND_LABEL: Record<TxKind, string> = {
  income: "Pemasukan (penjualan)",
  expense: "Biaya operasional",
  capex: "Investasi awal / peralatan",
  capital_in: "Modal masuk",
};
export const TX_KIND_SHORT: Record<TxKind, string> = {
  income: "Pemasukan",
  expense: "Biaya",
  capex: "Capex",
  capital_in: "Modal masuk",
};
export const isOutflow = (k: TxKind) => k === "expense" || k === "capex";

export type BudgetLine = {
  id: string;
  kind: BudgetKind;
  grp: string;
  item: string;
  note: string | null;
  qty: number;
  uom: string | null;
  price: number;
  amount: number;
  sort: number;
};

export type Tx = {
  id: string;
  tx_date: string;
  kind: TxKind;
  category: string;
  budget_line_id: string | null;
  description: string;
  qty: number | null;
  uom: string | null;
  unit_price: number | null;
  amount: number;
  cycle: number | null;
  pond: string | null;
  kg_per_sack: number | null;
  fish_per_kg: number | null;
  status: "paid" | "unpaid";
  // Hanya di halaman karyawan (tidak dikirim ke investor).
  proof?: string | null;
  note?: string | null;
  creator?: { full_name: string } | null;
};

export type StockItem = {
  id: string;
  kind: "material" | "product";
  name: string;
  size: string | null;
  unit: string;
  plan_qty: number;
  sale_price: number;
  sort: number;
};

export type StockMoveKind = "in" | "pack" | "sold" | "sample" | "damaged" | "return" | "adjust";
export type StockMove = {
  id: number;
  item_id: string;
  move_date: string;
  kind: StockMoveKind;
  qty: number;
  material_item_id: string | null;
  material_qty: number | null;
  // Hanya di halaman karyawan.
  channel?: string | null;
  reference?: string | null;
  note?: string | null;
  transaction_id?: string | null;
  creator?: { full_name: string } | null;
};

export const STOCK_MOVE_LABEL: Record<StockMoveKind, string> = {
  in: "Bahan masuk",
  pack: "Packing",
  sold: "Terjual",
  sample: "Sampel / tester",
  damaged: "Rusak / hilang",
  return: "Retur masuk",
  adjust: "Penyesuaian (opname)",
};

export type LedgerData = {
  budget: BudgetLine[];
  transactions: Tx[];
  stockItems: StockItem[];
  stockMoves: StockMove[];
};

// Kolom yang dibaca halaman karyawan.
export const BUDGET_COLUMNS = "id, kind, grp, item, note, qty, uom, price, amount, sort";
export const TX_COLUMNS =
  "id, tx_date, kind, category, budget_line_id, description, qty, uom, unit_price, amount, cycle, pond, kg_per_sack, fish_per_kg, status, proof, note, creator:employees!project_transactions_created_by_fkey(full_name)";
export const STOCK_ITEM_COLUMNS = "id, kind, name, size, unit, plan_qty, sale_price, sort";
export const STOCK_MOVE_COLUMNS =
  "id, item_id, move_date, kind, qty, material_item_id, material_qty, channel, reference, note, transaction_id, creator:employees!project_stock_moves_created_by_fkey(full_name)";

// Angka dari database (numeric) bisa datang sebagai teks.
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const nn = (v: unknown) => (v === null || v === undefined || v === "" ? null : n(v));

export function normalizeLedger(raw: {
  budget: unknown[] | null;
  transactions: unknown[] | null;
  stockItems: unknown[] | null;
  stockMoves: unknown[] | null;
}): LedgerData {
  type R = Record<string, unknown>;
  return {
    budget: ((raw.budget ?? []) as R[]).map((b) => ({ ...(b as BudgetLine), qty: n(b.qty), price: n(b.price), amount: n(b.amount) })),
    transactions: ((raw.transactions ?? []) as R[]).map((t) => ({
      ...(t as Tx),
      qty: nn(t.qty),
      unit_price: nn(t.unit_price),
      amount: n(t.amount),
      cycle: nn(t.cycle),
      kg_per_sack: nn(t.kg_per_sack),
      fish_per_kg: nn(t.fish_per_kg),
    })),
    stockItems: ((raw.stockItems ?? []) as R[]).map((s) => ({ ...(s as StockItem), plan_qty: n(s.plan_qty), sale_price: n(s.sale_price) })),
    stockMoves: ((raw.stockMoves ?? []) as R[]).map((m) => ({ ...(m as StockMove), qty: n(m.qty), material_qty: nn(m.material_qty) })),
  };
}

// ---------- Saran kategori ----------
export function categorySuggestions(type: ProjectType | null, category: string | null): Record<TxKind, string[]> {
  if (type === "aquagrowth" || type === "mini_ras") {
    return {
      expense: ["Benih", "Pakan", "Obat", "Jasa", "Lain-lain"],
      income: ["Penjualan panen"],
      capex: ["Kolam & konstruksi", "Peralatan"],
      capital_in: ["Modal investor"],
    };
  }
  if ((category ?? "").toLowerCase().includes("krasty")) {
    return {
      expense: ["Bahan baku (maklon)", "Pengemasan", "Operasional", "Pemasaran", "Lain-lain"],
      income: ["Penjualan"],
      capex: ["Peralatan"],
      capital_in: ["Modal kerja"],
    };
  }
  return {
    expense: ["Bahan", "Jasa", "Transportasi", "Operasional", "Lain-lain"],
    income: ["Penjualan", "Pembayaran klien"],
    capex: ["Peralatan"],
    capital_in: ["Modal masuk", "Dana hibah"],
  };
}

// ---------- Anggaran vs realisasi ----------
export type LineActual = { line: BudgetLine; actual: number; unpaid: number; count: number };
export type GroupActual = { grp: string; kind: BudgetKind; budget: number; actual: number; lines: LineActual[] };

export type BudgetReport = {
  groups: GroupActual[];
  outside: Tx[]; // biaya/capex tanpa pos anggaran
  outsideTotal: number;
  costBudget: number; // capex + biaya
  costActual: number; // semua biaya + capex (termasuk di luar anggaran)
  incomeBudget: number;
  incomeActual: number;
  unpaid: number; // biaya yang belum dibayar
};

export function budgetReport(d: LedgerData): BudgetReport {
  const byLine = new Map<string, { actual: number; unpaid: number; count: number }>();
  for (const t of d.transactions) {
    if (!t.budget_line_id) continue;
    const cur = byLine.get(t.budget_line_id) ?? { actual: 0, unpaid: 0, count: 0 };
    cur.actual += t.amount;
    if (t.status === "unpaid") cur.unpaid += t.amount;
    cur.count += 1;
    byLine.set(t.budget_line_id, cur);
  }
  const groups: GroupActual[] = [];
  const sorted = [...d.budget].sort((a, b) => a.sort - b.sort);
  for (const line of sorted) {
    let g = groups.find((x) => x.grp === line.grp && x.kind === line.kind);
    if (!g) {
      g = { grp: line.grp, kind: line.kind, budget: 0, actual: 0, lines: [] };
      groups.push(g);
    }
    const a = byLine.get(line.id) ?? { actual: 0, unpaid: 0, count: 0 };
    g.lines.push({ line, ...a });
    g.budget += line.amount;
    g.actual += a.actual;
  }
  const lineIds = new Set(d.budget.map((b) => b.id));
  const outside = d.transactions.filter((t) => isOutflow(t.kind) && (!t.budget_line_id || !lineIds.has(t.budget_line_id)));
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  return {
    groups,
    outside,
    outsideTotal: sum(outside.map((t) => t.amount)),
    costBudget: sum(d.budget.filter((b) => b.kind !== "income").map((b) => b.amount)),
    costActual: sum(d.transactions.filter((t) => isOutflow(t.kind)).map((t) => t.amount)),
    incomeBudget: sum(d.budget.filter((b) => b.kind === "income").map((b) => b.amount)),
    incomeActual: sum(d.transactions.filter((t) => t.kind === "income").map((t) => t.amount)),
    unpaid: sum(d.transactions.filter((t) => isOutflow(t.kind) && t.status === "unpaid").map((t) => t.amount)),
  };
}

// ---------- Laba rugi ----------
export type ProfitParams = { bonus_pct: number; zakat_pct: number; investor_pct: number };

export type CycleRow = {
  cycle: number;
  costByCategory: Record<string, number>;
  cost: number;
  income: number;
  profit: number;
  seedFish: number; // ekor ditebar
  feedKg: number;
  harvestKg: number;
  harvestFish: number; // perkiraan ekor dipanen (kg x ekor/kg)
  fcr: number | null;
  survival: number | null;
};

export type MonthRow = { month: string; income: number; expense: number; capex: number; capitalIn: number; profit: number };

export type ProfitReport = {
  income: number;
  expense: number;
  expenseByCategory: { category: string; amount: number }[];
  incomeByCategory: { category: string; amount: number }[];
  gross: number; // pendapatan - biaya operasional
  bonus: number;
  zakat: number;
  net: number;
  investorShare: number | null;
  crusteaShare: number | null;
  capex: number;
  capitalIn: number;
  cash: number; // modal masuk + pendapatan - biaya - capex
  margin: number | null;
  cycleCategories: string[];
  cycles: CycleRow[];
  months: MonthRow[];
};

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function profitReport(d: LedgerData, params: ProfitParams | null): ProfitReport {
  const tx = d.transactions;
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const expCat = new Map<string, number>();
  const incCat = new Map<string, number>();
  let income = 0;
  let expense = 0;
  let capex = 0;
  let capitalIn = 0;
  for (const t of tx) {
    if (t.kind === "income") {
      income += t.amount;
      add(incCat, t.category, t.amount);
    } else if (t.kind === "expense") {
      expense += t.amount;
      add(expCat, t.category, t.amount);
    } else if (t.kind === "capex") capex += t.amount;
    else capitalIn += t.amount;
  }
  const gross = income - expense;
  const positive = Math.max(0, gross);
  const bonus = params ? (positive * (params.bonus_pct || 0)) / 100 : 0;
  const zakat = params ? (positive * (params.zakat_pct || 0)) / 100 : 0;
  const net = gross - bonus - zakat;
  const hasInvestor = !!params && (params.investor_pct || 0) > 0;
  const investorShare = hasInvestor ? (Math.max(0, net) * params!.investor_pct) / 100 : null;

  // Per siklus (budidaya).
  const cycleCategories = [...new Set(tx.filter((t) => t.cycle && t.kind === "expense").map((t) => t.category))];
  const cycleMap = new Map<number, CycleRow>();
  for (const t of tx) {
    if (!t.cycle) continue;
    const c =
      cycleMap.get(t.cycle) ??
      { cycle: t.cycle, costByCategory: {}, cost: 0, income: 0, profit: 0, seedFish: 0, feedKg: 0, harvestKg: 0, harvestFish: 0, fcr: null, survival: null };
    if (t.kind === "expense") {
      c.cost += t.amount;
      c.costByCategory[t.category] = (c.costByCategory[t.category] ?? 0) + t.amount;
      if (lower(t.uom) === "ekor" && t.qty) c.seedFish += t.qty;
      if (t.kg_per_sack && t.qty) c.feedKg += t.qty * t.kg_per_sack;
      else if (lower(t.category) === "pakan" && lower(t.uom) === "kg" && t.qty) c.feedKg += t.qty;
    } else if (t.kind === "income") {
      c.income += t.amount;
      if (lower(t.uom) === "kg" && t.qty) {
        c.harvestKg += t.qty;
        if (t.fish_per_kg) c.harvestFish += t.qty * t.fish_per_kg;
      }
    }
    cycleMap.set(t.cycle, c);
  }
  const cycles = [...cycleMap.values()]
    .map((c) => ({
      ...c,
      profit: c.income - c.cost,
      fcr: c.harvestKg > 0 && c.feedKg > 0 ? c.feedKg / c.harvestKg : null,
      survival: c.seedFish > 0 && c.harvestFish > 0 ? c.harvestFish / c.seedFish : null,
    }))
    .sort((a, b) => a.cycle - b.cycle);

  // Per bulan.
  const monthMap = new Map<string, MonthRow>();
  for (const t of tx) {
    const m = t.tx_date.slice(0, 7);
    const r = monthMap.get(m) ?? { month: m, income: 0, expense: 0, capex: 0, capitalIn: 0, profit: 0 };
    if (t.kind === "income") r.income += t.amount;
    else if (t.kind === "expense") r.expense += t.amount;
    else if (t.kind === "capex") r.capex += t.amount;
    else r.capitalIn += t.amount;
    monthMap.set(m, r);
  }
  const months = [...monthMap.values()].map((r) => ({ ...r, profit: r.income - r.expense })).sort((a, b) => a.month.localeCompare(b.month));

  const toList = (m: Map<string, number>) => [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  return {
    income,
    expense,
    expenseByCategory: toList(expCat),
    incomeByCategory: toList(incCat),
    gross,
    bonus,
    zakat,
    net,
    investorShare,
    crusteaShare: investorShare === null ? null : net - investorShare,
    capex,
    capitalIn,
    cash: capitalIn + income - expense - capex,
    margin: income > 0 ? gross / income : null,
    cycleCategories,
    cycles,
    months,
  };
}

export function paramsFromPlan(p: Partial<RabData["params"]> | null | undefined): ProfitParams | null {
  if (!p) return null;
  const v = { bonus_pct: Number(p.bonus_pct) || 0, zakat_pct: Number(p.zakat_pct) || 0, investor_pct: Number(p.investor_pct) || 0 };
  return v.bonus_pct || v.zakat_pct || v.investor_pct ? v : null;
}

// ---------- Stok ----------
export type StockBalance = {
  item: StockItem;
  received: number; // bahan: masuk; produk: dipacking
  used: number; // bahan: terpakai packing
  sold: number;
  sample: number;
  damaged: number;
  returned: number;
  adjust: number;
  balance: number;
  value: number; // produk: stok x harga jual
};

export function stockBalances(d: LedgerData): StockBalance[] {
  return [...d.stockItems]
    .sort((a, b) => (a.kind === b.kind ? a.sort - b.sort || a.name.localeCompare(b.name) : a.kind === "material" ? -1 : 1))
    .map((item) => {
      const moves = d.stockMoves.filter((m) => m.item_id === item.id);
      const total = (k: StockMoveKind) => moves.filter((m) => m.kind === k).reduce((s, m) => s + m.qty, 0);
      const used = d.stockMoves.filter((m) => m.kind === "pack" && m.material_item_id === item.id).reduce((s, m) => s + (m.material_qty ?? 0), 0);
      const adjust = total("adjust");
      const received = item.kind === "material" ? total("in") : total("pack");
      const sold = total("sold");
      const sample = total("sample");
      const damaged = total("damaged");
      const returned = total("return");
      const balance = item.kind === "material" ? received - used + adjust : received + returned + adjust - sold - sample - damaged;
      const round = (x: number) => Math.round(x * 1000) / 1000;
      return {
        item,
        received: round(received),
        used: round(used),
        sold,
        sample,
        damaged,
        returned,
        adjust: round(adjust),
        balance: round(balance),
        value: item.kind === "product" ? Math.round(Math.max(0, balance) * item.sale_price) : 0,
      };
    });
}

export const stockItemLabel = (s: Pick<StockItem, "name" | "size">) => (s.size ? `${s.name} ${s.size}` : s.name);

// ---------- Baris anggaran dari paket RAB ----------
export function budgetFromRab(d: RabData): Omit<BudgetLine, "id" | "amount">[] {
  const rows: Omit<BudgetLine, "id" | "amount">[] = [];
  let sort = 0;
  const cost = (kind: BudgetKind, grp: string, lines: RabData["capex"] | RabData["workcap"]) => {
    for (const l of lines ?? []) {
      if (!l.desc?.trim()) continue;
      const vol = l.volume === undefined || l.volume === null ? 1 : Number(l.volume) || 0;
      rows.push({
        kind,
        grp,
        item: l.desc.trim(),
        note: l.note?.trim() || null,
        qty: (Number(l.qty) || 0) * vol,
        uom: l.uom?.trim() || null,
        price: Number(l.price) || 0,
        sort: (sort += 10),
      });
    }
  };
  cost("capex", "Capex", d.capex);
  cost("expense", "Modal kerja", d.workcap);
  cost("expense", "Opex", d.opex);
  for (const l of d.revenue ?? []) {
    const name = [l.commodity, l.desc].filter((x) => x?.trim()).join(" · ");
    if (!name) continue;
    rows.push({
      kind: "income",
      grp: "Pendapatan",
      item: name,
      note: l.note?.trim() || null,
      qty: Number(l.qty) || 0,
      uom: l.uom?.trim() || null,
      price: Number(l.price) || 0,
      sort: (sort += 10),
    });
  }
  return rows;
}
