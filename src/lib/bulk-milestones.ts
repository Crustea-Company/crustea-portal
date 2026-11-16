// Definisi file Excel untuk Milestone program (ekspor–ubah–impor massal). Fungsi murni.
import { normalizeText } from "./search";
import { resolvePeople, type Person, type RowValues, type SheetDef } from "./bulk-sheet";
import type { Milestone } from "./programs";

export type MilestoneSheetRow = { m: Milestone; programId: string; programName: string };

export type MilestoneSheetCtx = {
  programs: { id: string; name: string }[]; // pilihan Program untuk baris baru
  employees: { id: string; full_name: string }[];
};

export const MH = { program: "Program", title: "Judul", due: "Tenggat", pic: "PIC", done: "Selesai" } as const;

export const milestonePeople = (ctx: MilestoneSheetCtx): Person[] => ctx.employees.map((e) => ({ id: e.id, name: e.full_name }));

export function milestoneSheetDef(ctx: MilestoneSheetCtx): SheetDef<MilestoneSheetRow> {
  return {
    kind: "milestone",
    title: "Milestone program",
    id: (r) => String(r.m.id),
    allowDelete: true,
    labelHeader: MH.title,
    instructions: [
      "Kolom Program hanya dibaca untuk milestone yang sudah ada (tidak bisa dipindah program). Untuk baris BARU, Program wajib dipilih dari daftar.",
      "PIC: satu nama lengkap karyawan (boleh kosong). Selesai: Ya / Tidak.",
      "Hak mengubah mengikuti aturan aplikasi: hanya anggota program (dan pengatur prioritas) yang boleh menambah, mengubah, atau menghapus milestone; baris lain dilewati saat impor.",
    ],
    columns: [
      { header: MH.program, kind: "choice", get: (r) => r.programName, choices: ctx.programs.map((p) => p.name), addOnly: true, required: true, width: 30 },
      { header: MH.title, kind: "text", get: (r) => r.m.title, required: true, width: 44 },
      { header: MH.due, kind: "date", get: (r) => r.m.due_date, width: 13 },
      { header: MH.pic, kind: "people", get: (r) => (r.m.pic ? [r.m.pic.full_name] : []), width: 24 },
      { header: MH.done, kind: "bool", get: (r) => !!r.m.done_at, width: 10 },
    ],
  };
}

// Nilai kanonik -> isian milestone. Program/PIC tak dikenal atau lebih dari satu PIC = masalah.
export function milestoneFromValues(
  v: RowValues,
  ctx: MilestoneSheetCtx,
  needProgram: boolean,
): { input: { programId: string | null; title: string; due_date: string; pic_id: string; done: boolean } } | { problems: string[] } {
  const problems: string[] = [];
  let programId: string | null = null;
  if (needProgram) {
    const hits = ctx.programs.filter((p) => normalizeText(p.name) === normalizeText(v[MH.program] ?? ""));
    if (hits.length === 1) programId = hits[0].id;
    else problems.push(hits.length === 0 ? `Program "${v[MH.program] ?? ""}" tidak dikenal.` : `Program "${v[MH.program]}" ada lebih dari satu.`);
  }
  const pic = resolvePeople(v[MH.pic] ?? "", milestonePeople(ctx));
  problems.push(...pic.problems.map((p) => `${MH.pic}: ${p}`));
  if (pic.ids.length > 1) problems.push(`${MH.pic}: hanya boleh satu orang.`);
  if (problems.length) return { problems };
  return { input: { programId, title: v[MH.title] ?? "", due_date: v[MH.due] ?? "", pic_id: pic.ids[0] ?? "", done: v[MH.done] === "Ya" } };
}

export type MilestoneSheetOp = {
  op: "add" | "update" | "delete";
  id: string; // "" untuk baris baru
  line: number;
  label: string;
  changes: { col: string; from: string; to: string }[];
  baseline?: RowValues;
};
