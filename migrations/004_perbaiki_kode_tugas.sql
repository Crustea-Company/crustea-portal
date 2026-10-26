-- =====================================================================
-- 004 - Perbaikan kode tugas otomatis
-- Masalah di 003: lpad(..., 2) MEMOTONG angka 3 digit (102 -> "10"),
-- sehingga tugas baru mendapat kode yang sudah ada (mis. CA-10) dan gagal disimpan.
-- Perbaikan: minimal 2 digit, tidak pernah dipotong (CA-102, CA-1000, AQ-09).
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Hanya mengganti satu fungsi; tidak mengubah data.
-- =====================================================================

create or replace function set_task_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next int;
begin
  if new.code is null or trim(new.code) = '' then
    select coalesce(max((regexp_match(code, '^' || new.dept_code || '-(\d+)$'))[1]::int), 0) + 1
      into v_next
      from tasks
     where code like new.dept_code || '-%';
    new.code := new.dept_code || '-' || lpad(v_next::text, greatest(2, length(v_next::text)), '0');
  end if;
  return new;
end $$;
