// Definisi file Excel untuk Lead penjualan (ekspor–ubah–impor massal). Fungsi murni.
// Tahap TIDAK bisa diubah lewat file (punya syarat sendiri: produk, nilai, lunas, stok) dan lead tidak bisa dihapus.
import { normalizeText } from "./search";
import { resolvePeople, type Person, type RowValues, type SheetDef } from "./bulk-sheet";
import { LEAD_SOURCES, STAGE_LABEL, WON_RANK, stageRank, type Lead, type LeadInput, type LeadItem, type LeadSource, type LeadStage } from "./sales";

export type LeadSheetCtx = {
  products: { code: string; name: string }[];
  employees: { id: string; full_name: string }[];
};

export const LH = {
  number: "Nomor",
  stage: "Tahap",
  date: "Tanggal lead",
  source: "Sumber",
  referral: "Kode referral",
  customer: "Customer",
  contact: "Kontak",
  location: "Lokasi",
  sales: "PIC sales",
  product: "Produk",
  units: "Unit",
  value: "Nilai",
  notes: "Catatan",
} as const;

export const leadPeople = (ctx: LeadSheetCtx): Person[] => ctx.employees.map((e) => ({ id: e.id, name: e.full_name }));

const stageOfLabel = (label: string): LeadStage | null => (Object.entries(STAGE_LABEL).find(([, l]) => l === label)?.[0] as LeadStage | undefined) ?? null;

export function leadSheetDef(ctx: LeadSheetCtx): SheetDef<Lead> {
  const productName = new Map(ctx.products.map((p) => [p.code, p.name]));
  const multi = (n: number) => `(${n} produk, ubah di aplikasi)`;
  return {
    kind: "lead",
    title: "Lead penjualan",
    id: (l) => l.id,
    allowDelete: false,
    labelHeader: LH.customer,
    instructions: [
      "Tahap lead TIDAK bisa diubah lewat file (punya syarat sendiri); ubah tahap di aplikasi. Lead juga tidak bisa dihapus lewat file.",
      "Lead dengan lebih dari satu produk: kolom Produk berisi ringkasan, dan Produk/Unit/Nilai dikunci (ubah di aplikasi). Lead baru lewat file = satu produk.",
      "Setelah closing, Produk/Unit/Nilai/Kode referral terkunci (dasar komisi); perubahannya diabaikan.",
      "Baris baru: Tanggal lead, Sumber, Customer, Produk, dan Unit wajib; PIC sales kosong = Anda. Kode referral wajib bila Sumber = Referral.",
      "Yang boleh mengubah lead: PIC sales, pencatat, head BDS, CEO, admin. Baris lain dilewati saat impor.",
    ],
    lockedColumns: (cur) => {
      const locked: string[] = [];
      if ((cur[LH.product] ?? "").startsWith("(")) locked.push(LH.product, LH.units, LH.value);
      const stage = stageOfLabel(cur[LH.stage] ?? "");
      if (stage && stageRank(stage) >= WON_RANK) locked.push(LH.product, LH.units, LH.value, LH.referral);
      return locked;
    },
    columns: [
      { header: LH.number, kind: "text", get: (l) => l.number, readOnly: true, width: 14 },
      { header: LH.stage, kind: "text", get: (l) => STAGE_LABEL[l.stage], readOnly: true, width: 20 },
      { header: LH.date, kind: "date", get: (l) => l.lead_date, required: true, width: 13 },
      { header: LH.source, kind: "choice", get: (l) => LEAD_SOURCES[l.source], choices: Object.values(LEAD_SOURCES), required: true, width: 22 },
      { header: LH.referral, kind: "text", get: (l) => l.referral_code, width: 16 },
      { header: LH.customer, kind: "text", get: (l) => l.customer, required: true, width: 30 },
      { header: LH.contact, kind: "text", get: (l) => l.contact, width: 20 },
      { header: LH.location, kind: "text", get: (l) => l.location, width: 22 },
      { header: LH.sales, kind: "people", get: (l) => (l.sales ? [l.sales.full_name] : []), width: 24 },
      {
        header: LH.product,
        kind: "choice",
        get: (l) => (l.items.length > 1 ? multi(l.items.length) : l.items[0]?.product_code ? (productName.get(l.items[0].product_code) ?? l.items[0].product_code) : ""),
        choices: ctx.products.map((p) => p.name),
        width: 30,
      },
      { header: LH.units, kind: "number", get: (l) => l.units, width: 10 },
      { header: LH.value, kind: "number", get: (l) => l.value, width: 16 },
      { header: LH.notes, kind: "text", get: (l) => l.notes, width: 40 },
    ],
  };
}

// Nilai kanonik -> isian lead (sama dengan form). keepItems = pakai baris produk yang sudah ada (lead banyak produk / sudah closing).
export function leadInputFromValues(v: RowValues, ctx: LeadSheetCtx, keepItems: LeadItem[] | null): { input: LeadInput } | { problems: string[] } {
  const problems: string[] = [];
  const source = (Object.entries(LEAD_SOURCES).find(([, label]) => normalizeText(label) === normalizeText(v[LH.source] ?? ""))?.[0] ?? null) as LeadSource | null;
  if (!source) problems.push(`Sumber "${v[LH.source] ?? ""}" tidak dikenal.`);

  const sales = resolvePeople(v[LH.sales] ?? "", leadPeople(ctx));
  problems.push(...sales.problems.map((p) => `${LH.sales}: ${p}`));
  if (sales.ids.length > 1) problems.push(`${LH.sales}: hanya boleh satu orang.`);

  let items = keepItems;
  if (!items) {
    let code: string | null = null;
    const name = v[LH.product] ?? "";
    if (name) {
      const k = normalizeText(name);
      const hits = ctx.products.filter((p) => normalizeText(p.name) === k || normalizeText(p.code) === k);
      if (hits.length === 1) code = hits[0].code;
      else problems.push(hits.length === 0 ? `Produk "${name}" tidak dikenal.` : `Produk "${name}" ada lebih dari satu.`);
    }
    items = [{ product_code: code, units: Number(v[LH.units] || 0), value: Number(v[LH.value] || 0) }];
  }
  if (problems.length || !source) return { problems };
  return {
    input: {
      lead_date: v[LH.date] ?? "",
      source,
      referral_code: v[LH.referral] ?? "",
      customer: v[LH.customer] ?? "",
      contact: v[LH.contact] ?? "",
      location: v[LH.location] ?? "",
      items,
      sales_id: sales.ids[0] ?? "",
      notes: v[LH.notes] ?? "",
    },
  };
}

export type LeadSheetOp = {
  op: "add" | "update";
  id: string; // "" untuk baris baru
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
};
