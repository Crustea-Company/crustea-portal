-- 030: Jobdesc per karyawan (halaman Tanggung jawab).
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak mengubah data lain.
--
-- - Setiap karyawan punya daftar jobdesc: satu baris = satu lingkup tanggung jawab + kata kunci (dipisah koma).
-- - Semua karyawan bisa melihat jobdesc (transparansi: siapa bertanggung jawab atas apa). Ubah: admin dan CEO.
-- - Pengecekan "di luar jobdesc" dihitung di aplikasi (tugas/program/proyek/KPI yang tidak memuat kata kunci jobdesc)
--   dan hanya ditampilkan ke admin dan CEO.

create table employee_jobdesc (
  id          bigserial primary key,
  employee_id uuid not null references employees on delete cascade,
  item        text not null check (length(trim(item)) > 0),
  keywords    text,                -- mis. "paten, HKI, DJKI, merek"
  sort        int not null default 0,
  updated_by  uuid references employees default me(),
  updated_at  timestamptz not null default now()
);
create index on employee_jobdesc (employee_id, sort);

alter table employee_jobdesc enable row level security;
create policy read_jobdesc on employee_jobdesc for select using ((select me()) is not null);
create policy write_jobdesc on employee_jobdesc for all
  using ((select my_role()) in ('admin', 'ceo'))
  with check ((select my_role()) in ('admin', 'ceo'));
