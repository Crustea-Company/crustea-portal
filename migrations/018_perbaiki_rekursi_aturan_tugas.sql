-- 018: Perbaiki error "infinite recursion detected in policy for relation tasks" saat menyimpan tugas
-- (muncul setelah 017). Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data dan tidak mengubah siapa boleh mengubah apa.
--
-- Penyebab: aturan ubah tugas memeriksa tabel task_people, dan aturan task_people memeriksa tabel tasks,
-- sehingga database menganggapnya berputar. Pemeriksaan silang dipindah ke dua fungsi kecil yang membaca
-- tabelnya langsung (tanpa aturan akses), seperti me() / my_role().

create or replace function is_task_pic(p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from task_people
     where task_id = p_task_id and employee_id = me() and role = 'pic'
  )
$$;

create or replace function task_dept(p_task_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select dept_code from tasks where id = p_task_id
$$;

revoke execute on function is_task_pic(uuid) from public, anon;
revoke execute on function task_dept(uuid) from public, anon;
grant execute on function is_task_pic(uuid) to authenticated;
grant execute on function task_dept(uuid) to authenticated;

-- Isi aturan sama dengan schema.sql: admin/CEO semua, head departemennya, PIC tugasnya.
alter policy update_tasks on tasks using (
  (select my_role()) in ('admin', 'ceo')
  or ((select my_role()) = 'head' and dept_code = (select my_dept()))
  or is_task_pic(id)
);

-- PIC/support: admin/CEO, atau tugas milik departemen sendiri.
alter policy write_task_people on task_people
  using ((select my_role()) in ('admin', 'ceo') or task_dept(task_id) = (select my_dept()))
  with check ((select my_role()) in ('admin', 'ceo') or task_dept(task_id) = (select my_dept()));
