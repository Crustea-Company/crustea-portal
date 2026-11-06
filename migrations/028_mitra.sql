-- 028: Daftar Mitra (menu Penjualan & Aset > Mitra): mitra pembudidaya, champion farmers, vendor teknologi, dll.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak mengubah data lain.
--
-- - Semua karyawan bisa melihat. Tambah/ubah: dept BDS, TO, AQ, admin, CEO. Hapus: head BDS (CMO), admin, CEO.
-- - Champion farmers: kewajiban (beli langsung / rekap petambak tertarik / buat video), teknologi yang sudah diterima,
--   status (Aktif, Belum siap, Salah sasaran, Tidak aktif) -> dasar KPI "25 champion farmers terhubung & aktif".

create table partners (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('farmer', 'champion', 'vendor', 'other')),
  name        text not null check (length(trim(name)) > 0),
  contact     text,
  location    text,
  commodity   text,                       -- komoditas / produk
  pic_id      uuid references employees,  -- PIC Crustea
  status      text not null default 'active' check (status in ('active', 'not_ready', 'wrong_target', 'inactive')),
  obligation  text,                       -- kesepakatan / kewajiban (champion: beli langsung, rekap leads, video)
  tech_note   text,                       -- teknologi Crustea yang sudah diterima + tanggal
  notes       text,
  created_by  uuid references employees default me(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on partners (kind, status);

alter table partners enable row level security;
create policy read_partners on partners for select using ((select me()) is not null);
create policy insert_partners on partners for insert
  with check ((select my_dept()) in ('BDS', 'TO', 'AQ') or (select my_role()) in ('admin', 'ceo'));
create policy update_partners on partners for update
  using ((select my_dept()) in ('BDS', 'TO', 'AQ') or (select my_role()) in ('admin', 'ceo'))
  with check ((select my_dept()) in ('BDS', 'TO', 'AQ') or (select my_role()) in ('admin', 'ceo'));
create policy delete_partners on partners for delete using ((select is_sales_manager()));
