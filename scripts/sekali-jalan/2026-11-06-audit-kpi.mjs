// Audit KPI departemen (permintaan Athar, 6 Nov 2026): ubah item jadi SMART (jelas, terukur, ada tenggat),
// hapus duplikat/placeholder/salin-tempel, tambah KPI dari tugas berjalan. Status selesai & catatan realisasi tetap.
// Cadangan data lama: 2026-11-06-backup-kpi.json (dibuat otomatis sebelum perubahan). Setiap perubahan tercatat di audit_log.
// node --env-file=.env.local scripts/sekali-jalan/2026-11-06-audit-kpi.mjs        (sekali saja)
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const REASON = "Audit KPI 6 Nov 2026: dibuat SMART (disetujui Athar)";
const Q = "quarter";

// [id, item baru, {target_value, target_unit, target_period, target_weeks}]
const UPDATES = [
  // AQ
  [158, "Volume trading ikan & udang terjual 5.000 kg per kuartal", { target_value: 5000, target_unit: "kg", target_period: Q, target_weeks: "12-W4" }],
  [159, "1 pengiriman ekspor udang bersama PT FIR terealisasi", { target_value: 1, target_unit: "pengiriman", target_weeks: "12-W4" }],
  [161, "Investor Aquagrowth Serang menandatangani PKS dan dana minimal Rp50 juta masuk", { target_value: 50000000, target_unit: "Rp", target_weeks: "11-W4" }],
  [162, "Pengadaan Capex, Opex & modal kerja Aquagrowth Serang 100% sesuai RAB", { target_value: 100, target_unit: "%", target_weeks: "11-W4" }],
  [163, "1 siklus budidaya Aquagrowth Serang dimulai (tebar benih)", { target_value: 1, target_unit: "siklus", target_weeks: "12-W2" }],
  [164, "Trading hasil Aquagrowth Serang berjalan (transaksi pertama terjadi)", { target_value: 1, target_unit: "transaksi", target_weeks: "12-W4" }],
  [165, "RAB Aquagrowth Magelang disetujui Finance", { target_weeks: "11-W4" }],
  [166, "Investor Aquagrowth Magelang menandatangani PKS", { target_value: 1, target_unit: "investor", target_weeks: "12-W2" }],
  [167, "Pengadaan Capex, Opex & modal kerja Aquagrowth Magelang 100% sesuai RAB", { target_value: 100, target_unit: "%", target_weeks: "12-W4" }],
  [168, "1 siklus budidaya Aquagrowth Magelang dimulai (tebar benih)", { target_value: 1, target_unit: "siklus", target_weeks: "12-W4" }],
  [170, "RAB tambak udang Kendal & Tuban dikonsolidasi dengan Finance", {}],
  [171, "Minimal 1 investor menandatangani PKS untuk tambak udang Kendal/Tuban/Jepara", { target_value: 1, target_unit: "investor", target_weeks: "12-W4" }],
  [172, "Pengadaan Capex, Opex & modal kerja 100% sesuai RAB di lokasi yang sudah ada investornya", { target_value: 100, target_unit: "%", target_weeks: "12-W4" }],
  [173, "1 siklus budidaya udang dimulai di minimal 1 lokasi", { target_value: 1, target_unit: "siklus", target_weeks: "12-W4" }],
  [175, "Uji coba sistem RAS rumahan selesai dengan laporan hasil (SR & pertumbuhan)", { target_value: 1, target_unit: "laporan", target_weeks: "11-W4" }],
  [176, "RAB RAS rumahan disetujui Finance", { target_weeks: "12-W2" }],
  [177, "Investor RAS rumahan menandatangani PKS", { target_value: 1, target_unit: "investor", target_weeks: "12-W4" }],
  [179, "38 mitra RAS rumahan beroperasi", { target_value: 38, target_unit: "mitra", target_weeks: "12-W4" }],
  [180, "Konsep & RAB workshop disetujui Finance", { target_weeks: "11-W2" }],
  [181, "Minimal 1 partner workshop menandatangani kerja sama", { target_value: 1, target_unit: "partner", target_weeks: "11-W4" }],
  [183, "3 workshop terlaksana per kuartal", { target_value: 3, target_unit: "workshop", target_period: Q, target_weeks: "12-W4" }],
  // BDS
  [100, "Penjualan Panel Surya (PLTS) 40 unit per kuartal", { target_weeks: "12-W4" }],
  [101, "Penjualan Brush Aerator 120 unit per kuartal", { target_weeks: "12-W4" }],
  [102, "Penjualan Mini Aerator 245 unit per kuartal", { target_weeks: "12-W4" }],
  [103, "Penjualan EBII System 50 unit per kuartal", { target_weeks: "12-W4" }],
  [104, "Penjualan Smart Energy 140 unit per kuartal", { target_weeks: "12-W4" }],
  [105, "75 mitra aktif Crustagenik per kuartal", { target_weeks: "12-W4" }],
  [106, "Total grant disetujui senilai US$2 juta", { target_period: null, target_weeks: "12-W4" }],
  [107, "Penjualan Krasty Food 300 toples per kuartal (PO Batch 1 maklon)", { target_value: 300, target_unit: "toples", target_period: Q, target_weeks: "12-W4" }],
  [108, "Proyeksi sales teknologi 2027 per produk disetujui CEO", { target_value: 1, target_unit: "dokumen", target_weeks: "12-W2" }],
  [109, "Riset market petambak: 200 responden terkumpul & dianalisis", { target_weeks: "12-W2" }],
  [110, "25 champion farmers (influencer petambak) terhubung & aktif", { target_weeks: "12-W4" }],
  // CA
  ...[5, 6, 7, 8].map((id, i) => [id, `Dokumen permohonan paten final: ${["Mini-aerator 2.0", "Brush Aerator", "Smart Energy", "EBII System"][i]}`, {}]),
  ...[9, 10, 11, 12].map((id, i) => [id, `Terdaftar di DJKI: ${["Mini-aerator 2.0", "Brush Aerator", "Smart Energy", "EBII System"][i]}`, {}]),
  [20, "Dokumen internal audit IMS lengkap untuk semua departemen", {}],
  [21, "Pelatihan IMS terlaksana untuk seluruh karyawan", {}],
  [22, "Audit ISO IMS (9001:2015 & 14001:2015) terlaksana", {}],
  [24, "Peraturan Perusahaan terdaftar di Disnaker Semarang", {}],
  ...[[26, "Administrasi Keuangan (BBPVP)"], [27, "Head of Corporate Affairs"], [28, "IoT / Software Development Intern"],
      [29, "Administrasi Pengadaan / Gudang Intern (BBPVP)"], [30, "Aquaculture Farm Supervisor (Project-Based)"],
      [31, "Field Sales Representative"], [32, "Sales Support / Customer Service Intern (BBPVP)"], [33, "Video Editor Intern (BBPVP)"],
      [34, "Brand Intern Krasty Food (BBPVP)"]].map(([id, role]) => [id, `Posisi terisi: ${role}`, {}]),
  [35, "Manpower Plan Q4 disetujui CEO", {}],
  [36, "Manpower Plan 2027 disetujui CEO", {}],
  ...[[37, "Onboarding & Offboarding"], [38, "Rekrutmen"], [39, "Performance Review"], [40, "Training & Development"],
      [41, "Exit & Handover"], [42, "Human Capital Operations"]].map(([id, s]) => [id, `SOP ${s} disahkan & tayang di menu Prosedur`, {}]),
  ...[[44, "Aquaculture"], [45, "Business Development & Sales"], [47, "Digital Marketing"], [48, "Finance"], [49, "Technology Operations"]]
    .map(([id, d]) => [id, `Training departemen ${d} terlaksana (min. 1 sesi)`, { target_value: 1, target_unit: "sesi" }]),
  [50, "Training & Development Plan 2027 disetujui CEO", {}],
  [51, "Performance Review Q3 2026 selesai untuk 100% karyawan & intern", { target_value: 100, target_unit: "%" }],
  [52, "Performance Review Q4 2026 selesai untuk 100% karyawan & intern", { target_value: 100, target_unit: "%" }],
  // DM
  [113, "Instagram mencapai 5.000 followers", { target_weeks: "12-W4" }],
  [114, "Engagement rate Instagram minimal 3% per bulan", { target_value: 3, target_unit: "%" }],
  [115, "Minimal 30% konten Instagram per bulan memuat ajakan inquiry (WA/website/marketplace)", { target_value: 30, target_unit: "%" }],
  [118, "Iklan berbayar Instagram berjalan setiap minggu (min. 4 kampanye per bulan)", { target_value: 4, target_unit: "kampanye" }],
  [123, "Tambahan 800 followers Instagram Q4", { target_value: 800, target_unit: "followers", target_weeks: "12-W4" }],
  [124, "Facebook mencapai 2.500 followers (komunitas petambak nasional)", { target_weeks: "12-W4" }],
  [127, "Iklan berbayar Facebook berjalan setiap minggu (min. 4 kampanye per bulan)", { target_value: 4, target_unit: "kampanye" }],
  [129, "Minimal 50 klik per bulan dari Facebook ke WhatsApp/marketplace", { target_value: 50, target_unit: "klik" }],
  [131, "Tambahan 100 followers Facebook Q2", { target_value: 100, target_unit: "followers" }],
  [132, "Tambahan 100 followers Facebook Q3", { target_value: 100, target_unit: "followers" }],
  [133, "Tambahan 100 followers Facebook Q4", { target_value: 100, target_unit: "followers", target_weeks: "12-W4" }],
  [134, "TikTok mencapai 2.000 followers", { target_weeks: "12-W4" }],
  [139, "Tambahan 50 followers TikTok Q4", { target_value: 50, target_unit: "followers", target_weeks: "12-W4" }],
  [140, "LinkedIn mencapai 5.000 followers", { target_weeks: "12-W4" }],
  [141, "Minimal 10 interaksi per bulan dari institusi, mitra, atau calon investor di LinkedIn", { target_value: 10, target_unit: "interaksi" }],
  [144, "Tambahan 200 followers LinkedIn Q3", { target_value: 200, target_unit: "followers" }],
  [145, "Tambahan 200 followers LinkedIn Q4", { target_value: 200, target_unit: "followers", target_weeks: "12-W4" }],
  ...["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    .map((m, i) => [146 + i, `Webinar/community event ${m} terlaksana (min. 1 sesi)`, { target_value: 1, target_unit: "sesi", target_weeks: `${i + 1}-W4` }]),
  // FA
  ...["Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => [60 + i, `Laporan keuangan bulanan ${m} final`, {}]),
  [67, "Laporan keuangan kuartalan Q3 2026 final", {}],
  [68, "Laporan keuangan kuartalan Q4 2026 final", {}],
  [71, "Dashboard akuntansi digital (Accumulate) terupdate untuk Q3", {}],
  [72, "Dashboard akuntansi digital (Accumulate) terupdate untuk Q4", {}],
  [74, "Review kepatuhan PPh 21 dan pajak lebih bayar selesai", { target_weeks: "12-W2" }],
  [77, "Checklist audit internal pengeluaran & kas Q3 selesai", {}],
  [78, "Checklist audit internal pengeluaran & kas Q4 selesai", {}],
  [79, "Audit keuangan eksternal Q3 selesai", {}],
  [80, "Audit keuangan eksternal Q4 selesai", {}],
  [81, "Audit eksternal tahunan 2026 oleh KAP selesai", { target_weeks: "12-W4" }],
  [87, "Laporan budget vs actual bulanan dengan variance di bawah 10%", { target_value: 10, target_unit: "%" }],
  [90, "RAB Aquagrowth Serang direview & dikonsolidasi Finance", { target_weeks: "11-W4" }],
  [91, "RAB Aquagrowth Jepara direview & dikonsolidasi Finance", { target_weeks: "11-W4" }],
  [93, "Strategi peningkatan profit margin disetujui CEO", { target_value: 1, target_unit: "dokumen", target_weeks: "12-W2" }],
  [95, "Penghematan biaya operasional minimal 10% dibanding anggaran Q4", { target_value: 10, target_unit: "%", target_period: Q, target_weeks: "12-W4" }],
  [99, "Budget Plan 2027 disetujui CEO", {}],
  // TO
  [184, "50 unit Brush Aerator dari Sharon diterima (branding Crustea & bergaransi)", { target_weeks: "12-W2" }],
  [185, "10 unit Brush Aerator dari Fordy diterima (branding Crustea & bergaransi)", { target_weeks: "12-W2" }],
  [186, "10 unit EBII high-end selesai diproduksi", { target_weeks: "12-W4" }],
  [187, "3 unit EBII mid-level selesai diproduksi", { target_weeks: "12-W4" }],
  [188, "4 unit Smart Energy selesai diproduksi", { target_weeks: "12-W4" }],
  [189, "All-tech (PLTS 2,5 kWp, baterai 51,2 kWh, inverter 5 kW) terpasang & beroperasi di Lampung", { target_weeks: "12-W2" }],
  [190, "EBII high-end terpasang & beroperasi di Lampung", { target_weeks: "12-W2" }],
  [191, "All-tech (PLTS 2,5 kWp, baterai 51,2 kWh, inverter 5 kW) terpasang & beroperasi di Jawa Barat", { target_weeks: "12-W4" }],
  [192, "Website tayang: kalkulator PLTS", { target_weeks: "12-W2" }],
  [193, "Website tayang: company profile", { target_weeks: "12-W2" }],
  [194, "Website tayang: halaman berita/news", { target_weeks: "12-W2" }],
  [195, "Aplikasi: fitur AI regresi data per komoditas berjalan", { target_weeks: "12-W4" }],
  [196, "Aplikasi Crustea terbit di Play Store", { target_weeks: "12-W4" }],
  [197, "Dashboard Grafana & rekomendasi AI siap didemokan ke investor dan P4G", { target_weeks: "11-W4" }],
  [198, "Sertifikat SDPPI Smart Energy terbit (uji BBPPT Depok)", { target_weeks: "12-W4" }],
  [199, "Sertifikat SDPPI EBII terbit (uji BBPPT Depok)", { target_weeks: "12-W4" }],
  ...[[200, "EBII System"], [201, "Mini aerator 2.0"], [202, "Brush aerator"], [203, "Smart Energy"]]
    .map(([id, p]) => [id, `Gambar isometri ${p} selesai untuk dokumen HKI`, { target_weeks: "11-W4" }]),
  [204, "Rekap leadtime 100% pesanan diperbarui setiap bulan", { target_value: 100, target_unit: "%" }],
  [205, "100% pending order terlacak beserta estimasi kirim", { target_value: 100, target_unit: "%" }],
  [206, "100% aset teknologi tercatat di menu Aset", { target_value: 100, target_unit: "%", target_weeks: "12-W2" }],
  [207, "Backlog repair EBII di seluruh lokasi (Bali, Lombok, Banyuwangi, dst.) selesai 100%", { target_value: 100, target_unit: "%", target_weeks: "12-W4" }],
  [208, "Backlog repair Smart Energy & PLTS selesai 100%", { target_value: 100, target_unit: "%", target_weeks: "12-W4" }],
  [209, "SOP alur pengadaan disahkan", { target_weeks: "12-W2" }],
  [210, "SOP pengiriman disahkan", { target_weeks: "12-W2" }],
  ...[[211, "CV BEP"], [212, "Sharon"], [213, "Fordy"]].map(([id, v]) => [id, `SLA tertulis disepakati dengan ${v}`, { target_weeks: "12-W2" }]),
  [214, "Spec sheet lengkap untuk semua produk teknologi", { target_weeks: "12-W4" }],
  [215, "Nameplate terpasang di semua unit baru", { target_weeks: "12-W4" }],
  [216, "Daftar sparepart + link pembelian lengkap untuk semua produk", { target_weeks: "12-W4" }],
  [217, "Manual book Aplikasi V3 Banjarnegara final", { target_weeks: "11-W4" }],
  [218, "Buku Saku (FAQ) semua produk terbit", { target_weeks: "11-W4" }],
  [219, "Konsep & konfigurasi auto-feeder 1 silo selesai (permintaan Pak Arief, Venambak, Pertamina Cilacap)", { target_weeks: "12-W4" }],
  [221, "Scorecard vendor (leadtime, OTD, kualitas) untuk semua vendor utama dievaluasi per kuartal", { target_period: Q, target_weeks: "12-W4" }],
  [222, "Rolling forecast produksi 3 bulan diperbarui setiap bulan", {}],
  [223, "Semi pull-system produksi diterapkan untuk minimal 1 produk", { target_value: 1, target_unit: "produk", target_weeks: "12-W4" }],
];

// Dihapus: duplikat, placeholder/salin-tempel, atau kegiatan sekali yang sudah lewat (alasan per item).
const DELETES = {
  169: "Salin-tempel: 'Eksekusi Trading Serang' di objective Magelang",
  174: "Salin-tempel: 'Eksekusi Trading Serang' di objective Aquagrowth Kendal/Tuban",
  178: "Digabung ke 'mitra RAS rumahan beroperasi' (pengadaan bagian dari eksekusi)",
  182: "Workshop tidak butuh Capex/modal kerja",
  111: "Duplikat BDS-A.2 Crustagenik",
  112: "Duplikat BDS-A.2 Krasty Food",
  96: "Duplikat FA-B.2 variance anggaran di bawah 10%",
  220: "Kegiatan sekali (onboarding untuk Lokakarya 30 Sep), bukan KPI",
};

// Objective diganti nama (semua item di kode itu).
const OBJECTIVES = { "AQ-A.4": "Revenue Stream: Aquagrowth tambak udang (Kendal, Tuban, Jepara)" };

// KPI baru dari tugas berjalan. pic = nama depan karyawan (atau null = departemen).
const INSERTS = [
  ["AQ", "AQ-B.1", "SOP & standar operasional Aquagrowth", "SOP Pendamping Aquagrowth + alur proses disahkan", "Sultan", { target_value: 1, target_unit: "SOP", target_weeks: "11-W4" }, "AQ-22"],
  ["BDS", "BDS-A.2", null, "Minimal 6 proposal grant diajukan per kuartal", "Ghailan", { target_value: 6, target_unit: "proposal", target_period: Q, target_weeks: "12-W4" }, "BDS-110, 112, 113, 60, 67, 76, 108"],
  ["BDS", "BDS-A.3", "Pendanaan CSR", "Minimal 4 proposal CSR diajukan per kuartal", "Bunyamin", { target_value: 4, target_unit: "proposal", target_period: Q, target_weeks: "12-W4" }, "BDS-40, 41, 92, 25, 106"],
  ["BDS", "BDS-A.3", "Pendanaan CSR", "Minimal 1 program CSR disetujui", "Bunyamin", { target_value: 1, target_unit: "program", target_weeks: "12-W4" }, "BDS-40, 92"],
  ["BDS", "BDS-B.2", "Skema pembiayaan petambak", "1 skema cicilan/kredit teknologi Crustea disepakati dengan lembaga keuangan", "Dian", { target_value: 1, target_unit: "skema", target_weeks: "12-W4" }, "BDS-50, 89, 98"],
  ["CA", "CA-A.4", "Pendaftaran merek", "Permohonan merek Brush Aerator & EBII System diajukan ke DJKI", "Taat", { target_value: 2, target_unit: "merek", target_weeks: "12-W2" }, "CA-33"],
  ["CA", "CA-C.2", "Kepatuhan korporasi tahunan", "RUPS Tahunan 2025 & Laporan Tahunan Perseroan selesai melalui notaris", "Taat", { target_weeks: "12-W2" }, "CA-86"],
  ["CA", "CA-C.2", "Kepatuhan korporasi tahunan", "Laporan Tahunan ke AHU dan LKPM dilaporkan tepat waktu", "Taat", { target_period: Q, target_weeks: "12-W2" }, "CA-85"],
  ["DM", "DM-C.1", "Konten website & penjualan", "Konten website Crustea (testimoni, foto petambak, produk) lengkap & tayang", "Ade", { target_weeks: "12-W2" }, "DM-26, 31, 36"],
  ["DM", "DM-C.1", "Konten website & penjualan", "Minimal 8 konten hard selling produk (SE, EBII, mini aerator, PLTS) per bulan", "Muhammad Al", { target_value: 8, target_unit: "konten" }, "DM-52, BDS-49"],
  ["FA", "FA-C.2", null, "RAB Aquagrowth Kendal direview & dikonsolidasi Finance", "Reza", { target_weeks: "11-W4" }, "FA-25"],
  ["FA", "FA-F.1", "Arus kas & piutang", "Proyeksi cashflow 3 bulan diperbarui setiap bulan", "Reza", {}, "FA-22"],
  ["FA", "FA-F.1", "Arus kas & piutang", "100% piutang jatuh tempo tertagih (termasuk Komdigi)", "Reza", { target_value: 100, target_unit: "%", target_weeks: "12-W4" }, "FA-49"],
  ["TO", "TO-G.1", "Monitoring dampak teknologi P4G", "Timeline monitoring seluruh PLTS terpasang selesai untuk laporan P4G", "Yuliana", { target_weeks: "11-W4" }, "TO-70, 71"],
  ["TO", "TO-G.1", "Monitoring dampak teknologi P4G", "SOP pengukuran dampak teknologi & monitoring after-sales disahkan", "Yuliana", { target_weeks: "12-W2" }, "TO-72"],
  ["TO", "TO-G.1", "Monitoring dampak teknologi P4G", "Data budidaya minimal 3 pengguna teknologi terkumpul sebagai bukti untuk calon customer", "Vio", { target_value: 3, target_unit: "pengguna", target_weeks: "12-W4" }, "TO-60"],
];

const must = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const backupFile = new URL("./2026-11-06-backup-kpi.json", import.meta.url);
if (fs.existsSync(backupFile)) throw new Error("Skrip ini sudah pernah dijalankan (file cadangan sudah ada).");

const all = must(await sb.from("kpi_items").select("*").order("id"));
fs.writeFileSync(backupFile, JSON.stringify(all, null, 1));
const byId = new Map(all.map((k) => [k.id, k]));
const emps = must(await sb.from("employees").select("id, full_name, email").eq("is_active", true));
const athar = emps.find((e) => e.email === "rafi.niffarii@gmail.com").id;
const pic = (first) => {
  const m = emps.filter((e) => e.full_name === first || e.full_name.startsWith(`${first} `));
  if (m.length !== 1) throw new Error(`PIC "${first}" tidak unik/tidak ada`);
  return m[0].id;
};
const stamp = { updated_at: new Date().toISOString(), updated_by: athar };
const audit = [];

for (const [id, item, extra] of UPDATES) {
  const old = byId.get(id);
  if (!old) throw new Error(`KPI ${id} tidak ada`);
  const row = { item, ...extra, ...stamp };
  const data = must(await sb.from("kpi_items").update(row).eq("id", id).select("*").single());
  audit.push({ table_name: "kpi_items", row_id: String(id), action: "kpi_update", old_data: old, new_data: data, actor: athar, reason: REASON });
}
for (const [code, objective] of Object.entries(OBJECTIVES)) {
  must(await sb.from("kpi_items").update({ objective }).eq("objective_code", code));
  audit.push({ table_name: "kpi_items", row_id: code, action: "kpi_objective_rename", old_data: { objective: all.find((k) => k.objective_code === code).objective }, new_data: { objective }, actor: athar, reason: REASON });
}
for (const [id, why] of Object.entries(DELETES)) {
  const old = byId.get(Number(id));
  if (!old) throw new Error(`KPI ${id} tidak ada`);
  must(await sb.from("kpi_items").delete().eq("id", id));
  audit.push({ table_name: "kpi_items", row_id: id, action: "kpi_delete", old_data: old, new_data: null, actor: athar, reason: `${REASON}. ${why}` });
}
for (const [dept, code, objective, item, who, extra, tasks] of INSERTS) {
  const obj = objective ?? all.find((k) => k.objective_code === code).objective;
  const row = { dept_code: dept, objective_code: code, objective: obj, item, pic_type: who ? "person" : "department", pic_id: who ? pic(who) : null, ...extra, ...stamp };
  const data = must(await sb.from("kpi_items").insert(row).select("*").single());
  audit.push({ table_name: "kpi_items", row_id: String(data.id), action: "kpi_insert", old_data: null, new_data: data, actor: athar, reason: `${REASON}. Dari tugas ${tasks}` });
}
must(await sb.from("audit_log").insert(audit));
console.log(`Diubah ${UPDATES.length}, objective diganti ${Object.keys(OBJECTIVES).length}, dihapus ${Object.keys(DELETES).length}, ditambah ${INSERTS.length}. audit_log: ${audit.length} baris.`);
