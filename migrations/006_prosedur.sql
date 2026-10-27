-- =====================================================================
-- 006 - Halaman Prosedur
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Tidak mengubah atau menghapus data yang sudah ada.
-- =====================================================================
-- - Semua karyawan aktif bisa membaca prosedur; hanya admin yang bisa menambah/mengubah/menghapus.
-- - Setiap prosedur boleh punya kode SOP (mis. SOP-CA-09). Kode SOP di kartu tugas
--   akan bisa diklik untuk membuka prosedurnya.
-- - dept_code kosong = prosedur umum (berlaku untuk semua departemen).
-- - Setiap perubahan tercatat di audit_log (Admin > Riwayat perubahan).

create table procedures (
  id         uuid primary key default gen_random_uuid(),
  sop_code   text unique,
  title      text not null check (length(trim(title)) > 0),
  dept_code  text references departments,
  body       text not null default '',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references employees
);

alter table procedures enable row level security;
create policy read_procedures on procedures for select using (me() is not null);
create policy admin_procedures on procedures for all
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Isi otomatis siapa dan kapan terakhir mengubah.
create function touch_procedure() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(me(), new.updated_by);
  return new;
end $$;

create trigger trg_procedure_touch
before insert or update on procedures
for each row execute function touch_procedure();

-- Catat setiap tambah/ubah/hapus prosedur ke audit_log.
create function audit_procedure_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
  values ('procedures',
          coalesce(new.id, old.id)::text,
          'procedure_' || lower(tg_op),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          me());
  return null;
end $$;

create trigger trg_procedure_audit
after insert or update or delete on procedures
for each row execute function audit_procedure_change();

-- Enam prosedur umum awal (isi menyusul, diisi admin dari aplikasi).
insert into procedures (title, sort_order) values
  ('Monitoring KPI', 1),
  ('Monitoring target kuartal', 2),
  ('To-do list', 3),
  ('Klaim reimburse, komisi, cuti, lembur', 4),
  ('Permohonan pengadaan', 5),
  ('Stock, supply, & demand teknologi', 6);
