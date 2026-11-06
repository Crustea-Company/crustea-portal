// Daftar Mitra (migrasi 028): mitra pembudidaya, champion farmers, vendor teknologi, lainnya.

type Me = { dept_code: string | null; app_role: string };

export const PARTNER_KINDS = { farmer: "Mitra pembudidaya", champion: "Champion farmers", vendor: "Vendor teknologi", other: "Lainnya" } as const;
export type PartnerKind = keyof typeof PARTNER_KINDS;

export const PARTNER_STATUS = { active: "Aktif", not_ready: "Belum siap", wrong_target: "Salah sasaran", inactive: "Tidak aktif" } as const;
export type PartnerStatus = keyof typeof PARTNER_STATUS;

export const PARTNER_STATUS_STYLE: Record<PartnerStatus, string> = {
  active: "bg-brand-100 text-brand-800",
  not_ready: "bg-amber-100 text-amber-800",
  wrong_target: "bg-red-100 text-red-700",
  inactive: "bg-slate-100 text-slate-600",
};

export type Partner = {
  id: string;
  kind: PartnerKind;
  name: string;
  contact: string | null;
  location: string | null;
  commodity: string | null;
  pic_id: string | null;
  status: PartnerStatus;
  obligation: string | null;
  tech_note: string | null;
  notes: string | null;
  updated_at: string;
  pic: { full_name: string } | null;
};

export const PARTNER_COLUMNS =
  "id, kind, name, contact, location, commodity, pic_id, status, obligation, tech_note, notes, updated_at, pic:employees!partners_pic_id_fkey(full_name)";

// Sama dengan aturan RLS partners: tambah/ubah = dept BDS, TO, AQ, admin, CEO; hapus = head BDS, admin, CEO.
export const canEditPartners = (me: Me) => ["BDS", "TO", "AQ"].includes(me.dept_code ?? "") || me.app_role === "admin" || me.app_role === "ceo";
export const canDeletePartners = (me: Me) => (me.app_role === "head" && me.dept_code === "BDS") || me.app_role === "admin" || me.app_role === "ceo";

// Target KPI BDS-B.1: 25 champion farmers terhubung & aktif.
export const CHAMPION_TARGET = 25;
