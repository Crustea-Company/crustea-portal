// Ekspor–ubah–impor massal lewat Excel: bagian murni (tanpa database) yang dipakai semua modul.
// Alur: buildWorkbook (ekspor) -> orang mengubah di Excel -> parseWorkbook (baca) -> diffRows (pratinjau perubahan).
// Tidak ada yang tersimpan di sini; penerapan ke database dilakukan modul lewat aksi yang sudah ada.
import { normalizeText } from "./search";
import { isoDate, key, loadWorkbook, newWorkbook, num, styleHeader, text, type Workbook, type Worksheet } from "./xlsx-core";

export const MAX_BULK_ROWS = 1000;
export const ID_HEADER = "ID";
export const DELETE_HEADER = "Hapus";
export const DELETE_WORD = "HAPUS";
const DATA_SHEET = "Data";
const GUIDE_SHEET = "Petunjuk";
const ORIGIN_SHEET = "_asal";
const CHOICE_SHEET = "_pilihan";
const ORIGIN_HEADER_ROW = 5; // baris judul di lembar _asal (baris 1-3 = keterangan)

export type ColumnKind = "text" | "date" | "number" | "bool" | "choice" | "people";

export type ColumnDef<T> = {
  header: string;
  kind: ColumnKind;
  // Nilai untuk ekspor: teks/angka, tanggal "YYYY-MM-DD", boolean, atau daftar nama (people).
  get: (row: T) => string | number | boolean | string[] | null | undefined;
  readOnly?: boolean; // hanya untuk dibaca: berwarna abu-abu, diabaikan saat impor
  choices?: string[]; // untuk kind "choice"
  required?: boolean; // wajib terisi untuk baris baru / yang diubah
  addOnly?: boolean; // hanya diisi untuk baris baru; di baris yang sudah ada diabaikan (mis. Program milestone)
  width?: number;
};

export type SheetDef<T> = {
  kind: string; // nama jenis file, mis. "tugas"; dicek saat impor agar file tidak tertukar modul
  title: string; // untuk lembar Petunjuk
  id: (row: T) => string;
  columns: ColumnDef<T>[];
  allowDelete: boolean; // false = tidak ada kolom Hapus
  allowAdd?: boolean; // false = baris baru (ID kosong) ditolak; bawaan true
  // Kolom yang dikunci untuk satu baris yang sudah ada (mis. produk/nilai setelah closing); perubahannya diabaikan dengan catatan.
  lockedColumns?: (current: RowValues) => string[];
  labelHeader?: string; // kolom yang dipakai sebagai pengenal baris di pratinjau (bawaan: kolom teks pertama yang bisa diubah)
  instructions?: string[]; // baris tambahan di lembar Petunjuk
};

export type ExportMeta = { exportedAt: string; exportedBy: string };

// Nilai satu baris dalam bentuk kanonik (semuanya teks), kunci = judul kolom.
export type RowValues = Record<string, string>;

export type ParsedRow = {
  line: number; // nomor baris di Excel
  id: string; // "" = baris baru
  values: RowValues; // hanya kolom yang ada di file
  cellErrors: Record<string, string>; // kolom -> alasan salah isi
  hapus: string; // isi kolom Hapus (teks apa adanya)
};

export type ParsedSheet = {
  rows: ParsedRow[];
  original: Map<string, RowValues> | null; // null = lembar _asal tidak ada
  meta: (ExportMeta & { kind: string }) | null;
  presentColumns: Set<string>; // judul kolom (bukan bacaan-saja) yang ada di file
  warnings: string[];
};

export type Person = { id: string; name: string };

export type Change = { col: string; from: string; to: string; ids?: string[] };

export type DiffAction = "add" | "update" | "delete" | "none" | "conflict" | "error";

export type DiffItem = {
  action: DiffAction;
  id: string;
  line: number;
  label: string; // pengenal singkat untuk pratinjau (kolom pertama yang bukan ID)
  changes: Change[];
  problems: string[];
  // Nilai lengkap setelah perubahan = nilai portal saat ini + perubahan dari file (tidak menimpa kolom lain). Kosong untuk delete/none/error.
  target?: RowValues;
};

export type ApplyResult = { id: string; line: number; label: string; status: "ok" | "skipped" | "failed"; message: string };

// ---------- Nilai kanonik ----------

const TRUE_WORDS = new Set(["ya", "y", "yes", "true", "1", "x", "v", "benar"]);
const FALSE_WORDS = new Set(["", "tidak", "t", "no", "n", "false", "0"]);

function splitNames(s: string): string[] {
  return s
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Kunci pembanding untuk daftar orang: urutan tidak penting.
const peopleKey = (s: string) =>
  splitNames(s)
    .map((n) => normalizeText(n))
    .sort()
    .join("|");

export function sameValue(kind: ColumnKind, a: string, b: string): boolean {
  if (kind === "people") return peopleKey(a) === peopleKey(b);
  if (kind === "text") return a.trim() === b.trim();
  return a === b;
}

// Ubah isi sel (dari Excel) menjadi nilai kanonik; error bila tidak bisa dipahami.
function canonicalCell<T>(col: ColumnDef<T>, raw: unknown): { value: string; error?: string } {
  const t = text(raw);
  switch (col.kind) {
    case "text":
      return { value: t };
    case "people":
      return { value: splitNames(t).join("; ") };
    case "date": {
      if (t === "") return { value: "" };
      const d = isoDate(raw);
      return d ? { value: d } : { value: t, error: `Tanggal "${t}" tidak dikenali (pakai mis. 15-12-2026).` };
    }
    case "number": {
      if (t === "") return { value: "" };
      if (!/\d/.test(t)) return { value: t, error: `Angka "${t}" tidak dikenali.` };
      return { value: String(num(raw)) };
    }
    case "bool": {
      const k = normalizeText(t);
      if (TRUE_WORDS.has(k)) return { value: "Ya" };
      if (FALSE_WORDS.has(k)) return { value: "Tidak" };
      return { value: t, error: `"${t}" bukan Ya/Tidak.` };
    }
    case "choice": {
      if (t === "") return { value: "" };
      const found = (col.choices ?? []).find((c) => key(c) === key(t));
      return found ? { value: found } : { value: t, error: `"${t}" bukan salah satu pilihan.` };
    }
  }
}

// Nilai baris data portal -> bentuk kanonik (sama dengan hasil canonicalCell, tanpa error).
export function rowValues<T>(def: SheetDef<T>, row: T): RowValues {
  const out: RowValues = {};
  for (const col of def.columns) {
    const v = col.get(row);
    if (col.kind === "people") out[col.header] = (Array.isArray(v) ? v : splitNames(String(v ?? ""))).map((x) => x.trim()).filter(Boolean).join("; ");
    else if (col.kind === "bool") out[col.header] = v === true || (typeof v === "string" && TRUE_WORDS.has(normalizeText(v))) ? "Ya" : "Tidak";
    else if (col.kind === "number") out[col.header] = v == null || v === "" ? "" : String(Number(v));
    else out[col.header] = v == null ? "" : String(v).trim();
  }
  return out;
}

// ---------- Ekspor ----------

function applyChoiceList(wb: Workbook, ws: Worksheet, colIndex: number, rowCount: number, list: string[], listSlot: { next: number }) {
  let formula = `"${list.join(",")}"`;
  if (formula.length > 250 || list.some((x) => x.includes(","))) {
    // Daftar panjang: simpan di lembar tersembunyi dan rujuk dari sana.
    const cs = wb.getWorksheet(CHOICE_SHEET) ?? wb.addWorksheet(CHOICE_SHEET);
    cs.state = "hidden";
    const c = listSlot.next++;
    list.forEach((v, i) => (cs.getCell(i + 1, c).value = v));
    const letter = cs.getColumn(c).letter;
    formula = `${CHOICE_SHEET}!$${letter}$1:$${letter}$${list.length}`;
  }
  for (let r = 2; r <= rowCount; r++) {
    ws.getCell(r, colIndex).dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
  }
}

export async function buildWorkbook<T>(def: SheetDef<T>, rows: T[], meta: ExportMeta): Promise<Workbook> {
  if (rows.length > MAX_BULK_ROWS) throw new Error(`Terlalu banyak baris (${rows.length}); maksimal ${MAX_BULK_ROWS} per file. Persempit filter dulu.`);
  const wb = await newWorkbook();
  const ws = wb.addWorksheet(DATA_SHEET);
  const cols = def.columns;
  const headers = [ID_HEADER, ...cols.map((c) => c.header), ...(def.allowDelete ? [DELETE_HEADER] : [])];
  ws.columns = headers.map((h) => ({ header: h, width: h === ID_HEADER ? 38 : (cols.find((c) => c.header === h)?.width ?? (h === DELETE_HEADER ? 10 : 18)) }));
  styleHeader(ws);

  const gray = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE2E8F0" } };
  const values = rows.map((r) => rowValues(def, r));
  rows.forEach((r, i) => {
    const v = values[i];
    const out = ws.addRow([
      def.id(r),
      ...cols.map((c) => {
        const x = v[c.header];
        if (x === "") return "";
        if (c.kind === "date") return new Date(`${x}T00:00:00Z`);
        if (c.kind === "number") return Number(x);
        return x;
      }),
      ...(def.allowDelete ? [""] : []),
    ]);
    out.getCell(1).fill = gray;
    cols.forEach((c, j) => {
      const cell = out.getCell(j + 2);
      if (c.kind === "date") cell.numFmt = "dd-mm-yyyy";
      if (c.readOnly) cell.fill = gray;
    });
  });

  // Baris cadangan (untuk menambah baris baru) dan pilihan dropdown.
  const lastRow = rows.length + 1 + 50;
  const slot = { next: 1 };
  cols.forEach((c, j) => {
    const idx = j + 2;
    if (c.readOnly) return;
    if (c.kind === "choice" && c.choices?.length) applyChoiceList(wb, ws, idx, lastRow, c.choices, slot);
    if (c.kind === "bool") applyChoiceList(wb, ws, idx, lastRow, ["Ya", "Tidak"], slot);
    if (c.kind === "date") for (let r = rows.length + 2; r <= lastRow; r++) ws.getCell(r, idx).numFmt = "dd-mm-yyyy";
  });

  // Lembar Petunjuk.
  const guide = wb.addWorksheet(GUIDE_SHEET);
  guide.getColumn(1).width = 110;
  const lines = [
    `Ekspor ${def.title}`,
    `Diekspor ${meta.exportedAt} oleh ${meta.exportedBy}.`,
    "",
    "Cara memakai:",
    "1. Ubah isi sel di lembar Data, lalu simpan sebagai .xlsx dan impor kembali lewat tombol \"Impor Excel\" di aplikasi.",
    def.allowAdd === false ? "2. Kolom ID (abu-abu) jangan diubah. Menambah baris baru tidak bisa lewat file ini." : "2. Kolom ID (abu-abu) jangan diubah. Baris dengan ID kosong = baris BARU.",
    "3. Kolom berwarna abu-abu hanya untuk dibaca; perubahannya diabaikan.",
    "4. Jangan menghapus atau mengubah lembar tersembunyi \"_asal\" dan \"_pilihan\": lembar itu dipakai untuk mendeteksi perubahan orang lain.",
    "5. Tanggal ditulis seperti 15-12-2026 (atau sel tanggal biasa). Beberapa nama orang dipisah titik koma (;), memakai nama lengkap.",
    ...(def.allowDelete
      ? [`6. Untuk menghapus: isi kolom ${DELETE_HEADER} dengan kata ${DELETE_WORD}. Menghapus dari file hanya dengan cara ini; baris yang dihapus dari Excel TIDAK ikut terhapus di aplikasi.`]
      : ["6. Menghapus data tidak bisa lewat file ini."]),
    "7. Tidak ada yang tersimpan sebelum Anda menekan \"Terapkan\" di halaman pratinjau aplikasi.",
    "",
    "Untuk Claude / asisten lain yang mengubah file ini: ubah hanya sel di kolom yang boleh diubah, jangan ubah kolom ID, jangan hapus lembar _asal, jangan menghapus baris (pakai kolom Hapus bila diminta).",
    ...(def.instructions ?? []),
  ];
  lines.forEach((l, i) => {
    const c = guide.getCell(i + 1, 1);
    c.value = l;
    c.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  // Lembar _asal: salinan nilai saat ekspor (untuk mendeteksi bentrok).
  const origin = wb.addWorksheet(ORIGIN_SHEET);
  origin.state = "hidden";
  origin.getCell(1, 1).value = "jenis";
  origin.getCell(1, 2).value = def.kind;
  origin.getCell(2, 1).value = "diekspor_pada";
  origin.getCell(2, 2).value = meta.exportedAt;
  origin.getCell(3, 1).value = "pengekspor";
  origin.getCell(3, 2).value = meta.exportedBy;
  origin.getCell(ORIGIN_HEADER_ROW, 1).value = ID_HEADER;
  cols.forEach((c, j) => (origin.getCell(ORIGIN_HEADER_ROW, j + 2).value = c.header));
  rows.forEach((r, i) => {
    const rowNo = ORIGIN_HEADER_ROW + 1 + i;
    origin.getCell(rowNo, 1).value = def.id(r);
    cols.forEach((c, j) => {
      const cell = origin.getCell(rowNo, j + 2);
      cell.numFmt = "@";
      cell.value = values[i][c.header];
    });
  });
  return wb;
}

// ---------- Baca ----------

export async function parseWorkbook<T>(def: SheetDef<T>, source: File | ArrayBuffer | Uint8Array): Promise<ParsedSheet> {
  let wb: Workbook;
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) wb = await loadWorkbook(source);
  else {
    if (source.size > 5_000_000) throw new Error("File terlalu besar (maks. 5 MB).");
    wb = await loadWorkbook(await source.arrayBuffer());
  }
  const ws = wb.getWorksheet(DATA_SHEET);
  if (!ws) throw new Error(`Lembar "${DATA_SHEET}" tidak ditemukan. Pakai file hasil tombol "Ekspor Excel".`);

  const headerCols = new Map<string, number>(); // key(judul) -> nomor kolom
  ws.getRow(1).eachCell((c, i) => {
    const k = key(text(c.value));
    if (k && !headerCols.has(k)) headerCols.set(k, i);
  });
  const idCol = headerCols.get(key(ID_HEADER));
  if (!idCol) throw new Error(`Kolom "${ID_HEADER}" tidak ditemukan di lembar Data. Pakai file hasil tombol "Ekspor Excel".`);
  const delCol = def.allowDelete ? headerCols.get(key(DELETE_HEADER)) : undefined;

  const editable = def.columns.filter((c) => !c.readOnly);
  const present = new Set<string>();
  const warnings: string[] = [];
  for (const c of editable) {
    if (headerCols.has(key(c.header))) present.add(c.header);
    else warnings.push(`Kolom "${c.header}" tidak ada di file; kolom itu tidak diubah.`);
  }

  // Meta & salinan asal.
  const originWs = wb.getWorksheet(ORIGIN_SHEET);
  let meta: ParsedSheet["meta"] = null;
  let original: Map<string, RowValues> | null = null;
  if (originWs && text(originWs.getCell(ORIGIN_HEADER_ROW, 1).value) === ID_HEADER) {
    const kind = text(originWs.getCell(1, 2).value);
    if (kind && kind !== def.kind) throw new Error(`File ini untuk "${kind}", bukan untuk "${def.kind}". Impor dari halaman yang sesuai.`);
    meta = { kind, exportedAt: text(originWs.getCell(2, 2).value), exportedBy: text(originWs.getCell(3, 2).value) };
    const oCols = new Map<string, number>();
    originWs.getRow(ORIGIN_HEADER_ROW).eachCell((c, i) => oCols.set(key(text(c.value)), i));
    original = new Map();
    for (let r = ORIGIN_HEADER_ROW + 1; r <= originWs.rowCount; r++) {
      const id = text(originWs.getCell(r, 1).value);
      if (!id) continue;
      const v: RowValues = {};
      for (const c of def.columns) {
        const ci = oCols.get(key(c.header));
        v[c.header] = ci ? canonicalCell(c, originWs.getCell(r, ci).value).value : "";
      }
      original.set(id, v);
    }
  } else {
    warnings.push('Lembar "_asal" tidak ada: perubahan orang lain di aplikasi sejak ekspor TIDAK bisa dideteksi. Periksa pratinjau dengan teliti.');
  }

  const rows: ParsedRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const id = text(ws.getCell(r, idCol).value);
    const hapus = delCol ? text(ws.getCell(r, delCol).value) : "";
    const values: RowValues = {};
    const cellErrors: Record<string, string> = {};
    let anyContent = id !== "" || hapus !== "";
    for (const c of editable) {
      if (!present.has(c.header)) continue;
      const raw = ws.getCell(r, headerCols.get(key(c.header))!).value;
      const res = canonicalCell(c, raw);
      values[c.header] = res.value;
      if (res.error) cellErrors[c.header] = res.error;
      if (text(raw) !== "") anyContent = true;
    }
    if (!anyContent) continue;
    rows.push({ line: r, id, values, cellErrors, hapus });
  }
  if (rows.length > MAX_BULK_ROWS) throw new Error(`File berisi ${rows.length} baris; maksimal ${MAX_BULK_ROWS} per file.`);
  return { rows, original, meta, presentColumns: present, warnings };
}

// ---------- Bandingkan ----------

// Cocokkan nama (dipisah ";") ke daftar orang. Nama tak dikenal / ganda = masalah (tidak menebak).
export function resolvePeople(value: string, people: Person[]): { ids: string[]; problems: string[] } {
  const ids: string[] = [];
  const problems: string[] = [];
  for (const name of splitNames(value)) {
    const k = normalizeText(name);
    const hits = people.filter((p) => normalizeText(p.name) === k);
    if (hits.length === 1) {
      if (!ids.includes(hits[0].id)) ids.push(hits[0].id);
    } else if (hits.length === 0) problems.push(`Nama "${name}" tidak dikenal.`);
    else problems.push(`Nama "${name}" ada lebih dari satu; tulis lebih lengkap.`);
  }
  return { ids, problems };
}

function labelOf<T>(def: SheetDef<T>, v: RowValues): string {
  if (def.labelHeader && v[def.labelHeader]) return v[def.labelHeader];
  const first = def.columns.find((c) => !c.readOnly && c.kind === "text") ?? def.columns[0];
  return (first && v[first.header]) || "";
}

export function diffRows<T>(
  def: SheetDef<T>,
  parsed: Pick<ParsedSheet, "rows" | "original" | "presentColumns">,
  current: Map<string, RowValues>,
  opts: { people?: Person[] } = {},
): DiffItem[] {
  const editable = def.columns.filter((c) => !c.readOnly);
  const existingCols = editable.filter((c) => !c.addOnly); // kolom yang boleh berubah di baris yang sudah ada
  const people = opts.people ?? [];
  const seen = new Map<string, number[]>();
  for (const r of parsed.rows) if (r.id) seen.set(r.id, [...(seen.get(r.id) ?? []), r.line]);

  // Validasi sel yang terlibat (berubah / baris baru): wajib isi, orang dikenal, salah isi dari parse.
  function validate(row: ParsedRow, cols: ColumnDef<T>[], isNew: boolean): { problems: string[]; ids: Record<string, string[]> } {
    const problems: string[] = [];
    const ids: Record<string, string[]> = {};
    for (const c of cols) {
      const v = row.values[c.header] ?? "";
      if (row.cellErrors[c.header]) problems.push(`${c.header}: ${row.cellErrors[c.header]}`);
      else if (c.kind === "people" && v) {
        const res = resolvePeople(v, people);
        problems.push(...res.problems.map((p) => `${c.header}: ${p}`));
        ids[c.header] = res.ids;
      }
      if (c.required && (isNew || row.values[c.header] !== undefined) && v === "") problems.push(`${c.header}: wajib diisi.`);
    }
    return { problems, ids };
  }

  return parsed.rows.map((row): DiffItem => {
    const base = { id: row.id, line: row.line, label: labelOf(def, row.values) };
    const dupLines = row.id ? seen.get(row.id)! : [];
    if (dupLines.length > 1) {
      return { ...base, action: "error", changes: [], problems: [`ID sama muncul di baris ${dupLines.join(", ")}. Satu ID hanya boleh sekali.`] };
    }
    const wantsDelete = row.hapus !== "";
    if (wantsDelete && normalizeText(row.hapus) !== normalizeText(DELETE_WORD)) {
      return { ...base, action: "error", changes: [], problems: [`Kolom ${DELETE_HEADER} harus berisi kata ${DELETE_WORD} atau dikosongkan.`] };
    }

    // Baris baru.
    if (!row.id) {
      if (wantsDelete) return { ...base, action: "none", changes: [], problems: ["Baris baru ditandai HAPUS: diabaikan."] };
      if (def.allowAdd === false) return { ...base, action: "error", changes: [], problems: ["Menambah baris baru tidak bisa lewat file ini. Kosongkan baris ini."] };
      const cols = editable.filter((c) => present(parsed.presentColumns, c));
      const { problems, ids } = validate(row, editable, true);
      const changes: Change[] = cols
        .filter((c) => (row.values[c.header] ?? "") !== "")
        .map((c) => ({ col: c.header, from: "", to: row.values[c.header], ...(ids[c.header] ? { ids: ids[c.header] } : {}) }));
      if (problems.length) return { ...base, action: "error", changes, problems };
      const target: RowValues = {};
      for (const c of def.columns) target[c.header] = row.values[c.header] ?? (c.kind === "bool" ? "Tidak" : "");
      return { ...base, action: "add", changes, problems: [], target };
    }

    const cur = current.get(row.id);
    const orig = parsed.original?.get(row.id);
    if (!cur) {
      if (orig) return { ...base, action: "conflict", changes: [], problems: ["Data ini sudah tidak ada di aplikasi (dihapus orang lain)."] };
      return { ...base, action: "error", changes: [], problems: ["ID tidak dikenal (tidak ada di aplikasi). Jangan mengetik ID sendiri; kosongkan ID untuk baris baru."] };
    }
    const baseLabel = labelOf(def, cur) || base.label;
    const b = { ...base, label: baseLabel };
    const baseline = orig ?? cur;

    // Hapus.
    if (wantsDelete) {
      if (!def.allowDelete) return { ...b, action: "error", changes: [], problems: ["Menghapus tidak bisa lewat file ini."] };
      if (orig) {
        const changed = existingCols.filter((c) => !sameValue(c.kind, orig[c.header] ?? "", cur[c.header] ?? ""));
        if (changed.length) {
          return { ...b, action: "conflict", changes: [], problems: [`Data ini diubah di aplikasi sejak ekspor (${changed.map((c) => c.header).join(", ")}); tidak dihapus otomatis.`] };
        }
      }
      return { ...b, action: "delete", changes: [], problems: [] };
    }

    // Ubah: hanya kolom yang berbeda dari salinan asal (atau dari nilai portal bila tanpa _asal).
    const locked = new Set(def.lockedColumns?.(cur) ?? []);
    const isChanged = (c: ColumnDef<T>) => present(parsed.presentColumns, c) && !sameValue(c.kind, row.values[c.header] ?? "", baseline[c.header] ?? "");
    const lockedTouched = existingCols.filter((c) => locked.has(c.header) && isChanged(c));
    const lockNote = lockedTouched.length ? [`Kolom ${lockedTouched.map((c) => c.header).join(", ")} dikunci untuk baris ini (ubah di aplikasi); perubahannya diabaikan.`] : [];
    const diffCols = existingCols.filter((c) => !locked.has(c.header) && isChanged(c));
    if (diffCols.length === 0) return lockNote.length ? { ...b, action: "error", changes: [], problems: lockNote } : { ...b, action: "none", changes: [], problems: [] };

    const { problems, ids } = validate(row, diffCols, false);
    const changes: Change[] = [];
    const conflicts: string[] = [];
    for (const c of diffCols) {
      const to = row.values[c.header] ?? "";
      const now = cur[c.header] ?? "";
      if (sameValue(c.kind, to, now)) continue; // portal sudah bernilai itu
      if (orig && !sameValue(c.kind, orig[c.header] ?? "", now)) {
        conflicts.push(`${c.header}: di aplikasi sekarang "${now}", file ingin "${to}" (saat ekspor "${orig[c.header] ?? ""}").`);
        continue;
      }
      changes.push({ col: c.header, from: now, to, ...(ids[c.header] ? { ids: ids[c.header] } : {}) });
    }
    if (problems.length) return { ...b, action: "error", changes, problems };
    if (conflicts.length) return { ...b, action: "conflict", changes, problems: conflicts };
    if (changes.length === 0) return { ...b, action: "none", changes: [], problems: [] };
    const target: RowValues = { ...cur };
    for (const ch of changes) target[ch.col] = ch.to;
    return { ...b, action: "update", changes, problems: lockNote, target };
  });
}

const present = <T>(set: Set<string>, c: ColumnDef<T>) => set.has(c.header);

export function summarize(items: DiffItem[]): Record<DiffAction, number> {
  const out: Record<DiffAction, number> = { add: 0, update: 0, delete: 0, none: 0, conflict: 0, error: 0 };
  for (const i of items) out[i.action]++;
  return out;
}

export const ACTION_LABEL: Record<DiffAction, string> = {
  add: "Tambah",
  update: "Ubah",
  delete: "Hapus",
  none: "Tidak berubah",
  conflict: "Bentrok",
  error: "Salah isi",
};
