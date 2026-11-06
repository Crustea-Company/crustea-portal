// Template Excel untuk "Catat peluang proyek" dan "Susun kelayakan & RAB" (Project Management).
// Semua dibuat & dibaca di browser: file unggahan tidak pernah dikirim ke server atau disimpan.
// exceljs dimuat hanya saat tombol dipakai (supaya halaman tetap ringan).
import type { Workbook, Worksheet } from "exceljs";
import { normalizeText } from "./search";
import {
  PROJECT_TYPES,
  TYPE_LABEL,
  type CapexLine,
  type CostLine,
  type ProjectType,
  type RabData,
  type RevenueLine,
} from "./aquaculture";

export type ProjectSheetInput = {
  type: ProjectType;
  name: string;
  location: string;
  partner: string;
  contact: string;
  source: string;
  description: string;
  estimated_value: number;
  estimated_start: string; // YYYY-MM-DD atau ""
  pic_id: string;
  category: string;
};
type Person = { id: string; full_name: string; email: string | null };

// ---------- Bantuan umum ----------

async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

async function download(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readWorkbook(file: File): Promise<Workbook> {
  if (file.size > 5_000_000) throw new Error("File terlalu besar (maks. 5 MB).");
  const wb = await newWorkbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("File tidak bisa dibaca. Pastikan formatnya .xlsx (bukan .xls/.csv).");
  }
  return wb;
}

// Nilai sel apa pun (teks kaya, rumus, link, tanggal) -> teks / angka / tanggal.
function cellValue(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return v ? "ya" : "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) return cellValue(o.result);
    if (o.text !== undefined) return cellValue(o.text);
  }
  return null;
}

const text = (v: unknown) => {
  const x = cellValue(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  return x == null ? "" : String(x).trim();
};

// Angka; teks "Rp1.500.000" atau "2,5" juga diterima (format Indonesia).
function num(v: unknown): number {
  const x = cellValue(v);
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x !== "string") return 0;
  const s = x.replace(/[^\d,.-]/g, "");
  // "1.500.000" / "1.500.000,5" = format Indonesia; selain itu koma dianggap desimal ("2,5").
  const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isoDate(v: unknown): string {
  const x = cellValue(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === "number" && x > 20000 && x < 80000) return new Date(Date.UTC(1899, 11, 30) + x * 86_400_000).toISOString().slice(0, 10);
  const s = typeof x === "string" ? x.trim() : "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const key = (s: string) => normalizeText(s).replace(/[^a-z0-9]/g, "");

function styleHeader(ws: Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// Sheet dua kolom "Isian | Isi | Petunjuk".
type Field = { label: string; value: string | number | Date | null; hint?: string; list?: string[] };

function addFieldSheet(wb: Workbook, name: string, fields: Field[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: "Isian", width: 32 },
    { header: "Isi", width: 50 },
    { header: "Petunjuk", width: 48 },
  ];
  styleHeader(ws);
  for (const f of fields) {
    const row = ws.addRow([f.label, f.value ?? "", f.hint ?? ""]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).font = { italic: true, color: { argb: "FF64748B" } };
    if (f.list) row.getCell(2).dataValidation = { type: "list", allowBlank: true, formulae: [`"${f.list.join(",")}"`] };
    if (f.value instanceof Date) row.getCell(2).numFmt = "dd-mm-yyyy";
  }
  return ws;
}

// Baca sheet "Isian | Isi" -> peta label (dinormalkan) ke nilai sel.
function readFieldSheet(ws: Worksheet | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>();
  ws?.eachRow((row, i) => {
    if (i > 1) out.set(key(text(row.getCell(1).value)), row.getCell(2).value);
  });
  return out;
}

// Sheet tabel dengan judul kolom di baris 1; dibaca berdasarkan judul kolom (urutan bebas).
type Col<T> = { header: string; width: number; get: (l: T) => string | number; money?: boolean };

function addTableSheet<T>(wb: Workbook, name: string, cols: Col<T>[], rows: T[], total?: string) {
  const ws = wb.addWorksheet(name);
  ws.columns = [...cols.map((c) => ({ header: c.header, width: c.width })), ...(total ? [{ header: "Total (otomatis)", width: 18 }] : [])];
  styleHeader(ws);
  const letter = (h: string) => String.fromCharCode(65 + cols.findIndex((c) => c.header === h));
  // Baris kosong cadangan supaya rumus total sudah ada saat diisi.
  const count = Math.max(rows.length + 10, 20);
  for (let i = 0; i < count; i++) {
    const r = ws.addRow(i < rows.length ? cols.map((c) => c.get(rows[i])) : []);
    cols.forEach((c, j) => c.money && (r.getCell(j + 1).numFmt = "#,##0"));
    if (total) {
      const n = r.number;
      const cell = r.getCell(cols.length + 1);
      cell.value = { formula: total.replace(/\{([^}]+)\}/g, (_, h: string) => `${letter(h)}${n}`) };
      cell.numFmt = "#,##0";
      cell.font = { color: { argb: "FF64748B" } };
    }
  }
}

function readTableSheet(ws: Worksheet | undefined): Map<string, unknown>[] {
  if (!ws) return [];
  const headers = new Map<number, string>();
  ws.getRow(1).eachCell((c, i) => headers.set(i, key(text(c.value))));
  const out: Map<string, unknown>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const m = new Map<string, unknown>();
    row.eachCell((c, j) => {
      const h = headers.get(j);
      if (h && !(typeof c.value === "object" && c.value && "formula" in c.value)) m.set(h, c.value);
    });
    if ([...m.values()].some((v) => text(v) !== "")) out.push(m);
  });
  return out;
}

const pick = (m: Map<string, unknown>, ...labels: string[]) => {
  for (const l of labels) if (m.has(key(l))) return m.get(key(l));
  return undefined;
};

// ---------- Peluang proyek ----------

const P = {
  type: "Jenis proyek",
  name: "Nama proyek",
  location: "Lokasi",
  partner: "Mitra",
  contact: "Kontak",
  source: "Asal peluang",
  description: "Data peluang",
  value: "Perkiraan nilai (Rp)",
  start: "Perkiraan mulai",
  pic: "PIC proyek (email)",
  category: "Kategori (Proyek lain)",
};

export async function downloadProjectTemplate(input: ProjectSheetInput, people: Person[]) {
  const wb = await newWorkbook();
  const pic = people.find((p) => p.id === input.pic_id);
  addFieldSheet(wb, "Peluang", [
    { label: P.type, value: TYPE_LABEL[input.type], hint: "Pilih dari daftar", list: PROJECT_TYPES.map((t) => TYPE_LABEL[t]) },
    { label: P.category, value: input.category, hint: "Hanya untuk Proyek lain: Aquatour, Webinar, Smallholder, Event P4G, dll." },
    { label: P.name, value: input.name, hint: "Wajib diisi" },
    { label: P.location, value: input.location },
    { label: P.partner, value: input.partner, hint: "Calon mitra / investor / pemberi dana / peserta" },
    { label: P.contact, value: input.contact, hint: "No. HP / WA / email" },
    { label: P.source, value: input.source, hint: "Referensi, event, inbound, dll." },
    { label: P.description, value: input.description, hint: "Latar belakang, kebutuhan, potensi, skala" },
    { label: P.value, value: input.estimated_value || "", hint: "Angka saja, mis. 25000000" },
    {
      label: P.start,
      value: input.estimated_start ? new Date(`${input.estimated_start}T00:00:00Z`) : "",
      hint: "Tanggal, mis. 15-12-2026",
    },
    { label: P.pic, value: pic?.email ?? pic?.full_name ?? "", hint: "Email karyawan (atau nama lengkap)" },
  ]);
  await download(wb, `template-peluang-proyek${input.name ? `-${input.name.slice(0, 40)}` : ""}.xlsx`);
}

// Mengembalikan isian form + peringatan (mis. PIC tidak dikenal). Isian kosong di file tidak mengubah form.
export async function readProjectFile(
  file: File,
  people: Person[],
): Promise<{ input: Partial<ProjectSheetInput>; warnings: string[] }> {
  const wb = await readWorkbook(file);
  const m = readFieldSheet(wb.getWorksheet("Peluang") ?? wb.worksheets[0]);
  if (!m.has(key(P.name))) throw new Error('Format tidak dikenali. Pakai file dari tombol "Unduh template".');
  const input: Partial<ProjectSheetInput> = {};
  const warnings: string[] = [];

  const typeText = key(text(m.get(key(P.type))));
  if (typeText) {
    const t = PROJECT_TYPES.find((x) => key(TYPE_LABEL[x]) === typeText || key(x) === typeText);
    if (t) input.type = t;
    else warnings.push(`Jenis proyek "${text(m.get(key(P.type)))}" tidak dikenal; jenis tidak diubah.`);
  }
  const fields = [
    ["name", P.name],
    ["location", P.location],
    ["partner", P.partner],
    ["contact", P.contact],
    ["source", P.source],
    ["description", P.description],
    ["category", P.category],
  ] as const;
  for (const [k, label] of fields) {
    const v = text(m.get(key(label)));
    if (v) input[k] = v;
  }
  const value = m.get(key(P.value));
  if (text(value)) input.estimated_value = Math.max(0, Math.round(num(value)));
  const start = m.get(key(P.start));
  if (text(start)) {
    const d = isoDate(start);
    if (d) input.estimated_start = d;
    else warnings.push(`Tanggal "${text(start)}" tidak dikenali; perkiraan mulai tidak diubah.`);
  }
  const picText = normalizeText(text(m.get(key(P.pic))));
  if (picText) {
    const p = people.find((x) => normalizeText(x.email ?? "") === picText || normalizeText(x.full_name) === picText);
    if (p) input.pic_id = p.id;
    else warnings.push(`PIC "${text(m.get(key(P.pic)))}" tidak ditemukan di daftar karyawan aktif; PIC tidak diubah.`);
  }
  return { input, warnings };
}

// ---------- Kelayakan finansial & RAB ----------

const COST_COLS: Col<CostLine>[] = [
  { header: "Uraian", width: 36, get: (l) => l.desc },
  { header: "Qty", width: 10, get: (l) => l.qty },
  { header: "Satuan", width: 12, get: (l) => l.uom },
  { header: "Volume", width: 10, get: (l) => l.volume },
  { header: "Harga satuan (Rp)", width: 18, get: (l) => l.price, money: true },
];
const NOTE_COL: Col<CostLine> = { header: "Keterangan", width: 30, get: (l) => l.note };
const CAPEX_COLS: Col<CapexLine>[] = [
  ...(COST_COLS as Col<CapexLine>[]),
  { header: "Harga sisa (Rp)", width: 16, get: (l) => l.salvage, money: true },
  { header: "Umur (bulan)", width: 12, get: (l) => l.lifetime_months },
  NOTE_COL as Col<CapexLine>,
];
const REVENUE_COLS: Col<RevenueLine>[] = [
  { header: "Komoditas", width: 14, get: (l) => l.commodity },
  { header: "Uraian", width: 36, get: (l) => l.desc },
  { header: "Qty", width: 10, get: (l) => l.qty },
  { header: "Satuan", width: 12, get: (l) => l.uom },
  { header: "Harga satuan (Rp)", width: 18, get: (l) => l.price, money: true },
  { header: "Keterangan", width: 30, get: (l) => l.note },
];
const COST_TOTAL = "ROUND({Qty}*IF({Volume}=\"\",1,{Volume})*{Harga satuan (Rp)},0)";

const SHEETS = { general: "Umum", capex: "Capex", workcap: "Modal kerja", opex: "Opex", revenue: "Pendapatan", timeline: "Jadwal" };

type FieldDef = { label: string; get: (d: RabData) => string | number; set: (d: RabData, v: unknown) => void; hint?: string };
const str = (v: unknown) => text(v);
const RAB_FIELDS: FieldDef[] = [
  ...(
    [
      ["project_name", "Nama proyek"],
      ["location", "Lokasi"],
      ["period", "Periode proyek"],
      ["commodity", "Komoditas / produk / kegiatan"],
      ["ponds", "Jumlah kolam / unit / peserta"],
      ["area_per_pond", "Luas per kolam / keterangan skala"],
    ] as const
  ).map(([k, label]) => ({ label, get: (d: RabData) => d.general[k], set: (d: RabData, v: unknown) => (d.general[k] = str(v)) })),
  { label: "Komoditas budidaya", get: (d) => d.commodity.name, set: (d, v) => (d.commodity.name = str(v)), hint: "Isi bila ada budidaya" },
  ...(
    [
      ["area_m2", "Luas (m2)"],
      ["density", "Kepadatan (ekor/m2)"],
      ["survival_pct", "Survival rate (%)"],
      ["size_per_kg", "Ukuran (ekor/kg)"],
      ["fcr", "FCR"],
      ["cycle_months", "Siklus (bulan)"],
      ["cycles_per_year", "Siklus per tahun"],
    ] as const
  ).map(([k, label]) => ({ label, get: (d: RabData) => d.commodity[k], set: (d: RabData, v: unknown) => (d.commodity[k] = num(v)) })),
  ...(
    [
      ["bonus_pct", "Bonus tim teknis (% laba kotor)"],
      ["zakat_pct", "Zakat / dana sosial (%)"],
      ["investor_pct", "Bagian investor (%)"],
    ] as const
  ).map(([k, label]) => ({ label, get: (d: RabData) => d.params[k], set: (d: RabData, v: unknown) => (d.params[k] = Math.min(100, num(v))) })),
  { label: "Satuan BEP", get: (d) => d.params.bep_unit, set: (d, v) => (d.params.bep_unit = str(v)), hint: "mis. kg (sama dengan satuan di sheet Pendapatan)" },
  { label: "Kesimpulan / ringkasan", get: (d) => d.summary, set: (d, v) => (d.summary = str(v)) },
];
const TITLE_LABEL = "Judul paket";

export async function downloadRabTemplate(title: string, d: RabData, prefix = "template-rab") {
  const wb = await newWorkbook();
  addFieldSheet(wb, SHEETS.general, [
    { label: TITLE_LABEL, value: title },
    ...RAB_FIELDS.map((f) => ({ label: f.label, value: f.get(d) === 0 ? "" : f.get(d), hint: f.hint })),
  ]);
  addTableSheet(wb, SHEETS.capex, CAPEX_COLS, d.capex, COST_TOTAL);
  addTableSheet(wb, SHEETS.workcap, [...COST_COLS, NOTE_COL], d.workcap, COST_TOTAL);
  addTableSheet(wb, SHEETS.opex, [...COST_COLS, NOTE_COL], d.opex, COST_TOTAL);
  addTableSheet(wb, SHEETS.revenue, REVENUE_COLS, d.revenue, "ROUND({Qty}*{Harga satuan (Rp)},0)");
  addTableSheet(
    wb,
    SHEETS.timeline,
    [
      { header: "Kegiatan", width: 40, get: (t: RabData["timeline"][number]) => t.activity },
      { header: "Waktu", width: 20, get: (t: RabData["timeline"][number]) => t.when },
    ],
    d.timeline,
  );
  await download(wb, `${prefix}${title ? `-${title.slice(0, 40)}` : ""}.xlsx`);
}

// Seluruh isi paket diganti dengan isi file (project_id tetap). Isian umum yang kosong di file tidak mengubah form.
export async function readRabFile(file: File, base: RabData, baseTitle: string): Promise<{ title: string; data: RabData }> {
  const wb = await readWorkbook(file);
  const general = wb.getWorksheet(SHEETS.general);
  if (!general || !wb.getWorksheet(SHEETS.capex)) throw new Error('Format tidak dikenali. Pakai file dari tombol "Unduh template".');
  const d: RabData = structuredClone(base);
  const m = readFieldSheet(general);
  for (const f of RAB_FIELDS) {
    const v = m.get(key(f.label));
    if (text(v) !== "") f.set(d, v);
  }
  const title = text(m.get(key(TITLE_LABEL))) || baseTitle;

  const cost = (r: Map<string, unknown>): CostLine => ({
    desc: text(pick(r, "Uraian")),
    qty: num(pick(r, "Qty")),
    uom: text(pick(r, "Satuan")),
    volume: text(pick(r, "Volume")) === "" ? 1 : num(pick(r, "Volume")),
    price: Math.round(num(pick(r, "Harga satuan (Rp)", "Harga satuan"))),
    note: text(pick(r, "Keterangan")),
  });
  d.capex = readTableSheet(wb.getWorksheet(SHEETS.capex)).map((r) => ({
    ...cost(r),
    salvage: Math.round(num(pick(r, "Harga sisa (Rp)", "Harga sisa"))),
    lifetime_months: num(pick(r, "Umur (bulan)", "Umur")),
  }));
  d.workcap = readTableSheet(wb.getWorksheet(SHEETS.workcap)).map(cost);
  d.opex = readTableSheet(wb.getWorksheet(SHEETS.opex)).map(cost);
  d.revenue = readTableSheet(wb.getWorksheet(SHEETS.revenue)).map((r) => ({
    commodity: text(pick(r, "Komoditas")),
    desc: text(pick(r, "Uraian")),
    qty: num(pick(r, "Qty")),
    uom: text(pick(r, "Satuan")),
    price: Math.round(num(pick(r, "Harga satuan (Rp)", "Harga satuan"))),
    note: text(pick(r, "Keterangan")),
  }));
  d.timeline = readTableSheet(wb.getWorksheet(SHEETS.timeline)).map((r) => ({ activity: text(pick(r, "Kegiatan")), when: text(pick(r, "Waktu")) }));
  return { title, data: d };
}
