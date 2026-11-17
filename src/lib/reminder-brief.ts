// Inti Reminder (morning brief): fungsi murni tanpa akses database.
// Pemuat data ada di reminder-brief-data.ts; tampilan di komponen terpisah.
import { DEPT_ORDER } from "@/lib/kpi";

export type FlashKind = "task" | "milestone" | "program" | "request";

export type FlashItem = {
  kind: FlashKind;
  id: string;
  code: string; // dipakai hanya untuk pengajuan (mis. PP-0012)
  title: string; // untuk pengajuan: nama jenis form, bukan judul bebas
  dept_code: string;
  people: string[]; // nama
  due: string; // YYYY-MM-DD
  href: string;
  waitingOn?: string; // khusus pengajuan: tahap yang ditunggu
};

export type Bucket = "late" | "today" | "tomorrow" | "soon";
export type BucketOrOld = Bucket | "old";

// Label tampilan di Reminder saja; kode di database tidak berubah.
export const DEPT_SHORT: Record<string, string> = {
  MGT: "Management",
  CA: "Corporate",
  FA: "Finance",
  BDS: "Busdev & Sales",
  DM: "DigiMar",
  AQ: "Aquaculture",
  TO: "TechOps",
  PROGRAM: "Program", // milestone/program tanpa PIC departemen
};

export function deptShort(code: string): string {
  return DEPT_SHORT[code] ?? code;
}

export const LATE_WINDOW_DAYS = 7;
export const SOON_WINDOW_DAYS = 3;
export const MAX_MESSAGE_LENGTH = 3500;
export const DEFAULT_BASE_URL = "https://internal.crustea.id";

const BUCKET_ORDER: Bucket[] = ["late", "today", "tomorrow", "soon"];
const BUCKET_HEADING: Record<Bucket, string> = {
  late: "🔴 Terlambat",
  today: "🟠 Hari ini",
  tomorrow: "🟡 Besok",
  soon: "🟢 2-3 hari lagi",
};

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Selisih hari kalender: positif bila `due` setelah `today`. */
export function daysUntil(due: string, today: string): number {
  return Math.round((parseDay(due) - parseDay(today)) / 86_400_000);
}

/** Tambah (atau kurangi, bila negatif) hari pada tanggal YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  return new Date(parseDay(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Alamat dasar untuk tautan di teks WhatsApp. */
export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** "Senin, 16 Nov 2026" */
export function formatDayLong(iso: string): string {
  const t = new Date(parseDay(iso));
  return `${DAY_NAMES[t.getUTCDay()]}, ${t.getUTCDate()} ${MONTH_NAMES[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

export function bucketOf(due: string, today: string): BucketOrOld | null {
  const diff = daysUntil(due, today);
  if (diff < -LATE_WINDOW_DAYS) return "old";
  if (diff < 0) return "late";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= SOON_WINDOW_DAYS) return "soon";
  return null;
}

export type DeptGroup = {
  dept: string;
  label: string;
  buckets: Record<Bucket, FlashItem[]>;
  oldCount: number;
};

function deptRank(code: string): number {
  const i = DEPT_ORDER.indexOf(code);
  return i === -1 ? DEPT_ORDER.length : i;
}

export function groupFlash(items: FlashItem[], today: string): DeptGroup[] {
  const map = new Map<string, DeptGroup>();
  for (const item of items) {
    const bucket = bucketOf(item.due, today);
    if (bucket === null) continue;
    let g = map.get(item.dept_code);
    if (!g) {
      g = {
        dept: item.dept_code,
        label: deptShort(item.dept_code),
        buckets: { late: [], today: [], tomorrow: [], soon: [] },
        oldCount: 0,
      };
      map.set(item.dept_code, g);
    }
    if (bucket === "old") g.oldCount += 1;
    else g.buckets[bucket].push(item);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    for (const b of BUCKET_ORDER) {
      g.buckets[b].sort(
        (a, c) => a.due.localeCompare(c.due) || a.title.localeCompare(c.title, "id"),
      );
    }
  }
  groups.sort((a, b) => {
    const r = deptRank(a.dept) - deptRank(b.dept);
    return r !== 0 ? r : a.dept.localeCompare(b.dept);
  });
  return groups;
}

export function bucketHeading(b: Bucket): string {
  return BUCKET_HEADING[b];
}

export const BUCKETS = BUCKET_ORDER;

function lateText(due: string, today: string): string {
  const n = -daysUntil(due, today);
  return `lewat ${n} hari`;
}

function slaText(due: string, today: string): string {
  const diff = daysUntil(due, today);
  if (diff < 0) return `SLA lewat ${-diff} hari`;
  if (diff === 0) return "SLA hari ini";
  if (diff === 1) return "SLA besok";
  return `SLA ${diff} hari lagi`;
}

/** Satu baris WhatsApp untuk satu pekerjaan (tanpa kode kecuali pengajuan; tanpa rupiah). */
export function itemLine(item: FlashItem, today: string): string {
  if (item.kind === "request") {
    const wait = item.waitingOn ? ` — menunggu: ${item.waitingOn}` : "";
    return `• ${item.code} ${item.title}${wait} (${slaText(item.due, today)})`;
  }
  const prefix =
    item.kind === "milestone" ? "Milestone: " : item.kind === "program" ? "Program: " : "";
  const who = item.people.length ? ` — ${item.people.join(", ")}` : "";
  const late = daysUntil(item.due, today) < 0 ? ` (${lateText(item.due, today)})` : "";
  return `• ${prefix}${item.title}${who}${late}`;
}

function groupBlock(g: DeptGroup, today: string): string {
  const lines: string[] = [`*${g.label}*`];
  for (const b of BUCKET_ORDER) {
    const list = g.buckets[b];
    if (!list.length) continue;
    lines.push(BUCKET_HEADING[b]);
    for (const it of list) lines.push(itemLine(it, today));
  }
  if (g.oldCount > 0) {
    lines.push(`_+${g.oldCount} pekerjaan terlambat lebih dari ${LATE_WINDOW_DAYS} hari_`);
  }
  return lines.join("\n");
}

function footerBlock(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return [
    "*Jangan lupa cek juga*",
    `Lead penjualan: ${base}/penjualan`,
    `Project: ${base}/projects`,
    `Semua tugas: ${base}/tugas`,
  ].join("\n");
}

function splitLongBlock(block: string, max: number): string[] {
  if (block.length <= max) return [block];
  const lines = block.split("\n");
  const heading = lines[0];
  const out: string[] = [];
  let cur = heading;
  for (const line of lines.slice(1)) {
    if (cur.length + 1 + line.length > max && cur !== heading) {
      out.push(cur);
      cur = heading;
    }
    cur += `\n${line}`;
  }
  out.push(cur);
  return out;
}

/**
 * Teks format WhatsApp. Mengembalikan satu atau beberapa pesan (masing-masing
 * <= 3.500 huruf), dipotong per departemen.
 */
export function toWhatsApp(
  groups: DeptGroup[],
  today: string,
  scopeLabel = "",
  baseUrl = DEFAULT_BASE_URL,
): string[] {
  let header = `*Reminder Crustea* · ${formatDayLong(today)}`;
  if (scopeLabel) header += `\n_${scopeLabel}_`;
  const footer = footerBlock(baseUrl);

  const blocks = groups
    .filter((g) => g.oldCount > 0 || BUCKET_ORDER.some((b) => g.buckets[b].length > 0))
    .flatMap((g) => splitLongBlock(groupBlock(g, today), MAX_MESSAGE_LENGTH - 200));

  if (blocks.length === 0) {
    return [`${header}\n\nTidak ada tenggat dalam ${SOON_WINDOW_DAYS} hari ke depan.\n\n${footer}`];
  }

  const messages: string[] = [];
  let cur = header;
  for (const block of blocks) {
    if (cur.length + 2 + block.length > MAX_MESSAGE_LENGTH && cur !== header) {
      messages.push(cur);
      cur = block;
    } else {
      cur += `\n\n${block}`;
    }
  }
  if (cur.length + 2 + footer.length > MAX_MESSAGE_LENGTH) {
    messages.push(cur);
    cur = footer;
  } else {
    cur += `\n\n${footer}`;
  }
  messages.push(cur);
  return messages;
}
