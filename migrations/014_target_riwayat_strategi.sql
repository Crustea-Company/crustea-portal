-- 014: Target kuartal: rincian & progres per strategi, filter divisi, riwayat Q1-Q3 2026, impor Revenue Updated.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Jangan dijalankan dua kali
-- (pendapatan di bagian E akan tercatat ganda).
--
-- Menghapus data: hanya strategi sementara Q4 "Proyeksi awal (dari Excel)" (6 baris), diganti 17 strategi
-- rinci dari file Q4 Target per Divisi. Sumber data: file MONITORING TARGET 1,5 JUTA USD (4 tab CSV).

-- ---------- A. Kolom baru ----------
-- Target alokasi tetap (Rp): bila diisi, dipakai menggantikan bobot x total (riwayat Q2 tidak persis sesuai bobot).
alter table target_sources add column target_amount bigint check (target_amount >= 0);
-- Catatan strategi (indikator), realisasi per strategi (diisi manual), progres/keterangan.
alter table target_strategies
  add column note text,
  add column realization bigint check (realization >= 0),
  add column realization_note text;

-- Divisi PIC hanya Bisdev, Aquaculture, TechOps (Open Project masuk TechOps).
update target_sources set division = 'TechOps' where division in ('Teknologi & Bisdev', 'Teknologi, Bisdev');
alter table target_sources drop constraint target_sources_division_check; -- aturan lama 013: divisi tidak kosong
alter table target_sources add constraint target_sources_division_check
  check (division in ('Bisdev', 'Aquaculture', 'TechOps'));

-- ---------- B. Q4 2026: label alokasi disamakan dengan kolom ALOKASI di Revenue Updated ----------
update target_sources s set alloc_label = v.label
  from quarter_targets t,
       (values ('Aquagrowth Project', 'Aquagrowth'),
               ('Trading Ikan dan Udang', 'Trading Ikan'),
               ('Open Project', 'Open Project/CSR'),
               ('Grant / Sumber Lain', 'Sumber Lain / Grants')) as v(name, label)
 where t.id = s.target_id and t.year = 2026 and t.quarter = 4 and s.name = v.name;

-- ---------- C. Q4 2026: strategi sementara diganti strategi rinci (bagian D) ----------
delete from target_strategies g
 using target_sources s, quarter_targets t
 where g.source_id = s.id and t.id = s.target_id and t.year = 2026 and t.quarter = 4
   and g.strategy = 'Proyeksi awal (dari Excel)';

-- ---------- D. Riwayat Q1-Q3 2026 + strategi Q2-Q4 ----------
insert into quarter_targets (year, quarter, total, notes) values
  (2026, 1, 0, 'Target Q1 belum ada di file Excel; hanya realisasi dari tab Revenue Updated.'),
  (2026, 2, 13226394774, 'Dari file MONITORING TARGET 1,5 JUTA USD (Summary target Q2). Target per sumber = jumlah proyeksi strateginya.'),
  (2026, 3, 14000000001, 'Dari file MONITORING TARGET 1,5 JUTA USD (Strategi dan Realisasi Q3). "Sisa target Penjualan Teknologi Q2" (17%) dan "Penjualan Teknologi Q3" (38%) digabung menjadi satu sumber. Pipeline grant P4G Q1-Q4: USD 350.000 (Air Asia Foundation USD 25.000, The University of Melbourne USD 3.465,17, DIV Funding, IFC World Bank).');

insert into target_sources (target_id, name, division, weight, target_amount, alloc_label, from_sales, sort)
select t.id, s.name, s.division, s.weight, s.amount, s.label, false, s.sort
  from quarter_targets t
  join (values
    (1, 'Penjualan Teknologi',      'Bisdev',      null::numeric, null::bigint, 'Penjualan Teknologi',  1),
    (1, 'Aquagrowth Project',       'Aquaculture', null, null,       'Aquagrowth',           2),
    (1, 'Trading Ikan dan Udang',   'Aquaculture', null, null,       'Trading Ikan',         3),
    (1, 'Open Project',             'TechOps',     null, null,       'Open Project/CSR',     4),
    (1, 'Sumber Lain (Grant, dll)', 'Bisdev',      null, null,       'Sumber Lain / Grants', 5),
    (2, 'Penjualan Teknologi',      'Bisdev',      21, 2719500000,   'Penjualan Teknologi',  1),
    (2, 'Aquagrowth Project',       'Aquaculture', 38, 5000000000,   'Aquagrowth',           2),
    (2, 'Trading Ikan/Udang',       'Aquaculture', 15, 2000000000,   'Trading Ikan',         3),
    (2, 'Open Project',             'TechOps',     11, 1506894774,   'Open Project/CSR',     4),
    (2, 'Sumber Lain (Grant, dll)', 'Bisdev',      15, 2000000000,   'Sumber Lain / Grants', 5),
    (3, 'Penjualan Teknologi',      'Bisdev',      55, null,         'Penjualan Teknologi',  1),
    (3, 'Aquagrowth Project',       'Aquaculture', 20, null,         'Aquagrowth',           2),
    (3, 'Trading Ikan dan Udang',   'Aquaculture', 8,  null,         'Trading Ikan',         3),
    (3, 'Krasty Food',              'Bisdev',      null, null,       'Krasty Food',          4),
    (3, 'Open Project',             'TechOps',     15, null,         'Open Project/CSR',     5),
    (3, 'Sumber Lain (Grant, dll)', 'Bisdev',      2,  null,         'Sumber Lain / Grants', 6)
  ) as s(quarter, name, division, weight, amount, label, sort) on t.year = 2026 and t.quarter = s.quarter;

-- Q1 tanpa strategi. Realisasi per strategi hanya ada di file untuk Q2.
insert into target_strategies (source_id, strategy, projection, note, realization, realization_note, sort)
select s.id, g.strategy, g.projection, g.note, g.realization, g.realization_note, g.sort
  from quarter_targets t
  join target_sources s on s.target_id = t.id
  join (values
    (2, 'Penjualan Teknologi', '25 unit Solar panel',   875000000::bigint, null::text, 187000000::bigint, '1 unit Solar panel', 1),
    (2, 'Penjualan Teknologi', '75 unit Brush aerator', 525000000,  null, 363600000, '58 unit Brush aerator', 2),
    (2, 'Penjualan Teknologi', '175 unit Mini aerator', 612500000,  null, 240680000, '68 unit Mini aerator', 3),
    (2, 'Penjualan Teknologi', '100 unit Paddle wheel', 0,          null, 0,         '0 unit Paddle wheel', 4),
    (2, 'Penjualan Teknologi', '35 unit EBII system',   455000000,  null, 174700000, '5 unit EBII system', 5),
    (2, 'Penjualan Teknologi', '90 unit Smart energy',  252000000,  null, 302935360, '101 unit Smart energy', 6),
    (2, 'Aquagrowth Project', 'Aquaculture 18 Project', 3000000000, null, 304007224, E'Aquaculture 2 Project:\n1. Serang, Banten\n2. Pecangaan, Jepara', 1),
    (2, 'Aquagrowth Project', 'Pendampingan 150 mitra', 300000000,  null, 152047800, '100 mitra', 2),
    (2, 'Aquagrowth Project', 'Project RAS 250 unit',   1200000000, null, 0,         '0 unit', 3),
    (2, 'Aquagrowth Project', 'Workshop dan Pelatihan 2.000 mahasiswa', 500000000, null, 0, '0 mahasiswa', 4),
    (2, 'Trading Ikan/Udang', 'Trading Ikan 6.000 - 8.000 kg', 2000000000, null, 5949400, 'Laba Bersih Trading Ikan', 1),
    (2, 'Open Project', 'CSR, Project Panel surya non tambak dll', 1506894774, null, 0, '0 open project', 1),
    (2, 'Sumber Lain (Grant, dll)', 'Grants', 500000000, null, 114225000,
       E'Pertamina Foundation Termin 2 Rp15.000.000\nPT Ghana Utamadi Rp69.925.000\nDGI Aerator Mini Rp17.500.000\nDGI Aerator Brush Rp11.800.000', 1),
    (2, 'Sumber Lain (Grant, dll)', 'Empowerment Project', 1500000000, null, 19754000, 'DGI Women Empowerment', 2),
    (2, 'Sumber Lain (Grant, dll)', 'Crustagenic', 0, null, null, null, 3),

    (3, 'Penjualan Teknologi', 'Sisa target Q2: 24 unit Solar panel',    688000000, null, null, null, 1),
    (3, 'Penjualan Teknologi', 'Sisa target Q2: 120 unit Brush aerator', 828000000, null, null, null, 2),
    (3, 'Penjualan Teknologi', 'Sisa target Q2: 107 unit Mini aerator',  371820000, null, null, null, 3),
    (3, 'Penjualan Teknologi', 'Sisa target Q2: 100 unit Paddle/brush',  0,         null, null, null, 4),
    (3, 'Penjualan Teknologi', 'Sisa target Q2: 30 unit EBII system',    280300000, null, null, null, 5),
    (3, 'Penjualan Teknologi', 'Sisa target Q2: 90 unit Smart energy',   252000000, null, null, null, 6),
    (3, 'Penjualan Teknologi', 'Penjualan Teknologi Q3', 5279880001, 'Rincian strategi: TBD', null, null, 7),
    (3, 'Aquagrowth Project', 'Aquaculture minimal 3 project', 2800000000, 'Lokasi project belum ditentukan', null, null, 1),
    (3, 'Trading Ikan dan Udang', 'Terjual 1 ton (ikan) dan mendapatkan 2 konsumen ekspor (udang)', 1120000000,
       'Rincian: Ekspor udang ... kg, Penjualan Ikan ... kg', null, null, 1),
    (3, 'Krasty Food', 'Krasty Food', 0, null, null, null, 1),
    (3, 'Open Project', 'CSR, Vendor, TBD', 2100000000, null, null, null, 1),
    (3, 'Sumber Lain (Grant, dll)', 'Grant', 280000000, null, null, null, 1),

    (4, 'Penjualan Teknologi', '10 unit Solar panel',    750000000, null, null, null, 1),
    (4, 'Penjualan Teknologi', '110 unit Brush aerator', 759000000, null, null, null, 2),
    (4, 'Penjualan Teknologi', '100 unit Mini aerator',  300000000, null, null, null, 3),
    (4, 'Penjualan Teknologi', '30 unit EBII system',    290000000, null, null, null, 4),
    (4, 'Penjualan Teknologi', '90 unit Smart energy',   200000000, null, null, null, 5),
    (4, 'Krasty Food', 'Krasty Food', 50000000, null, null, null, 1),
    (4, 'Grant / Sumber Lain', 'Target Grant Baru', 500000000, null, null, null, 1),
    (4, 'Aquagrowth Project', 'Aquaculture Tuban', 1200000000, 'Indikator: minimal 3 project', null, null, 1),
    (4, 'Aquagrowth Project', 'Aquaculture Kendal', 400000000, null, null, null, 2),
    (4, 'Aquagrowth Project', 'Aquaculture add on (investor baru)', 300000000, null, null, null, 3),
    (4, 'Aquagrowth Project', 'Aquaculture Pak Azwin', 4800000000, null, null, null, 4),
    (4, 'Aquagrowth Project', 'Aquaculture Hidayatullah', 1600000000, null, null, null, 5),
    (4, 'Trading Ikan dan Udang', 'Ekspor udang ... kg', 500000000, E'- terjual 1 ton ikan dan\n- terjual 2 konsumen ekspor udang', null, null, 1),
    (4, 'Trading Ikan dan Udang', 'Penjualan Ikan ... kg', 150000000, null, null, null, 2),
    (4, 'Open Project', 'CSR', 300000000, null, null, null, 1),
    (4, 'Open Project', 'Vendor', 300000000, null, null, null, 2),
    (4, 'Open Project', 'TBD', 0, null, null, null, 3)
  ) as g(quarter, source, strategy, projection, note, realization, realization_note, sort)
    on t.year = 2026 and t.quarter = g.quarter and s.name = g.source;

-- ---------- E. Pendapatan dari tab Revenue Updated (Jan-Sep 2026, semua PAID) ----------
-- Dibuat otomatis dari CSV. Baris "4-Mar-2025" (PERTAMINA ULUBELU, di bawah MARET) dianggap 2026;
-- baris "PENELITIAN BESTARI" (Juni) dilewati karena tanpa nilai dan dananya tidak diterima.
insert into revenues (revenue_date, amount, allocation, status, description) values
  ('2026-01-28', 14000000, 'Sumber Lain / Grants', 'paid', 'YAYASAN CULTURE ARTS SCIENCE TECHNO / DGI · BATOO FARM (4 mini aerator, SEKAR 0045/INVC)'),
  ('2026-01-28', 2100000, 'Sumber Lain / Grants', 'paid', 'YAYASAN CULTURE ARTS SCIENCE TECHNO / DGI · BATOO FARM (SE, SEKAR 0047/INVC)'),
  ('2026-02-20', 75000000, 'Sumber Lain / Grants', 'paid', 'YAYASAN CULTURE ARTS SCIENCE TECHNO / DGI · BATOO FARM (PLTS, SKR/003/2025/12)'),
  ('2026-02-20', 127400000, 'Open Project/CSR', 'paid', 'PERTAMINA POWER INDONESIA · PLTS CILAMAYA'),
  ('2026-02-25', 41000000, 'Open Project/CSR', 'paid', 'BALAI JEPARA · PLTS 1.5 KWP'),
  ('2026-02-27', 25000000, 'Sumber Lain / Grants', 'paid', 'YAYASAN CULTURE ARTS SCIENCE TECHNO / DGI · BATOO FARM (EBII, SKR/015/2026/01)'),
  ('2026-03-04', 131810000, 'Open Project/CSR', 'paid', 'PERTAMINA ULUBELU · PLTS ULUBELU'),
  ('2026-03-09', 223491083, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q4'),
  ('2026-03-12', 166508, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q4'),
  ('2026-03-17', 35000000, 'Open Project/CSR', 'paid', 'PERTAMINA FOUNDATION · PF SAINS 70%'),
  ('2026-03-30', 279067250, 'Open Project/CSR', 'paid', 'BHUMI JATI POWER, PT · PLTS JEPARA 4 TITIK'),
  ('2026-04-23', 12780000, 'Penjualan Teknologi', 'paid', 'CICILAN ROZIKIN · MINI AERATOR'),
  ('2026-04-27', 6695500, 'Penjualan Teknologi', 'paid', 'PAK MADE BALI · AERATOR BRUSH DAN ONGKIR'),
  ('2026-04-30', 69925000, 'Penjualan Teknologi', 'paid', 'PT GHANA UTAMADI DHUNIARA · AERATOR BRUSH DAN ONGKIR'),
  ('2026-05-11', 15000000, 'Sumber Lain / Grants', 'paid', 'PERTAMINA FOUNDATION TERMIN 2 · PF SAINS'),
  ('2026-05-21', 62271000, 'Penjualan Teknologi', 'paid', 'PT ROYAL KORINDAH · DP PLTS'),
  ('2026-05-23', 1400000, 'Penjualan Teknologi', 'paid', 'INDERAAGRI · REFUND APPS'),
  ('2026-06-05', 17500000, 'Sumber Lain / Grants', 'paid', 'DGI : Aerator Mini · DGI SEKAR (5 mini aerator, SKR/055/2026/05)'),
  ('2026-06-05', 11800000, 'Sumber Lain / Grants', 'paid', 'DGI : Aerator Brush · DGI SEKAR (2 brush, SKR/056/2026/06)'),
  ('2026-06-05', 19754000, 'Sumber Lain / Grants', 'paid', 'DGI : WE · DGI SEKAR (Termin 1 WE, SKR/058/2026/06)'),
  ('2026-06-07', 4600000, 'Penjualan Teknologi', 'paid', 'Beli 2 mini aerator dan ongkir (DP) · MINI AERATOR'),
  ('2026-06-12', 3500000, 'Sumber Lain / Grants', 'paid', 'GDI ; mini aerator · DGI SEKAR (SKR/057/2026/06)'),
  ('2026-06-22', 171424589, 'Open Project/CSR', 'paid', 'BIMTEK KOMDIGI · KOMDIGI'),
  ('2026-06-29', 12564000, 'Penjualan Teknologi', 'paid', 'GRACIELIA MINI AERATOR · MINI AERATOR'),
  ('2026-06-30', 133569674, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q1 2026'),
  ('2026-07-03', 14749000, 'Sumber Lain / Grants', 'paid', 'DGI = CB Termin 2 · DGI SEKAR (SKR/064/2026/06)'),
  ('2026-07-03', 19754000, 'Sumber Lain / Grants', 'paid', 'DGI = Termin 2 · DGI SEKAR (SKR/062/2026/06)'),
  ('2026-07-07', 244122677, 'Open Project/CSR', 'paid', 'DP Komdigi 30% · KOMDIGI IOT'),
  ('2026-07-11', 1843500, 'Penjualan Teknologi', 'paid', 'Beli teknologi - Sodikin · Sales Petambak'),
  ('2026-07-30', 2000000, 'Penjualan Teknologi', 'paid', 'Beli teknologi - Rizhar Eman · Sales Petambak'),
  ('2026-08-19', 181188000, 'Sumber Lain / Grants', 'paid', 'Cost share sureco untuk CFFSR · P4G (pembayaran plts lombok sumbawa dan aerator)'),
  ('2026-08-19', 4283000, 'Penjualan Teknologi', 'paid', 'Beli teknologi - Rizhar Eman · Sales Petambak'),
  ('2026-09-10', 70000000, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q2 2026'),
  ('2026-09-16', 188973230, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q2 2026'),
  ('2026-09-17', 188973230, 'Sumber Lain / Grants', 'paid', 'YAYASAN SU RE TANGGUH · PENCAIRAN Q2 2026'),
  ('2026-09-18', 14749000, 'Sumber Lain / Grants', 'paid', 'DGI = CB Termin 2 · DGI SEKAR (SKR/065/2026/06)'),
  ('2026-09-30', 1329800, 'Sumber Lain / Grants', 'paid', 'DGI · DGI SEKAR (SKR/075/2026/09 MCM)'),
  ('2026-09-30', 17500000, 'Sumber Lain / Grants', 'paid', 'DGI · DGI SEKAR (SKR/030/2026/03 MCM)'),
  ('2026-09-30', 10777997, 'Sumber Lain / Grants', 'paid', 'Cek Ongkir DGI · DGI SEKAR'),
  ('2026-09-30', 11800000, 'Sumber Lain / Grants', 'paid', 'Cek Ongkir DGI · DGI SEKAR'),
  ('2026-09-30', 16932000, 'Sumber Lain / Grants', 'paid', 'DGI = WE Termin 3 · DGI SEKAR'),
  ('2026-09-30', 12642000, 'Sumber Lain / Grants', 'paid', 'DGI = CB Termin 3 · DGI SEKAR');
