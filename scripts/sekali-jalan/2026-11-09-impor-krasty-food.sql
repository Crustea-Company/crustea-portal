-- Impor Krasty Food (Keripik Kulit Ikan Nila 50g & 85g) ke Dashboard realisasi proyek.
-- Sumber: "Running Plan Krasty Food" (Breakdown, Realisasi, Stok), keadaan 9 Nov 2026.
-- Jalankan SETELAH migrasi 031, sekali saja: SQL Editor > New query > tempel > Run.
-- Aman dijalankan ulang: kalau proyek Krasty Food sudah ada, skrip berhenti tanpa mengubah apa pun.
--
-- Hasil:
-- - Proyek baru jenis "Proyek lain", kategori "Krasty Food" (nomor PL-…), tahap Eksekusi & monitoring.
--   PIC sementara = Rafi Niffari Athar (admin); ganti lewat halaman proyek > Ubah.
-- - Anggaran: Capex, modal kerja, pengemasan, opex, bahan baku (maklon), target penjualan per varian.
-- - Realisasi yang sudah dibayar (Rp2.697.680): toples 50g & 85g, stiker 85g, maklon tiga rasa 50g.
-- - Daftar stok: bahan baku per rasa (kg) dan toples per varian, dengan rencana dan harga jual. Belum ada mutasi stok.

do $$
declare
  v_pic uuid := '27356688-a245-43c5-9c5a-aff1304c4909';   -- Rafi Niffari Athar
  v_id  uuid;
begin
  if exists (select 1 from aqua_projects where category = 'Krasty Food') then
    raise notice 'Proyek Krasty Food sudah ada, impor dilewati.';
    return;
  end if;

  insert into aqua_projects (type, name, category, location, description, estimated_value, pic_id)
  values ('other', 'Krasty Food: Keripik Kulit Ikan Nila 50g & 85g', 'Krasty Food', null,
          'Produksi batch pertama keripik kulit ikan nila (maklon) 3 rasa x 2 ukuran: 30,3 kg bahan, 480 toples. '
          || 'Omzet rencana per batch Rp11.834.000. Dashboard realisasi terlihat semua karyawan.',
          11834000, v_pic)
  returning id into v_id;

  update aqua_projects set stage = 'execution', stage_since = now() where id = v_id;
  insert into aqua_project_events (project_id, actor, action, note)
  values (v_id, v_pic, 'note', 'Diimpor dari Running Plan Krasty Food (Breakdown, Realisasi, Stok).');

  -- Anggaran
  insert into project_budget_lines (project_id, kind, grp, item, note, qty, uom, price, sort) values
    (v_id, 'capex',   'Kebutuhan awal (Capex)', 'Timbangan Digital Presisi', '1 unit', 1, 'unit', 75000, 10),
    (v_id, 'capex',   'Kebutuhan awal (Capex)', 'Heat Gun', 'Untuk segel shrink wrap', 1, 'unit', 150000, 20),
    (v_id, 'capex',   'Kebutuhan awal (Capex)', 'Peralatan Sanitasi', 'Sarung tangan, hair net, apron', 1, 'paket', 50000, 30),
    (v_id, 'capex',   'Kebutuhan awal (Capex)', 'Printer Resi', '1 unit', 1, 'unit', 270000, 40),
    (v_id, 'expense', 'Modal kerja', 'Working Capital', 'Modal kerja kas / buffer', 1, 'paket', 1500000, 50),
    (v_id, 'expense', 'Pengemasan', 'Toples PET + Tutup - 50g', 'Toples ukuran 50g', 300, 'pcs', 2200, 60),
    (v_id, 'expense', 'Pengemasan', 'Toples PET + Tutup - 85g', 'Toples ukuran 85g', 180, 'pcs', 2450, 70),
    (v_id, 'expense', 'Pengemasan', 'Stiker Label - 50g', 'Vinyl/anti air', 300, 'pcs', 1200, 80),
    (v_id, 'expense', 'Pengemasan', 'Stiker Label - 85g', 'Vinyl/anti air', 180, 'pcs', 1200, 90),
    (v_id, 'expense', 'Pengemasan', 'Segel Plastik - 50g', 'Shrink wrap segel toples', 300, 'pcs', 130, 100),
    (v_id, 'expense', 'Pengemasan', 'Segel Plastik - 85g', 'Shrink wrap segel toples', 180, 'pcs', 130, 110),
    (v_id, 'expense', 'Pengemasan', 'Bahan Packing Pengiriman - 50g', 'Bubble wrap, lakban, label resi', 300, 'pcs', 651, 120),
    (v_id, 'expense', 'Pengemasan', 'Bahan Packing Pengiriman - 85g', 'Bubble wrap, lakban, label resi', 180, 'pcs', 651, 130),
    (v_id, 'expense', 'Opex per batch', 'Tenaga Kerja', 'Repacking & admin', 1, 'batch', 300000, 140),
    (v_id, 'expense', 'Opex per batch', 'Biaya Internet & Listrik', 'Warehouse rumah', 1, 'batch', 200000, 150),
    (v_id, 'expense', 'Opex per batch', 'Biaya Pemasaran', 'Ads e-commerce / tester', 1, 'batch', 300000, 160),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Original 50g', '5 kg x Rp130.000', 5, 'kg', 130000, 170),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Original 85g', '5,1 kg x Rp130.000', 5.1, 'kg', 130000, 180),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Pedas 50g', '5 kg x Rp140.000', 5, 'kg', 140000, 190),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Pedas 85g', '5,1 kg x Rp140.000', 5.1, 'kg', 140000, 200),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Salted Egg 50g', '5 kg x Rp160.000', 5, 'kg', 160000, 210),
    (v_id, 'expense', 'Bahan baku (maklon)', 'Maklon Salted Egg 85g', '5,1 kg x Rp160.000', 5.1, 'kg', 160000, 220),
    (v_id, 'income',  'Penjualan', 'Original 50g', 'HPP Rp10.681 · margin 46,33%', 100, 'toples', 19900, 230),
    (v_id, 'income',  'Penjualan', 'Original 85g', 'HPP Rp15.481 · margin 44,71%', 60, 'toples', 28000, 240),
    (v_id, 'income',  'Penjualan', 'Pedas 50g', 'HPP Rp11.181 · margin 48,00%', 100, 'toples', 21500, 250),
    (v_id, 'income',  'Penjualan', 'Pedas 85g', 'HPP Rp16.331 · margin 45,38%', 60, 'toples', 29900, 260),
    (v_id, 'income',  'Penjualan', 'Salted Egg 50g', 'HPP Rp12.181 · margin 47,04%', 100, 'toples', 23000, 270),
    (v_id, 'income',  'Penjualan', 'Salted Egg 85g', 'HPP Rp18.031 · margin 43,65%', 60, 'toples', 32000, 280);

  -- Realisasi (semua Lunas). "Metode / No. Bukti" di sheet berisi tanggal, jadi disimpan di catatan.
  insert into project_transactions (project_id, tx_date, kind, category, budget_line_id, description, amount, status, note, created_by)
  select v_id, x.d::date, 'expense', x.cat,
         (select id from project_budget_lines where project_id = v_id and item = x.item),
         x.item, x.amount, 'paid', x.note, v_pic
    from (values
      ('2026-10-09', 'Pengemasan',          'Toples PET + Tutup - 50g', 154900, 'Bukti 2026-Oct-9 · isi 50 pcs'),
      ('2026-10-09', 'Pengemasan',          'Toples PET + Tutup - 85g', 175900, 'Bukti 2026-Oct-9 · isi 50 pcs'),
      ('2026-10-10', 'Pengemasan',          'Stiker Label - 85g',       216880, 'Bukti 2026 Oct 10 · isi 50 pcs'),
      ('2026-10-09', 'Bahan baku (maklon)', 'Maklon Original 50g',      650000, 'Bukti 2026-Oct-9 · 5 kg'),
      ('2026-10-09', 'Bahan baku (maklon)', 'Maklon Pedas 50g',         700000, 'Bukti 2026-Oct-9 · 5 kg'),
      ('2026-10-09', 'Bahan baku (maklon)', 'Maklon Salted Egg 50g',    800000, 'Bukti 2026-Oct-9 · 5 kg')
    ) as x(d, cat, item, amount, note);

  -- Stok: bahan baku per rasa (kg) dan produk jadi per varian (toples).
  insert into project_stock_items (project_id, kind, name, size, unit, plan_qty, sale_price, sort) values
    (v_id, 'material', 'Original',   null,  'kg',     10.1, 0, 10),
    (v_id, 'material', 'Pedas',      null,  'kg',     10.1, 0, 20),
    (v_id, 'material', 'Salted Egg', null,  'kg',     10.1, 0, 30),
    (v_id, 'product',  'Original',   '50g', 'toples', 100, 19900, 40),
    (v_id, 'product',  'Original',   '85g', 'toples', 60,  28000, 50),
    (v_id, 'product',  'Pedas',      '50g', 'toples', 100, 21500, 60),
    (v_id, 'product',  'Pedas',      '85g', 'toples', 60,  29900, 70),
    (v_id, 'product',  'Salted Egg', '50g', 'toples', 100, 23000, 80),
    (v_id, 'product',  'Salted Egg', '85g', 'toples', 60,  32000, 90);

  raise notice 'Krasty Food diimpor: proyek %', (select number from aqua_projects where id = v_id);
end $$;
