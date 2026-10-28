# Modul 8: Aquaculture > Project Management

Permintaan Athar (28 Okt 2026): menu sidebar **Aquaculture** → **Project Management**. Isinya identifikasi &
data peluang, dipisah 4 proyek utama (**Aquagrowth, Mini RAS, Workshop, Pelatihan**) sesuai KPI departemen
AQ, tampil seperti pipeline penjualan dan tersambung ke target kuartal. Di dalamnya analisis **kelayakan
finansial + RAB** (tanpa kelayakan teknis & operasional) sebagai satu paket yang di-review F&A (muncul di
halaman Review F&A), lalu disetujui CEO. Sisanya mengikuti SOP: ada status progres kontrak; isi kontrak
berbeda per proyek (Aquagrowth: modal investor + persentase; Mini RAS, Workshop, Pelatihan: nomor kontrak).

Migrasi: `migrations/015_aquaculture.sql`. Kode bersama: `src/lib/aquaculture.ts` (rumus RAB).
Halaman: `/aquaculture` (pipeline), `/aquaculture/baru`, `/aquaculture/[id]`, `/aquaculture/[id]/rab`.

## Sumber: SOP Aquaculture (Pengembangan Usaha Akuakultur)

Tujuan: menjalankan Aquagrowth, Mini RAS, dan workshop secara layak dan terukur. Lingkup: Aquagrowth
(budidaya), sistem Mini RAS, workshop & pelatihan, peluang sampai laporan hasil.

| No | Langkah | PIC | Output | Batas / koordinasi |
|---|---|---|---|---|
| 1 | Identifikasi peluang (template data peluang) | Aquaculture Staff | Data peluang | — |
| 2 | Kelayakan finansial; rencana usaha (RAB, timeline) | Aquaculture Staff | Rencana usaha + RAB | ke FA |
| 3 | Review lintas tim (Finance, TO, DM) | Head of Aquaculture | Catatan review | ≤ 3 hari kerja |
| 4 | Persetujuan rencana usaha | CEO | Rencana disetujui | — |
| 5 | Presentasi & negosiasi dengan mitra/investor/peserta | Head of Aquaculture | Kesepakatan | — |
| 6 | Kontrak / kerja sama (Form Permohonan Kontrak) | Head of Aquaculture | Perjanjian | ke CA |
| 7 | Eksekusi: budidaya (nila, vaname), RAS, atau workshop | Aquaculture Staff | Data budidaya / dokumentasi | sesuai rencana |
| 8 | Monitoring, evaluasi, laporan bulanan | Aquaculture Staff | Laporan bulanan | akhir bulan, ke MGT |
| 9 | Jual hasil panen: langsung, atau lewat Busdev (Trading/Krasty Food) | Head of Aquaculture | Data panen & stok | ke BDS |

## KPI departemen AQ (dibaca dari `kpi_items`, 28 Okt 2026)

AQ-A.1 Trading (ikan & udang 5.000 kg, ekspor PT FIR) · AQ-A.2 Aquagrowth Serang · AQ-A.3 Aquagrowth Magelang ·
AQ-A.4 Aquagrowth lain · AQ-A.5 RAS Rumahan (min. 38 mitra) · AQ-A.6 Workshop (3x/3 bulan). Item tiap proyek:
Konsolidasi RAB dengan Finance → Deal dengan investor/partner → Pengadaan CAPEX/OPEX/WOCAP → Eksekusi.
Tahap aplikasi: "Konsolidasi RAB" = Review F&A s.d. Disetujui CEO; "Deal" = Kontrak ditandatangani;
"Eksekusi" = Eksekusi & monitoring. Pengadaan tetap lewat modul Pengadaan (#4). KPI tetap dicentang manual di `/kpi`.

Target kuartal (`target_sources` divisi Aquaculture): **Aquagrowth Project** (label alokasi `Aquagrowth`; strategi
Q2 juga memuat RAS, pendampingan mitra, workshop & pelatihan) dan **Trading Ikan dan Udang** (`Trading Ikan`).

## Keputusan

1. **Jenis proyek** (`aqua_projects.type`): `aquagrowth` Aquagrowth, `mini_ras` Mini RAS, `workshop` Workshop,
   `training` Pelatihan. Nomor otomatis `AQ-2026-001`.
2. **Tahap** (hanya lewat RPC `change_aqua_stage`, kecuali tahap 2-5 yang digerakkan paket RAB):
   1 `opportunity` Identifikasi peluang → 2 `plan` Kelayakan & RAB → 3 `fa_review` Review F&A → 4 `ceo_review`
   Menunggu CEO → 5 `approved` Disetujui CEO → 6 `negotiation` Presentasi & negosiasi → 7 `contract` Proses
   kontrak (form permohonan kontrak, CA dikabari) → 8 `signed` Kontrak ditandatangani → 9 `execution` Eksekusi &
   monitoring (laporan bulanan) → 10 `harvest` Panen & penjualan hasil (hanya Aquagrowth & Mini RAS) →
   11 `completed` Selesai (wajib ringkasan hasil). `cancelled` Batal (wajib alasan; tidak saat paket di F&A/CEO).
   Head AQ/admin/CEO boleh memundurkan tahap 6-11 (wajib alasan) dan membuka lagi proyek batal.
3. **Paket kelayakan finansial + RAB** = pengajuan `requests.kind = 'aqua_plan'` (nomor `RA-2026-0001`), isi di
   `requests.data` (struktur di bawah). Alur mesin pengajuan biasa: draf → Belum di-review → Sedang di-review →
   diterima F&A ⇒ **selalu** Menunggu CEO → "Disetujui CEO" (status `approved`). Perlu perbaikan / ditolak seperti
   biasa; ditolak → boleh buat paket baru. Tidak ada tahap "Ditransfer". `amount` = total modal (A+B+C), dihitung
   database (`aqua_plan_total`). Paket terlihat semua karyawan; tim AQ (bukan hanya pembuat) boleh mengubah isi
   saat draf/perlu perbaikan. Review lintas tim (langkah 3): AQ, TechOps, DM boleh memberi catatan di paket.
4. **Kontrak**: Aquagrowth wajib daftar investor `{name, capital, percent}`; persentase total 100%, modal > 0;
   nilai kontrak = jumlah modal. Mini RAS/Workshop/Pelatihan: nomor kontrak wajib saat ditandatangani.
   Semua: tanggal tanda tangan; nilai kontrak opsional.
5. **Target kuartal**: realisasi = **dana masuk** yang dicatat F&A/admin/CEO di halaman proyek (RPC
   `record_aqua_income`) → baris `revenues` berstatus Lunas + `aqua_project_id`, label alokasi bawaan
   `Aquagrowth` (bisa dipilih lain, mis. `Trading Ikan` untuk panen yang dijual lewat Busdev). `/kpi/target`
   tidak berubah: realisasi masuk otomatis per bulan dana masuk. Proyeksi pipeline (perkiraan nilai) tampil di
   `/aquaculture`, tidak mengubah target. Hanya setelah kontrak ditandatangani.
6. **Hak akses**: semua karyawan melihat proyek & paket. Tambah/ubah data peluang & tahap: departemen AQ, admin,
   CEO. Tanda tangan kontrak: AQ atau CA. F&A meninjau paket; CEO/admin menyetujui. Catatan: semua karyawan.
   Laporan bulanan (bulan + link): tim AQ, mulai tahap eksekusi, notifikasi ke MGT.
7. Lampiran tetap **link saja**.

## Data peluang (form proyek)

Jenis, nama proyek, lokasi, calon mitra/investor/klien/peserta, kontak, asal peluang, deskripsi (latar belakang,
potensi), perkiraan nilai (Rp), perkiraan mulai, PIC (default pembuat).

## Template RAB (dari "3. RAB Aquagrowth; Serang, Banten; Ikan Nila" 30-09-2026)

`requests.data` paket `aqua_plan`:

```
project_id
general:   { project_name, location, period, commodity, ponds, area_per_pond }
commodity: { name, area_m2, density, survival_pct, size_per_kg, fcr, cycle_months, cycles_per_year }
capex:     [{ desc, qty, uom, volume, price, note, salvage, lifetime_months }]   A. CAPITAL EXPENDITURES
workcap:   [{ desc, qty, uom, volume, price, note }]                             B. WORKING CAPITAL
opex:      [{ desc, qty, uom, volume, price, note }]                             C. OPERATIONAL EXPENSES
revenue:   [{ commodity, desc, qty, uom, price, note }]                          REVENUE PROJECTION (1 siklus)
params:    { bonus_pct: 10, zakat_pct: 2.5, investor_pct: 70, bep_unit: "kg" }
timeline:  [{ activity, when }]
summary:   ringkasan kelayakan / asumsi (teks)
```

Rumus (`src/lib/aquaculture.ts`, angka contoh Serang dalam kurung):

- Info komoditas: jumlah tebar = luas × kepadatan (420 × 25 = 10.500); populasi = tebar × SR (8.400);
  biomassa kg = populasi ÷ ukuran ekor/kg (2.100); total pakan = biomassa × FCR (2.520).
- Baris biaya: total = qty × volume × harga satuan (dibulatkan). Depresiasi/bulan = (total − harga sisa) ÷
  lifetime bulan ((10.000.000 − 1.000.000) ÷ 4 = 2.250.000).
- Total modal D = A + B + C (20.550.000 + 33.732.000 + 33.393.000 = 87.675.000).
- Pendapatan per siklus E = Σ qty × harga (97.809.380).
- Laba kotor F = E − (B + C) (30.684.380; label Excel "E-B" keliru, angkanya E − B − C).
- Bonus tim teknis 10% dan zakat 2,5% dari laba kotor (3.068.438 + 767.110). Laba bersih H = F − bonus − zakat
  (26.848.833). Bagi hasil investor 70% / Crustea 30% (18.794.183 / 8.054.650). Investor % bisa 0 untuk proyek
  tanpa investor.
- Margin kotor = F ÷ E (31,37%); margin bersih = H ÷ E (27,45%).
- Ringkasan tahunan = per siklus × siklus per tahun (2), sama dengan Excel (termasuk capex).
- Simulasi investasi: return investor per tahun = bagian investor × siklus/tahun (37.588.366);
  ROI per tahun = return per tahun ÷ total modal (42,9%; per bulan 3,57%). Payback = total modal ÷ return per
  tahun (2,3 tahun = 28 bulan). Bila investor 0%: memakai laba bersih per tahun.
- BEP (Excel #VALUE!, diperbaiki): U = jumlah qty baris pendapatan bersatuan `bep_unit` (2.100 kg), P = rata-rata
  harga baris itu (Rp25.400), pendapatan lain = pendapatan baris bersatuan lain (trading 44.469.380).
  Biaya tetap = A + C, biaya variabel/unit V = B ÷ U. BEP unit = (A + C − pendapatan lain) ÷ (P − V);
  BEP Rp = BEP unit × P; BEP harga = (A + B + C − pendapatan lain) ÷ U.
- Skenario: optimis pendapatan +15%, biaya usaha (B + C) −5%; pesimis pendapatan −10%, biaya +5%. Bonus + zakat
  dihitung ulang 12,5% dari laba usaha tiap skenario (Excel memakai angka normal untuk semua skenario).
  Potensi laba = pesimis s.d. optimis.
- Tidak disalin dari Excel: hitungan daya listrik (masuk saja sebagai baris opex), kelayakan teknis & operasional.

## Tabel baru (015)

`aqua_projects`, `aqua_project_events` (create, edit, stage, plan, note, report, income), `revenues.aqua_project_id`,
kind `aqua_plan` di `requests`, notifikasi jenis `aqua`. RPC: `change_aqua_stage`, `add_aqua_note`,
`record_aqua_income`. `change_request_status` dan `add_request_note` diganti (perubahan kecil untuk `aqua_plan`).
