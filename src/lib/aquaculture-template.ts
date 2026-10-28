// Contoh isi RAB dari template Excel "RAB Aquagrowth Serang, Ikan Nila" (30-09-2026).
// Dipakai tombol "Isi dari contoh template" di editor RAB; angka bisa diubah setelahnya.
import type { CapexLine, CostLine, RabData, RevenueLine } from "./aquaculture";

const cost = (desc: string, qty: number, uom: string, price: number, note = ""): CostLine => ({ desc, qty, uom, volume: 1, price, note });
const capex = (desc: string, qty: number, uom: string, price: number, salvage: number, lifetime: number, note = ""): CapexLine => ({
  ...cost(desc, qty, uom, price, note),
  salvage,
  lifetime_months: lifetime,
});
const rev = (desc: string, qty: number, uom: string, price: number, note = ""): RevenueLine => ({ commodity: "Nila", desc, qty, uom, price, note });

export const AQUAGROWTH_TEMPLATE: Omit<RabData, "project_id" | "general" | "timeline" | "summary"> = {
  commodity: { name: "Nila", area_m2: 420, density: 25, survival_pct: 80, size_per_kg: 4, fcr: 1.2, cycle_months: 6, cycles_per_year: 2 },
  capex: [
    capex("Perbaikan kolam", 1, "tahun", 10_000_000, 1_000_000, 4),
    capex("Toren putih", 0, "Ls", 4_000_000, 0, 3, "sudah tersedia"),
    capex("Analisis feasibility", 0, "kali", 1_000_000, 0, 3, "sudah tersedia"),
    capex("CCTV dan wifi", 0, "kali", 2_500_000, 0, 5, "sudah tersedia"),
    capex("Sewa aerator mini", 2, "set", 3_000_000, 600_000, 4),
    capex("Install perpipaan kolam", 1, "set", 250_000, 25_000, 4),
    capex("Cek kualitas air", 1, "set", 800_000, 80_000, 4),
    capex("Ongkir teknologi", 1, "set", 450_000, 45_000, 4),
    capex("Tenaga kerja persiapan", 1, "person", 1_500_000, 150_000, 3),
    capex("Biosecurity", 1, "set", 500_000, 50_000, 4),
    capex("Bak panen", 2, "set", 300_000, 60_000, 3),
    capex("Jaring panen, ember, dll", 1, "set", 200_000, 20_000, 3),
    capex("Timbangan pakan", 1, "pcs", 250_000, 25_000, 5),
  ],
  workcap: [
    cost("Benih nila size ±60 ekor/kg", 175, "kg", 36_000),
    cost("Pakan nila 26-31%", 1_008, "kg", 15_000),
    cost("Pakan nila alternatif", 1_512, "kg", 6_000),
    cost("Healthy Pro-N", 2, "ls", 120_000),
    cost("Vitamin mineral", 6, "ls", 50_000),
    cost("Kapur dolomit", 4, "ls", 50_000),
    cost("Ongkir pakan dan benih ikan", 2, "kali", 500_000),
    cost("Persiapan lahan per siklus", 1, "kali", 1_500_000),
  ],
  opex: [
    cost("Listrik", 5, "bulan", 678_600, "aerator, CCTV, wifi, lampu ±1.250 watt"),
    cost("Pulsa wifi", 6, "bulan", 150_000),
    cost("Feeder", 5, "bulan", 2_000_000),
    cost("Maintenance kolam/teknologi", 5, "siklus", 1_000_000),
    cost("Transportasi operasional", 6, "bulan", 500_000),
    cost("PIC kolam Crustea", 6, "kali", 1_300_000),
    cost("Biaya panen", 3, "kali", 500_000),
    cost("Biaya contingency tiap siklus", 6, "bulan", 300_000),
  ],
  revenue: [
    rev("Parsial 1 (20%)", 420, "kg", 27_000),
    rev("Parsial 2 (30%)", 630, "kg", 25_000),
    rev("Panen total (50%)", 1_050, "kg", 25_000),
    rev("Trading ikan dari operasional cost", 1, "siklus", 44_469_380),
  ],
  params: { bonus_pct: 10, zakat_pct: 2.5, investor_pct: 70, bep_unit: "kg" },
};
