"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import RupiahInput from "@/components/requests/RupiahInput";
import JournalTable from "@/components/project-dashboard/JournalTable";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  BUDGET_KIND_LABEL,
  STOCK_MOVE_LABEL,
  TX_KIND_LABEL,
  isOutflow,
  stockItemLabel,
  type BudgetKind,
  type BudgetLine,
  type BudgetReport,
  type StockItem,
  type StockMove,
  type StockMoveKind,
  type Tx,
  type TxKind,
} from "@/lib/project-ledger";
import { readJournalWorkbook } from "@/lib/project-ledger-xlsx";
import {
  addStockMove,
  copyBudgetFromRab,
  createAccessCode,
  deleteBudgetLine,
  deleteStockItem,
  deleteStockMove,
  deleteTransaction,
  importTransactions,
  revokeAccessCode,
  saveBudgetLine,
  saveStockItem,
  saveTransaction,
  type BudgetInput,
  type StockItemInput,
  type TxInput,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const card = "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const PRIMARY = "rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60";
const NEUTRAL = "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
const rp = (n: number) => `Rp${formatNumber(Math.round(n))}`;

// "2,5" / "1.250,5" / "10" -> angka; kosong -> null.
function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const v = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function useRun() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setError("");
    setPending(true);
    try {
      const res = await fn();
      if (!res.ok) return setError(res.message ?? "Gagal menyimpan.");
      after?.();
      router.refresh();
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}

const ErrorText = ({ text }: { text: string }) => (text ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p> : null);

// ---------- Pilih proyek ----------
export function ProjectPicker({ current, projects }: { current: string; projects: { id: string; number: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Pilih proyek"
      value={current}
      onChange={(e) => router.push(`/projects/dashboard?proyek=${e.target.value}`)}
      className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-600"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.number} · {p.name}
        </option>
      ))}
    </select>
  );
}

// ---------- Jurnal ----------
type TxForm = {
  tx_date: string;
  kind: TxKind;
  category: string;
  budget_line_id: string;
  description: string;
  qty: string;
  uom: string;
  unit_price: number;
  amount: number;
  cycle: string;
  pond: string;
  kg_per_sack: string;
  fish_per_kg: string;
  status: "paid" | "unpaid";
  proof: string;
  note: string;
};

const emptyTx = (today: string, kind: TxKind = "expense"): TxForm => ({
  tx_date: today,
  kind,
  category: "",
  budget_line_id: "",
  description: "",
  qty: "",
  uom: "",
  unit_price: 0,
  amount: 0,
  cycle: "",
  pond: "",
  kg_per_sack: "",
  fish_per_kg: "",
  status: "paid",
  proof: "",
  note: "",
});

const txToForm = (t: Tx): TxForm => ({
  tx_date: t.tx_date,
  kind: t.kind,
  category: t.category,
  budget_line_id: t.budget_line_id ?? "",
  description: t.description,
  qty: numText(t.qty),
  uom: t.uom ?? "",
  unit_price: t.unit_price ?? 0,
  amount: t.amount,
  cycle: t.cycle ? String(t.cycle) : "",
  pond: t.pond ?? "",
  kg_per_sack: numText(t.kg_per_sack),
  fish_per_kg: numText(t.fish_per_kg),
  status: t.status,
  proof: t.proof ?? "",
  note: t.note ?? "",
});

const formToInput = (f: TxForm): TxInput => {
  const qty = parseNum(f.qty);
  return {
    tx_date: f.tx_date,
    kind: f.kind,
    category: f.category,
    budget_line_id: f.budget_line_id,
    description: f.description,
    qty,
    uom: f.uom,
    unit_price: qty !== null && f.unit_price > 0 ? f.unit_price : null,
    amount: f.amount,
    cycle: parseNum(f.cycle),
    pond: f.pond,
    kg_per_sack: parseNum(f.kg_per_sack),
    fish_per_kg: parseNum(f.fish_per_kg),
    status: f.status,
    proof: f.proof,
    note: f.note,
  };
};

export function JournalEditor({
  projectId,
  transactions,
  budget,
  lineNames,
  suggestions,
  canEdit,
  aquaculture,
  today,
  fileName,
}: {
  projectId: string;
  transactions: Tx[];
  budget: BudgetLine[];
  lineNames: Record<string, string>;
  suggestions: Record<TxKind, string[]>;
  canEdit: boolean;
  aquaculture: boolean;
  today: string;
  fileName: string;
}) {
  const [form, setForm] = useState<TxForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { pending, error, setError, run } = useRun();
  const topRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof TxForm>(k: K, v: TxForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const qty = form ? parseNum(form.qty) : null;
  const computed = form && qty !== null && form.unit_price > 0 ? Math.round(qty * form.unit_price) : null;
  const lines = form
    ? budget.filter((b) => (form.kind === "income" ? b.kind === "income" : form.kind === "capital_in" ? false : b.kind !== "income"))
    : [];

  function open(t: Tx | null) {
    setError("");
    setEditId(t?.id ?? null);
    setForm(t ? txToForm(t) : emptyTx(today));
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <section className="flex flex-col gap-3">
      <div ref={topRef} />
      {canEdit && !form && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => open(null)} className={PRIMARY}>
            + Tambah transaksi
          </button>
          {aquaculture && <ImportJournal projectId={projectId} />}
        </div>
      )}

      {form && (
        <form
          className={card}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveTransaction(projectId, formToInput(form), editId), () => {
              setForm(editId ? null : { ...emptyTx(form.tx_date, form.kind), category: form.category, cycle: form.cycle, pond: form.pond });
              setEditId(null);
            });
          }}
        >
          <h2 className="font-semibold text-slate-900">{editId ? "Ubah transaksi" : "Tambah transaksi"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Tanggal
              <input type="date" required value={form.tx_date} max={today} onChange={(e) => set("tx_date", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Jenis
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => (f ? { ...f, kind: e.target.value as TxKind, budget_line_id: "" } : f))}
                className={inputClass}
              >
                {(Object.keys(TX_KIND_LABEL) as TxKind[]).map((k) => (
                  <option key={k} value={k}>
                    {TX_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Kategori
              <input
                list="tx-categories"
                required
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder={suggestions[form.kind][0]}
                className={inputClass}
              />
              <datalist id="tx-categories">
                {suggestions[form.kind].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
          <label className={labelClass}>
            Uraian
            <input required value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="mis. Pakan LP-2, Toples 50g" className={inputClass} />
          </label>
          {form.kind !== "capital_in" && (
            <label className={labelClass}>
              Pos anggaran
              <select value={form.budget_line_id} onChange={(e) => set("budget_line_id", e.target.value)} className={inputClass}>
                <option value="">{isOutflow(form.kind) ? "— Di luar anggaran —" : "— Tanpa pos target —"}</option>
                {lines.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.grp} · {b.item} ({rp(b.amount)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Volume <span className="text-xs font-normal text-slate-500">(opsional)</span>
              <input inputMode="decimal" value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="mis. 44" className={inputClass} />
            </label>
            <label className={labelClass}>
              Satuan
              <input value={form.uom} onChange={(e) => set("uom", e.target.value)} placeholder="sak / kg / ekor / pcs" className={inputClass} />
            </label>
            <label className={labelClass}>
              Harga satuan
              <RupiahInput value={form.unit_price} onChange={(n) => set("unit_price", n)} />
            </label>
          </div>
          <label className={labelClass}>
            Jumlah (Rp)
            {computed !== null ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-base font-semibold tabular-nums text-slate-900">{rp(computed)} (volume × harga)</p>
            ) : (
              <RupiahInput value={form.amount} onChange={(n) => set("amount", n)} />
            )}
          </label>
          {aquaculture && (
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={labelClass}>
                Siklus
                <input inputMode="numeric" value={form.cycle} onChange={(e) => set("cycle", e.target.value.replace(/\D/g, ""))} className={inputClass} />
              </label>
              <label className={labelClass}>
                ID kolam
                <input value={form.pond} onChange={(e) => set("pond", e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Kg per sak <span className="text-xs font-normal text-slate-500">(pakan)</span>
                <input inputMode="decimal" value={form.kg_per_sack} onChange={(e) => set("kg_per_sack", e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Ekor per kg <span className="text-xs font-normal text-slate-500">(panen)</span>
                <input inputMode="decimal" value={form.fish_per_kg} onChange={(e) => set("fish_per_kg", e.target.value)} className={inputClass} />
              </label>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Status pembayaran
              <select value={form.status} onChange={(e) => set("status", e.target.value as "paid" | "unpaid")} className={inputClass}>
                <option value="paid">Lunas</option>
                <option value="unpaid">Belum dibayar</option>
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Link bukti <span className="text-xs font-normal text-slate-500">(tidak terlihat investor)</span>
              <input type="url" value={form.proof} onChange={(e) => set("proof", e.target.value)} placeholder="https://drive.google.com/..." className={inputClass} />
            </label>
          </div>
          <label className={labelClass}>
            Catatan internal <span className="text-xs font-normal text-slate-500">(tidak terlihat investor)</span>
            <input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputClass} />
          </label>
          <ErrorText text={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={PRIMARY}>
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={() => (setForm(null), setEditId(null))} className={NEUTRAL}>
              Tutup
            </button>
          </div>
        </form>
      )}
      {!form && <ErrorText text={error} />}

      <div className={card}>
        <h2 className="font-semibold text-slate-900">Jurnal transaksi</h2>
        <JournalTable
          transactions={transactions}
          lineNames={lineNames}
          fileName={fileName}
          internal
          onEdit={canEdit ? (t) => open(t) : undefined}
          onDelete={
            canEdit
              ? (t) => {
                  if (confirm(`Hapus transaksi "${t.description}" (${rp(t.amount)})? Tercatat di riwayat proyek.`)) run(() => deleteTransaction(t.id));
                }
              : undefined
          }
        />
      </div>
    </section>
  );
}

// Impor dari template "Laporan Budidaya Ikan" (.xlsx) atau dari file Export jurnal.
function ImportJournal({ projectId }: { projectId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: TxInput[]; warnings: string[]; fileName: string } | null>(null);
  const [msg, setMsg] = useState("");
  const { pending, error, setError, run } = useRun();

  async function onFile(file: File) {
    setMsg("");
    setError("");
    try {
      const res = await readJournalWorkbook(file);
      if (res.rows.length === 0) return setError("Tidak ada baris transaksi yang terbaca di file ini.");
      setPreview({ ...res, fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "File tidak bisa dibaca.");
    }
  }

  const total = (pred: (t: TxInput) => boolean) => (preview ? preview.rows.filter(pred).reduce((s, t) => s + t.amount, 0) : 0);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={NEUTRAL}>
        ⬆ Impor dari template budidaya
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {(preview || error || msg) && (
        <div className="basis-full rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-3 text-sm">
          {preview && (
            <>
              <p className="font-semibold text-slate-900">
                {preview.fileName}: {formatNumber(preview.rows.length)} transaksi terbaca
              </p>
              <p className="text-slate-600">
                Keluar {rp(total((t) => isOutflow(t.kind)))} · Masuk {rp(total((t) => !isOutflow(t.kind)))} · Siklus{" "}
                {[...new Set(preview.rows.map((t) => t.cycle).filter(Boolean))].join(", ") || "-"}
              </p>
              {preview.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                  {preview.warnings.slice(0, 6).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-slate-500">Semua baris ditambahkan sebagai transaksi baru (tanpa pos anggaran). Pastikan file ini belum pernah diimpor.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className={PRIMARY}
                  onClick={() =>
                    run(
                      () => importTransactions(projectId, preview.rows),
                      () => {
                        setMsg(`${formatNumber(preview.rows.length)} transaksi berhasil diimpor.`);
                        setPreview(null);
                      },
                    )
                  }
                >
                  {pending ? "Mengimpor…" : "Impor sekarang"}
                </button>
                <button type="button" onClick={() => setPreview(null)} className={NEUTRAL}>
                  Batal
                </button>
              </div>
            </>
          )}
          {msg && <p className="text-brand-800">{msg}</p>}
          <ErrorText text={error} />
          {!preview && (
            <p className="mt-1 text-xs text-slate-500">
              Buka file .xlsb di Excel, pilih File &gt; Save As &gt; Excel Workbook (.xlsx), lalu pilih file .xlsx-nya di sini. Sheet yang dibaca:
              DATA_BIAYA_OPERASIONAL.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ---------- Anggaran ----------
type BudgetForm = { kind: BudgetKind; grp: string; item: string; note: string; qty: string; uom: string; price: number; sort: string };
const emptyBudget = (sort: number): BudgetForm => ({ kind: "expense", grp: "", item: "", note: "", qty: "1", uom: "", price: 0, sort: String(sort) });

export function BudgetEditor({
  projectId,
  budget,
  canEdit,
  hasPlan,
  report,
}: {
  projectId: string;
  budget: BudgetLine[];
  canEdit: boolean;
  hasPlan: boolean;
  report: BudgetReport;
}) {
  const [form, setForm] = useState<BudgetForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  const groups = [...new Set(budget.map((b) => b.grp))];
  const nextSort = (budget.reduce((m, b) => Math.max(m, b.sort), 0) || 0) + 10;
  const set = <K extends keyof BudgetForm>(k: K, v: BudgetForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const actual = new Map(report.groups.flatMap((g) => g.lines.map((l) => [l.line.id, l.actual] as const)));

  const toInput = (f: BudgetForm): BudgetInput => ({
    kind: f.kind,
    grp: f.grp,
    item: f.item,
    note: f.note,
    qty: parseNum(f.qty) ?? 0,
    uom: f.uom,
    price: f.price,
    sort: parseNum(f.sort) ?? 0,
  });

  return (
    <section className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {!form && (
            <button type="button" onClick={() => (setEditId(null), setForm(emptyBudget(nextSort)))} className={PRIMARY}>
              + Tambah pos anggaran
            </button>
          )}
          {hasPlan && budget.length === 0 && (
            <button type="button" disabled={pending} onClick={() => run(() => copyBudgetFromRab(projectId))} className={NEUTRAL}>
              Ambil dari RAB proyek
            </button>
          )}
        </div>
      )}
      {form && (
        <form
          className={card}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveBudgetLine(projectId, toInput(form), editId), () => {
              setForm(editId ? null : { ...emptyBudget(nextSort + 10), kind: form.kind, grp: form.grp });
              setEditId(null);
            });
          }}
        >
          <h2 className="font-semibold text-slate-900">{editId ? "Ubah pos anggaran" : "Tambah pos anggaran"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Jenis
              <select value={form.kind} onChange={(e) => set("kind", e.target.value as BudgetKind)} className={inputClass}>
                {(Object.keys(BUDGET_KIND_LABEL) as BudgetKind[]).map((k) => (
                  <option key={k} value={k}>
                    {BUDGET_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Kelompok
              <input list="budget-groups" required value={form.grp} onChange={(e) => set("grp", e.target.value)} placeholder="mis. Pengemasan" className={inputClass} />
              <datalist id="budget-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
            <label className={labelClass}>
              Urutan
              <input inputMode="numeric" value={form.sort} onChange={(e) => set("sort", e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Item
              <input required value={form.item} onChange={(e) => set("item", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Keterangan
              <input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Jumlah
              <input inputMode="decimal" value={form.qty} onChange={(e) => set("qty", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Satuan
              <input value={form.uom} onChange={(e) => set("uom", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Harga satuan
              <RupiahInput value={form.price} onChange={(n) => set("price", n)} />
            </label>
          </div>
          <p className="text-sm text-slate-600">
            Total: <span className="font-semibold tabular-nums text-slate-900">{rp((parseNum(form.qty) ?? 0) * form.price)}</span>
          </p>
          <ErrorText text={error} />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={PRIMARY}>
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={() => (setForm(null), setEditId(null))} className={NEUTRAL}>
              Tutup
            </button>
          </div>
        </form>
      )}
      {!form && <ErrorText text={error} />}

      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Pos anggaran</h2>
          <p className="text-sm text-slate-600">
            Biaya <span className="font-semibold tabular-nums">{rp(report.costBudget)}</span>
            {report.incomeBudget > 0 && (
              <>
                {" "}
                · Target pendapatan <span className="font-semibold tabular-nums">{rp(report.incomeBudget)}</span>
              </>
            )}
          </p>
        </div>
        {budget.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada pos anggaran.{hasPlan ? " Klik \"Ambil dari RAB proyek\" untuk menyalin baris RAB." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Kelompok / item</th>
                  <th className="px-2 py-2 text-right font-medium">Jumlah × harga</th>
                  <th className="px-2 py-2 text-right font-medium">Anggaran</th>
                  <th className="px-2 py-2 text-right font-medium">Realisasi</th>
                  {canEdit && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {[...budget]
                  .sort((a, b) => a.sort - b.sort)
                  .map((b) => (
                    <tr key={b.id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <p className="text-xs text-slate-500">
                          {b.grp} · {BUDGET_KIND_LABEL[b.kind]}
                        </p>
                        <p className="text-slate-900">{b.item}</p>
                        {b.note && <p className="text-xs text-slate-500">{b.note}</p>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                        {formatNumber(b.qty)} {b.uom ?? ""} × {rp(b.price)}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{rp(b.amount)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{actual.get(b.id) ? rp(actual.get(b.id)!) : "-"}</td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(b.id);
                              setForm({ kind: b.kind, grp: b.grp, item: b.item, note: b.note ?? "", qty: numText(b.qty), uom: b.uom ?? "", price: b.price, sort: String(b.sort) });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Hapus pos "${b.item}"? Transaksi yang memakai pos ini menjadi "di luar anggaran".`)) run(() => deleteBudgetLine(b.id));
                            }}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Stok ----------
type MoveForm = {
  kind: StockMoveKind;
  item_id: string;
  move_date: string;
  qty: string;
  material_item_id: string;
  material_qty: string;
  channel: string;
  reference: string;
  note: string;
  recordIncome: boolean;
  income: number;
};

export function StockEditor({
  projectId,
  items,
  moves,
  canEdit,
  today,
}: {
  projectId: string;
  items: StockItem[];
  moves: StockMove[];
  canEdit: boolean;
  today: string;
}) {
  const materials = items.filter((i) => i.kind === "material");
  const products = items.filter((i) => i.kind === "product");
  const [move, setMove] = useState<MoveForm | null>(null);
  const [itemForm, setItemForm] = useState<(StockItemInput & { id: string | null; planText: string }) | null>(null);
  const { pending, error, run } = useRun();
  const byId = new Map(items.map((i) => [i.id, i]));
  const setM = <K extends keyof MoveForm>(k: K, v: MoveForm[K]) => setMove((f) => (f ? { ...f, [k]: v } : f));
  const choices = move ? (move.kind === "in" ? materials : move.kind === "adjust" ? items : products) : [];
  const chosen = move ? byId.get(move.item_id) : undefined;

  function startMove(kind: StockMoveKind) {
    const list = kind === "in" ? materials : kind === "adjust" ? items : products;
    setMove({
      kind,
      item_id: list[0]?.id ?? "",
      move_date: today,
      qty: "",
      material_item_id: materials[0]?.id ?? "",
      material_qty: "",
      channel: "",
      reference: "",
      note: "",
      recordIncome: kind === "sold",
      income: 0,
    });
  }

  return (
    <section className="flex flex-col gap-3">
      {canEdit && items.length > 0 && !move && (
        <div className={card}>
          <h2 className="font-semibold text-slate-900">Catat transaksi stok</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STOCK_MOVE_LABEL) as StockMoveKind[])
              .filter((k) => (k === "in" ? materials.length > 0 : k === "adjust" ? true : products.length > 0) && (k !== "pack" || materials.length > 0))
              .map((k) => (
                <button key={k} type="button" onClick={() => startMove(k)} className={NEUTRAL}>
                  {STOCK_MOVE_LABEL[k]}
                </button>
              ))}
          </div>
        </div>
      )}
      {move && (
        <form
          className={card}
          onSubmit={(e) => {
            e.preventDefault();
            const qty = parseNum(move.qty) ?? 0;
            run(
              () =>
                addStockMove(projectId, {
                  item_id: move.item_id,
                  move_date: move.move_date,
                  kind: move.kind,
                  qty,
                  material_item_id: move.material_item_id,
                  material_qty: parseNum(move.material_qty),
                  channel: move.channel,
                  reference: move.reference,
                  note: move.note,
                  income: move.kind === "sold" && move.recordIncome && move.income > 0 ? { amount: move.income, category: "Penjualan" } : null,
                }),
              () => setMove(null),
            );
          }}
        >
          <h2 className="font-semibold text-slate-900">{STOCK_MOVE_LABEL[move.kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Tanggal
              <input type="date" required max={today} value={move.move_date} onChange={(e) => setM("move_date", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              {move.kind === "in" ? "Bahan" : move.kind === "adjust" ? "Barang" : "Produk"}
              <select
                value={move.item_id}
                onChange={(e) => {
                  const it = byId.get(e.target.value);
                  setMove((f) => (f ? { ...f, item_id: e.target.value, income: it && f.qty ? Math.round((parseNum(f.qty) ?? 0) * it.sale_price) : f.income } : f));
                }}
                className={inputClass}
              >
                {choices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {stockItemLabel(i)} ({i.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {move.kind === "adjust" ? "Selisih opname (boleh minus)" : `Jumlah (${chosen?.unit ?? ""})`}
              <input
                inputMode="decimal"
                required
                value={move.qty}
                onChange={(e) => {
                  const v = e.target.value;
                  setMove((f) => (f ? { ...f, qty: v, income: chosen && f.kind === "sold" ? Math.round((parseNum(v) ?? 0) * chosen.sale_price) : f.income } : f));
                }}
                className={inputClass}
              />
            </label>
          </div>
          {move.kind === "pack" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Bahan baku yang dipakai
                <select value={move.material_item_id} onChange={(e) => setM("material_item_id", e.target.value)} className={inputClass}>
                  {materials.map((i) => (
                    <option key={i.id} value={i.id}>
                      {stockItemLabel(i)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Bahan terpakai ({byId.get(move.material_item_id)?.unit ?? "kg"})
                <input inputMode="decimal" required value={move.material_qty} onChange={(e) => setM("material_qty", e.target.value)} className={inputClass} />
              </label>
            </div>
          )}
          {(move.kind === "sold" || move.kind === "sample" || move.kind === "return") && (
            <label className={labelClass}>
              Channel / pelanggan
              <input value={move.channel} onChange={(e) => setM("channel", e.target.value)} placeholder="mis. Shopee, reseller, nama pembeli" className={inputClass} />
            </label>
          )}
          {move.kind === "sold" && (
            <div className="flex flex-col gap-2 rounded-xl bg-brand-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={move.recordIncome} onChange={(e) => setM("recordIncome", e.target.checked)} className="h-4 w-4" />
                Catat juga sebagai pemasukan di jurnal
              </label>
              {move.recordIncome && (
                <label className={labelClass}>
                  Nilai penjualan
                  <RupiahInput value={move.income} onChange={(n) => setM("income", n)} />
                </label>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              No. ref / invoice
              <input value={move.reference} onChange={(e) => setM("reference", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Keterangan
              <input value={move.note} onChange={(e) => setM("note", e.target.value)} className={inputClass} />
            </label>
          </div>
          <ErrorText text={error} />
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !move.item_id} className={PRIMARY}>
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={() => setMove(null)} className={NEUTRAL}>
              Tutup
            </button>
          </div>
        </form>
      )}
      {!move && !itemForm && <ErrorText text={error} />}

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Daftar barang stok</h2>
          {canEdit && !itemForm && (
            <button
              type="button"
              onClick={() => setItemForm({ id: null, kind: "product", name: "", size: "", unit: "toples", plan_qty: 0, planText: "", sale_price: 0, sort: (items.length + 1) * 10 })}
              className={NEUTRAL}
            >
              + Tambah barang
            </button>
          )}
        </div>
        {itemForm && (
          <form
            className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveStockItem(projectId, { ...itemForm, plan_qty: parseNum(itemForm.planText) ?? 0 }, itemForm.id), () => setItemForm(null));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={labelClass}>
                Jenis
                <select
                  value={itemForm.kind}
                  onChange={(e) => {
                    const kind = e.target.value as "material" | "product";
                    setItemForm((f) => (f ? { ...f, kind, unit: kind === "material" ? "kg" : "toples" } : f));
                  }}
                  className={inputClass}
                >
                  <option value="material">Bahan baku</option>
                  <option value="product">Produk jadi</option>
                </select>
              </label>
              <label className={labelClass}>
                Nama / rasa
                <input required value={itemForm.name} onChange={(e) => setItemForm((f) => (f ? { ...f, name: e.target.value } : f))} className={inputClass} />
              </label>
              <label className={labelClass}>
                Ukuran
                <input value={itemForm.size} onChange={(e) => setItemForm((f) => (f ? { ...f, size: e.target.value } : f))} placeholder="mis. 50g" className={inputClass} />
              </label>
              <label className={labelClass}>
                Satuan
                <input required value={itemForm.unit} onChange={(e) => setItemForm((f) => (f ? { ...f, unit: e.target.value } : f))} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Rencana jumlah
                <input inputMode="decimal" value={itemForm.planText} onChange={(e) => setItemForm((f) => (f ? { ...f, planText: e.target.value } : f))} className={inputClass} />
              </label>
              {itemForm.kind === "product" && (
                <label className={labelClass}>
                  Harga jual
                  <RupiahInput value={itemForm.sale_price} onChange={(n) => setItemForm((f) => (f ? { ...f, sale_price: n } : f))} />
                </label>
              )}
            </div>
            <ErrorText text={error} />
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={PRIMARY}>
                Simpan
              </button>
              <button type="button" onClick={() => setItemForm(null)} className={NEUTRAL}>
                Tutup
              </button>
            </div>
          </form>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada barang stok. Tambahkan bahan baku dan produk jadi proyek ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-xs text-slate-500">{i.kind === "material" ? "Bahan baku" : "Produk jadi"} · </span>
                  <span className="font-medium text-slate-900">{stockItemLabel(i)}</span>
                  <span className="text-slate-500">
                    {" "}
                    · rencana {formatNumber(i.plan_qty)} {i.unit}
                    {i.kind === "product" && i.sale_price > 0 && <> · {rp(i.sale_price)}</>}
                  </span>
                </span>
                {canEdit && (
                  <span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemForm({ id: i.id, kind: i.kind, name: i.name, size: i.size ?? "", unit: i.unit, plan_qty: i.plan_qty, planText: numText(i.plan_qty), sale_price: i.sale_price, sort: i.sort })
                      }
                      className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm(`Hapus barang "${stockItemLabel(i)}"?`) && run(() => deleteStockItem(i.id))}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="font-semibold text-slate-900">Log transaksi stok</h2>
        {moves.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada transaksi stok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {[...moves].reverse().map((m) => {
              const it = byId.get(m.item_id);
              const mat = m.material_item_id ? byId.get(m.material_item_id) : undefined;
              return (
                <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      {formatDate(m.move_date)} · {STOCK_MOVE_LABEL[m.kind]}
                      {m.creator && <> · {m.creator.full_name}</>}
                    </p>
                    <p className="text-slate-900">
                      <span className="font-semibold tabular-nums">
                        {m.kind === "adjust" && m.qty > 0 ? "+" : ""}
                        {formatNumber(m.qty)} {it?.unit}
                      </span>{" "}
                      {it ? stockItemLabel(it) : "-"}
                      {mat && m.material_qty && (
                        <span className="text-slate-500">
                          {" "}
                          · pakai {formatNumber(m.material_qty)} {mat.unit} {stockItemLabel(mat)}
                        </span>
                      )}
                    </p>
                    {(m.channel || m.reference || m.note || m.transaction_id) && (
                      <p className="text-xs text-slate-500">
                        {[m.channel, m.reference, m.note, m.transaction_id ? "tercatat di jurnal" : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        confirm(`Hapus transaksi stok ini?${m.transaction_id ? " Pemasukan di jurnal yang dibuat bersamanya ikut dihapus." : ""}`) &&
                        run(() => deleteStockMove(m.id))
                      }
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------- Kode investor ----------
export type AccessCode = {
  id: string;
  label: string;
  code_hint: string;
  expires_on: string | null;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
};

export function AccessPanel({ projectId, codes, today }: { projectId: string; codes: AccessCode[]; today: string }) {
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [created, setCreated] = useState<{ code: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, error, run } = useRun();
  const [link, setLink] = useState("/investor");
  useEffect(() => setLink(`${window.location.origin}/investor`), []);

  return (
    <section className="flex flex-col gap-3">
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          run(
            async () => {
              const res = await createAccessCode(projectId, label, expires);
              if (res.ok) setCreated({ code: res.code, label });
              return res;
            },
            () => {
              setLabel("");
              setExpires("");
              setCopied(false);
            },
          );
        }}
      >
        <h2 className="font-semibold text-slate-900">Buat kode akses investor</h2>
        <p className="text-sm text-slate-600">
          Investor membuka <span className="font-mono">{link}</span>, memasukkan kode, lalu melihat dashboard proyek ini saja (hanya-baca, tanpa catatan internal dan
          link bukti). Satu kode per investor supaya bisa dicabut sendiri-sendiri.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label className={labelClass}>
            Nama investor / keterangan
            <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Bapak Budi (investor Tuban)" className={inputClass} />
          </label>
          <label className={labelClass}>
            Berlaku sampai <span className="text-xs font-normal text-slate-500">(opsional)</span>
            <input type="date" min={today} value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
          </label>
        </div>
        <ErrorText text={error} />
        <button type="submit" disabled={pending} className={`${PRIMARY} self-start`}>
          {pending ? "Membuat…" : "Buat kode"}
        </button>
      </form>

      {created && (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-brand-600 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-900">Kode untuk {created.label}</p>
          <p className="select-all font-mono text-2xl font-bold tracking-wider text-slate-900">{created.code}</p>
          <p className="text-sm text-slate-700">
            Salin dan kirim kode ini ke investor sekarang. <b>Kode hanya tampil sekali</b> dan tidak bisa dilihat lagi (yang tersimpan hanya sidiknya). Kalau hilang,
            cabut lalu buat kode baru.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`Dashboard proyek Crustea: ${link}\nKode akses: ${created.code}`);
                setCopied(true);
              }}
              className={PRIMARY}
            >
              {copied ? "Tersalin ✓" : "Salin link + kode"}
            </button>
            <button type="button" onClick={() => setCreated(null)} className={NEUTRAL}>
              Sudah saya simpan
            </button>
          </div>
        </div>
      )}

      <div className={card}>
        <h2 className="font-semibold text-slate-900">Kode yang sudah dibuat</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada kode investor untuk proyek ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {codes.map((c) => {
              const expired = !!c.expires_on && c.expires_on < today;
              const status = c.revoked_at ? "Dicabut" : expired ? "Kedaluwarsa" : "Aktif";
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {c.label} <span className="font-mono text-xs text-slate-500">…{c.code_hint}</span>{" "}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          status === "Aktif" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {status}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Dibuat {formatDateTime(c.created_at)}
                      {c.expires_on && <> · berlaku sampai {formatDate(c.expires_on)}</>}
                      {c.revoked_at && <> · dicabut {formatDateTime(c.revoked_at)}</>}
                      {" · "}
                      {c.last_used_at ? `terakhir dibuka ${formatDateTime(c.last_used_at)} (${formatNumber(c.use_count)}x dimuat)` : "belum pernah dibuka"}
                    </p>
                  </div>
                  {!c.revoked_at && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirm(`Cabut kode ${c.label}? Investor langsung tidak bisa membuka dashboard dengan kode ini.`) && run(() => revokeAccessCode(c.id))}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Cabut
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
