-- =====================================================================
-- Bersih-bersih data uji sebelum demonstrasi (27 Okt 2026). DISETUJUI ATHAR.
-- Jalankan SEKALI di Supabase: SQL Editor > New query > tempel > Run
-- Semua langkah berjalan bersama: kalau ada satu yang gagal, TIDAK ADA yang berubah.
--
-- Yang dihapus: data uji akun rafi.niffarii@gmail.com dan atharwasd@gmail.com
-- (pengajuan, lead, aset, gerakan stok, tugas uji, catatan, pengingat, log kerja,
-- notifikasi), 7 nilai ketercapaian September hasil uji kunci ulang, dan SELURUH riwayat
-- (audit_log + task_history).
-- Yang TIDAK disentuh: akun karyawan, tugas & PIC asli, nilai impor Jul-Sep, daftar barang stok,
-- produk, prosedur, data KPI asli.
-- =====================================================================

begin;

-- Alasan wajib untuk menghapus log di periode yang sudah dikunci (aturan koreksi).
select set_config('app.change_reason', 'Bersih-bersih data uji sebelum demonstrasi', true);

create temp table akun_uji on commit drop as
  select id from employees where email in ('rafi.niffarii@gmail.com', 'atharwasd@gmail.com');

-- 1. Pengajuan uji (riwayat status, lampiran, dan notifikasinya ikut terhapus).
delete from requests where requester_id in (select id from akun_uji);

-- 2. Penjualan, stok, aset uji. Stok dihitung dari gerakan, jadi kembali seperti sebelum uji.
delete from stock_moves where actor in (select id from akun_uji);
delete from assets where created_by in (select id from akun_uji);
delete from sales_leads where created_by in (select id from akun_uji);

-- 3. Tugas uji, catatan, dan pengingat; kembalikan tugas asli yang diubah saat uji.
delete from tasks where code in ('BDS-114', 'CA-102');
delete from task_notes where author_id in (select id from akun_uji);
delete from task_reminders where employee_id in (select id from akun_uji);
update tasks set status = 'on_going' where code = 'AQ-41';            -- semula Berjalan
update tasks set updated_by = null where updated_by in (select id from akun_uji);

-- 4. Log kerja uji (termasuk "Uji coba" 15 Sep di periode terkunci).
delete from work_logs where employee_id in (select id from akun_uji);

-- 5. KPI: kembalikan catatan seperti data awal (BDS-A.2 "Crustagenik" tanpa catatan).
update kpi_items set realization_note = null, updated_by = null
 where updated_by in (select id from akun_uji);

-- 6. Nilai ketercapaian September dari uji kunci ulang (bukan data impor). Periode tetap terkunci.
delete from period_snapshots where period_month = '2026-09-01' and source = 'app';
update periods set locked_by = null where period_month = '2026-09-01';

-- 7. Notifikasi uji (milik kedua akun dan yang dikirim kedua akun ke lonceng karyawan lain).
delete from notifications
 where employee_id in (select id from akun_uji) or actor_id in (select id from akun_uji);

-- 8. Terakhir: kosongkan semua riwayat, termasuk catatan yang baru dibuat langkah-langkah di atas.
delete from task_history;
delete from audit_log;

commit;

-- Hasil (tampil di bawah setelah Run): semua angka "sisa" seharusnya 0, impor September 15.
select
  (select count(*) from requests)                                                      as sisa_pengajuan,
  (select count(*) from sales_leads)                                                   as sisa_lead,
  (select count(*) from assets)                                                        as sisa_aset,
  (select count(*) from stock_moves)                                                   as sisa_gerakan_stok,
  (select count(*) from audit_log)                                                     as sisa_audit_log,
  (select count(*) from task_history)                                                  as sisa_riwayat_tugas,
  (select count(*) from period_snapshots where period_month = '2026-09-01' and source = 'app')    as sisa_snapshot_sep_uji,
  (select count(*) from period_snapshots where period_month = '2026-09-01' and source = 'import') as snapshot_sep_impor;
