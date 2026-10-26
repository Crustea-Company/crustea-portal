-- =====================================================================
-- 005 - Catat setiap perubahan data karyawan ke audit_log
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Tidak mengubah atau menghapus data yang sudah ada.
-- =====================================================================
-- Yang dicatat: tambah karyawan, ubah data (nama, email, departemen, jabatan,
-- status kerja, peran, wajib ATS), nonaktifkan, dan aktifkan kembali.
-- Disimpan: data lama, data baru, siapa, kapan. Tampil di Admin > Riwayat perubahan.

create function audit_employee_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'employee_create';
  elsif tg_op = 'DELETE' then
    v_action := 'employee_delete';
  else
    -- Tidak ada yang berubah: tidak perlu dicatat.
    if to_jsonb(new) = to_jsonb(old) then return null; end if;
    v_action := case
      when old.is_active and not new.is_active then 'employee_deactivate'
      when not old.is_active and new.is_active then 'employee_activate'
      else 'employee_update'
    end;
  end if;

  insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
  values ('employees',
          coalesce(new.id, old.id)::text,
          v_action,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          me());
  return null;
end $$;

create trigger trg_employee_audit
after insert or update or delete on employees
for each row execute function audit_employee_change();
