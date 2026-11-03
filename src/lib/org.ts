// Struktur organisasi (migrasi 019, docs/fase-2-3/11-struktur-organisasi.md).
// Anggota kartu = karyawan aktif per departemen; pilar/kartu/orang khusus diatur admin & CEO.

export type OrgPillar = { id: string; name: string; sort_order: number };
export type OrgUnit = {
  dept_code: string;
  pillar_id: string | null;
  sort_order: number;
  display_name: string;
  accent: string;
  focus: string;
  colors: CardColors; // warna tambahan; kunci kosong = warna bawaan
};
export type OrgPerson = { employee_id: string; lead_dept: string | null; display_title: string | null };
export type OrgEmployee = {
  id: string;
  full_name: string;
  dept_code: string | null;
  job_title: string | null;
  emp_status: "PKWTT" | "PKWT" | "INTERN";
  app_role: "admin" | "ceo" | "head" | "staff";
};

export type OrgStructureInput = { pillars: OrgPillar[]; units: OrgUnit[]; people: OrgPerson[] };

// Warna di dalam kartu yang bisa diubah. Bawaan "accent" = mengikuti warna utama kartu.
export const CARD_COLOR_FIELDS = [
  { key: "bar", label: "Bilah atas", fallback: "accent" },
  { key: "title", label: "Nama departemen", fallback: "accent" },
  { key: "focus", label: "Teks fokus kerja", fallback: "#64748B" },
  { key: "bg", label: "Latar kartu", fallback: "#FFFFFF" },
  { key: "border", label: "Garis tepi kartu", fallback: "#E2E8F0" },
  { key: "lead_bg", label: "Latar baris pemimpin", fallback: "accent-tint" },
  { key: "name", label: "Nama orang", fallback: "#0F172A" },
  { key: "job", label: "Jabatan", fallback: "#64748B" },
] as const;
export type CardColorKey = (typeof CARD_COLOR_FIELDS)[number]["key"];
export type CardColors = Partial<Record<CardColorKey, string>>;

// Sidik struktur tersimpan: dipakai saat simpan untuk menolak bila struktur sudah diubah di tempat lain
// (tab lain, HP, atau SQL) sejak halaman dibuka, supaya data lama tidak menimpa yang baru.
export function structureKey(pillars: OrgPillar[], units: OrgUnit[], people: OrgPerson[]): string {
  const byKey = <T,>(list: T[], key: (x: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
  return JSON.stringify([
    byKey(pillars, (p) => p.id).map((p) => [p.id, p.name, p.sort_order]),
    byKey(units, (u) => u.dept_code).map((u) => [u.dept_code, u.pillar_id, u.sort_order, u.display_name, u.accent, u.focus, JSON.stringify(Object.entries(u.colors ?? {}).sort())]),
    byKey(people, (p) => p.employee_id).map((p) => [p.employee_id, p.lead_dept, p.display_title]),
  ]);
}

export const ACCENT_RE = /^#[0-9A-Fa-f]{6}$/;

// Campur warna dengan putih (k = 0..1, makin besar makin muda), mis. latar pemimpin = accent sangat muda.
export function tint(hex: string, k: number): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + rgb.map((c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Warna akhir tiap bagian kartu: isian admin bila valid, selain itu bawaan.
export function cardColors(unit: Pick<OrgUnit, "accent" | "colors">): Record<CardColorKey, string> {
  const accent = ACCENT_RE.test(unit.accent) ? unit.accent : "#64748B";
  const out = {} as Record<CardColorKey, string>;
  for (const f of CARD_COLOR_FIELDS) {
    const v = unit.colors?.[f.key];
    out[f.key] = v && ACCENT_RE.test(v) ? v : f.fallback === "accent" ? accent : f.fallback === "accent-tint" ? tint(accent, 0.9) : f.fallback;
  }
  return out;
}

export type OrgMember = {
  id: string;
  name: string;
  title: string;
  rank: number; // 0 Chief/Founder, 1 Head of, 2 staf, 3 intern
  isLead: boolean; // memimpin kartu ini (dari Board) atau rank 0/1: diberi latar aksen
};

export type OrgCard = { unit: OrgUnit; members: OrgMember[] };
export type OrgChart = {
  ceo: OrgMember | null;
  total: number; // karyawan aktif
  pillars: { pillar: OrgPillar; cards: OrgCard[] }[];
  unplaced: OrgEmployee[]; // karyawan aktif yang tidak masuk kartu mana pun (peringatan admin)
};

// Urutan dalam kartu: Chief/Founder/C-level, Head of, staf, intern (sama dengan skrip slide).
export function rankOf(title: string, status: OrgEmployee["emp_status"]): number {
  if (/^(chief|co-?founder|founder)\b/i.test(title) || /\bC[A-Z]O\b/.test(title)) return 0;
  if (/^head of\b/i.test(title)) return 1;
  return status === "INTERN" || /intern/i.test(title) ? 3 : 2;
}

export function buildOrgChart(
  pillars: OrgPillar[],
  units: OrgUnit[],
  people: OrgPerson[],
  employees: OrgEmployee[],
): OrgChart {
  const person = new Map(people.map((p) => [p.employee_id, p]));
  const member = (e: OrgEmployee, isLead = false): OrgMember => {
    const title = person.get(e.id)?.display_title || e.job_title || "-";
    const rank = rankOf(title, e.emp_status);
    return { id: e.id, name: e.full_name, title, rank, isLead: isLead || rank <= 1 };
  };
  const byName = (a: OrgEmployee, b: OrgEmployee) => a.full_name.localeCompare(b.full_name, "id");

  const used = new Set<string>();
  const ceoEmp = employees.filter((e) => e.app_role === "ceo").sort(byName)[0];
  if (ceoEmp) used.add(ceoEmp.id);

  const sortedPillars = [...pillars].sort((a, b) => a.sort_order - b.sort_order);
  const shown = sortedPillars.map((pillar) => ({
    pillar,
    units: units.filter((u) => u.pillar_id === pillar.id).sort((a, b) => a.sort_order - b.sort_order),
  }));
  const shownUnits = shown.flatMap((p) => p.units);

  // Anggota Board yang memimpin kartu diambil dulu, supaya tidak muncul lagi di departemen aslinya.
  const leads = new Map<string, OrgMember[]>();
  for (const u of shownUnits) {
    const list = employees
      .filter((e) => !used.has(e.id) && person.get(e.id)?.lead_dept === u.dept_code)
      .sort(byName)
      .map((e) => member(e, true));
    list.forEach((m) => used.add(m.id));
    leads.set(u.dept_code, list);
  }

  const cards = new Map<string, OrgCard>();
  for (const u of shownUnits) {
    const rest = employees.filter((e) => !used.has(e.id) && e.dept_code === u.dept_code);
    rest.forEach((e) => used.add(e.id));
    const sorted = rest
      .map((e) => member(e))
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, "id") || a.name.localeCompare(b.name, "id"));
    cards.set(u.dept_code, { unit: u, members: [...(leads.get(u.dept_code) ?? []), ...sorted] });
  }

  return {
    ceo: ceoEmp ? member(ceoEmp) : null,
    total: employees.length,
    pillars: shown.map((p) => ({ pillar: p.pillar, cards: p.units.map((u) => cards.get(u.dept_code)!) })),
    unplaced: employees.filter((e) => !used.has(e.id)).sort(byName),
  };
}
