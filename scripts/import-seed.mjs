// Impor data awal dari folder seed/ ke Supabase.
// Jalankan sekali:  node --env-file=.env.local scripts/import-seed.mjs
//
// - Membutuhkan SUPABASE_SECRET_KEY di .env.local (hanya untuk skrip ini).
// - Berhenti tanpa mengubah apa pun kalau ada tabel tujuan yang sudah berisi.
// - Isi CSV tidak diubah; hanya tipe datanya yang disesuaikan.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SEED_DIR = path.join(import.meta.dirname, "..", "seed");
const CHUNK = 500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SECRET_KEY belum diisi di .env.local.");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { persistSession: false } });

// ---------- Membaca CSV (mendukung teks berkoma dan multi-baris dalam tanda kutip) ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// ---------- Konversi tipe ----------
const text = (v) => (v === "" ? null : v);
const bool = (v) => (v === "" ? null : v.toLowerCase() === "true");
const int = (v) => (v === "" ? null : parseInt(v, 10));
const num = (v) => (v === "" ? null : Number(v));
const pgArray = (v) => {
  if (v === "" || v === "{}") return null;
  return v.replace(/^\{|\}$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
};

// Urutan mengikuti relasi: tabel induk lebih dulu.
const TABLES = [
  { name: "departments", map: (r) => ({ code: r.code, name: r.name }) },
  {
    name: "employees",
    map: (r) => ({
      id: r.id, email: r.email, full_name: r.full_name, dept_code: text(r.dept_code),
      job_title: text(r.job_title), emp_status: r.emp_status, app_role: r.app_role,
      ats_required: bool(r.ats_required), is_active: bool(r.is_active),
    }),
  },
  { name: "employee_aliases", map: (r) => ({ alias: r.alias, employee_id: r.employee_id }) },
  {
    name: "sprints",
    map: (r) => ({
      id: int(r.id), name: r.name, start_date: text(r.start_date),
      end_date: text(r.end_date), focus: text(r.focus),
    }),
  },
  {
    name: "tasks",
    map: (r) => ({
      id: r.id, code: text(r.code), dept_code: r.dept_code, title: r.title,
      workstream: text(r.workstream), output: text(r.output), status: r.status,
      start_date: text(r.start_date), deadline: text(r.deadline),
      is_priority: bool(r.is_priority), sprint_id: int(r.sprint_id),
      source: text(r.source), notes: text(r.notes), sop_codes: pgArray(r.sop_codes),
    }),
  },
  { name: "task_people", map: (r) => ({ task_id: r.task_id, employee_id: r.employee_id, role: r.role }) },
  {
    name: "period_snapshots",
    map: (r) => ({
      employee_id: r.employee_id, period_month: r.period_month, emp_status: r.emp_status,
      achievement: num(r.achievement), source: r.source,
    }),
  },
  {
    name: "work_logs",
    map: (r) => ({
      id: r.id, employee_id: r.employee_id, log_date: r.log_date, activity: r.activity,
      minutes: int(r.minutes), proof: text(r.proof), period_month: r.period_month,
      is_correction: bool(r.is_correction),
    }),
  },
  {
    name: "kpi_items",
    map: (r) => ({
      objective_code: r.objective_code, objective: r.objective, dept_code: r.dept_code,
      item: r.item, pic_type: r.pic_type, pic_id: text(r.pic_id),
      target_value: num(r.target_value), target_unit: text(r.target_unit),
      target_period: text(r.target_period), target_weeks: text(r.target_weeks),
      is_done: bool(r.is_done),
    }),
  },
];

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Gagal menghitung ${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  // 1. Pastikan semua tabel tujuan masih kosong.
  const before = {};
  for (const t of TABLES) before[t.name] = await countRows(t.name);
  const filled = Object.entries(before).filter(([, n]) => n > 0);
  if (filled.length) {
    console.error("Dibatalkan: tabel berikut sudah berisi data, tidak ada yang diubah.");
    for (const [name, n] of filled) console.error(`  ${name}: ${n} baris`);
    process.exit(1);
  }

  // 2. Masukkan data per tabel, sedikit demi sedikit.
  const csvRows = {};
  for (const t of TABLES) {
    const rows = parseCsv(fs.readFileSync(path.join(SEED_DIR, `${t.name}.csv`), "utf8")).map(t.map);
    csvRows[t.name] = rows;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from(t.name).insert(rows.slice(i, i + CHUNK));
      if (error) {
        throw new Error(`Gagal impor ${t.name} (baris ${i + 1}-${i + CHUNK}): ${error.message}`);
      }
    }
    console.log(`OK  ${t.name}: ${rows.length} baris`);
  }

  // 3. Log di periode yang sudah dikunci otomatis diberi tanda koreksi oleh trigger.
  //    Data impor bukan koreksi, jadi kembalikan sesuai CSV.
  const notCorrection = csvRows.work_logs.filter((r) => r.is_correction === false).map((r) => r.id);
  for (let i = 0; i < notCorrection.length; i += 200) {
    const { error } = await supabase
      .from("work_logs")
      .update({ is_correction: false })
      .in("id", notCorrection.slice(i, i + 200))
      .eq("is_correction", true);
    if (error) throw new Error(`Gagal merapikan tanda koreksi: ${error.message}`);
  }
  const { count: corrections } = await supabase
    .from("work_logs").select("*", { count: "exact", head: true }).eq("is_correction", true);

  // 4. Laporan akhir.
  console.log("\nJumlah baris di Supabase vs CSV:");
  for (const t of TABLES) {
    const n = await countRows(t.name);
    const expected = csvRows[t.name].length;
    console.log(`  ${t.name.padEnd(17)} ${String(n).padStart(5)} / ${expected} ${n === expected ? "cocok" : "TIDAK COCOK"}`);
  }
  console.log(`  work_logs bertanda koreksi: ${corrections}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
