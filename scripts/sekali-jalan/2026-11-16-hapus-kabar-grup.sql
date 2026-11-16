-- Membatalkan Kabar Grup (keputusan Athar 16 Nov 2026).
-- Membuang semua yang dibuat migrasi 032 (kabar_grup) dan 033 (kabar_grup_claude) dari database.
-- PERHATIAN: menghapus permanen semua grup, sorotan, tautan, nama alias, dan notifikasi "Kabar grup".
-- Yang TIDAK disentuh: tugas (termasuk yang dibuat dari saran chat), catatan audit_log, dan modul lain.
-- Aman dijalankan ulang. Jalankan seluruh isi file ini sekaligus di SQL Editor Supabase.

begin;

-- 1. Notifikasi jenis 'wa', lalu daftar jenis notifikasi kembali seperti sebelum migrasi 032.
delete from notifications where kind = 'wa';
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset', 'aqua', 'feedback',
                  'comment', 'program'));

-- 2. Tabel (aturan akses dan indeksnya ikut terhapus).
drop table if exists wa_links;
drop table if exists wa_highlights;
drop table if exists wa_days;
drop table if exists wa_aliases;
drop table if exists wa_groups;

-- 3. Fungsi.
drop function if exists publish_wa_digest(uuid, jsonb, jsonb, timestamptz);
drop function if exists resolve_wa_highlight(uuid, uuid, boolean);
drop function if exists link_wa_highlight(uuid, text, text, boolean);
drop function if exists delete_wa_day(uuid, date);
drop function if exists known_wa_codes(text[]);
drop function if exists wa_link_target_ok(text, text);
drop function if exists visible_wa_group_ids();
drop function if exists can_upload_wa(uuid);
drop function if exists is_wa_uploader();

-- 4. Panduan aplikasi APP-13 (Kabar Grup), bila pernah diisi.
delete from procedures where sop_code = 'APP-13';

commit;

-- 5. Pengecekan: hasilnya harus kosong (0 baris).
select 'tabel' as sisa, table_name::text as nama from information_schema.tables
  where table_schema = 'public' and table_name like 'wa\_%'
union all
select 'fungsi', routine_name::text from information_schema.routines
  where routine_schema = 'public' and (routine_name like '%\_wa\_%' or routine_name like 'wa\_%' or routine_name like '%\_wa')
union all
select 'notifikasi', id::text from notifications where kind = 'wa'
union all
select 'panduan', sop_code from procedures where sop_code = 'APP-13';
