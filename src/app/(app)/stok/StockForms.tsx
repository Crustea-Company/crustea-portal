"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STOCK_MOVE_LABEL, type StockItem, type StockMoveKind } from "@/lib/sales";
import { addStockMove, saveStockItem, type StockItemInput } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const hintClass = "font-normal text-slate-500";
const PRIMARY = "rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60";
const LINK = "text-sm font-medium text-brand-700 hover:underline";

// Tambah / ubah barang stok.
export function StockItemForm({ item, products }: { item?: StockItem; products: { code: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StockItemInput>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    product_code: item?.product_code ?? "",
    unit: item?.unit ?? "unit",
    min_qty: item?.min_qty ?? 0,
    notes: item?.notes ?? "",
    is_active: item?.is_active ?? true,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<StockItemInput>) => setForm((f) => ({ ...f, ...patch }));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={item ? LINK : PRIMARY}>
        {item ? "Ubah" : "+ Barang stok"}
      </button>
    );
  }

  async function save() {
    setError("");
    setPending(true);
    const res = await saveStockItem(form, item?.id ?? null);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span>
            Kode barang <span className={hintClass}>(mis. AER-MINI)</span>
          </span>
          <input type="text" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={`${inputClass} font-mono`} />
        </label>
        <label className={labelClass}>
          Nama barang / komponen
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Produk terkait <span className={hintClass}>(untuk kebutuhan pipeline & work order)</span>
          </span>
          <select value={form.product_code} onChange={(e) => set({ product_code: e.target.value })} className={inputClass}>
            <option value="">Tidak terkait produk (komponen)</option>
            {products.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Satuan
            <input type="text" value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>
            Stok minimal
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.min_qty}
              onChange={(e) => set({ min_qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className={inputClass}
            />
          </label>
        </div>
      </div>
      <label className={labelClass}>
        Catatan
        <input type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </label>
      {item && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="h-4 w-4 accent-brand-700" />
          Masih dipakai (hilangkan centang untuk menyembunyikan)
        </label>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className={PRIMARY}>
          {pending ? "Menyimpan..." : "Simpan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700">
          Batal
        </button>
      </div>
    </div>
  );
}

// Catat stok masuk / keluar / penyesuaian opname.
export function StockMoveForm({ items, today }: { items: StockItem[]; today: string }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [kind, setKind] = useState<StockMoveKind>("in");
  const [qty, setQty] = useState(0);
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function save() {
    setError("");
    setDone("");
    setPending(true);
    const res = await addStockMove(itemId, kind, qty, date, reference, note);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setQty(0);
    setReference("");
    setNote("");
    setDone("Tersimpan.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Barang
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputClass}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} · {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Jenis
          <select value={kind} onChange={(e) => setKind(e.target.value as StockMoveKind)} className={inputClass}>
            {Object.entries(STOCK_MOVE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span>
            Jumlah{" "}
            <span className={hintClass}>{kind === "adjust" ? "(+ bila fisik lebih, − bila kurang)" : "(angka positif)"}</span>
          </span>
          <input
            type="number"
            step={1}
            inputMode="numeric"
            value={qty || ""}
            onChange={(e) => setQty(Math.trunc(Number(e.target.value) || 0))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Tanggal
          <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        <span>
          Referensi <span className={hintClass}>(No. PR/PO/GRN pengadaan, no. lead, dll.)</span>
        </span>
        <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>
          Catatan <span className={hintClass}>{kind === "adjust" ? "(wajib: hasil stock opname)" : "(boleh kosong)"}</span>
        </span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="text-sm text-brand-700">{done}</p>}
      <button type="button" disabled={pending || !itemId || !qty} onClick={save} className={`self-start ${PRIMARY}`}>
        {pending ? "Menyimpan..." : "Simpan mutasi stok"}
      </button>
    </div>
  );
}
