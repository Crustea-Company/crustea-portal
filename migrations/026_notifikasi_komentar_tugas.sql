-- 026: Notifikasi ke PIC tugas saat ada catatan/komentar baru di tugasnya.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- - Jenis notifikasi baru 'comment'. Penerima: semua PIC tugas, kecuali penulis komentar sendiri.
-- - Isi notifikasi: judul tugas + potongan komentar; klik membuka tugasnya di halaman Tugas.

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset', 'aqua', 'feedback', 'comment'));

create function notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body  text := regexp_replace(trim(new.body), '\s+', ' ', 'g');
begin
  select title into v_title from tasks where id = new.task_id;
  insert into notifications (employee_id, kind, task_id, title, actor_id)
  select distinct tp.employee_id, 'comment', new.task_id,
         v_title || ' · "' || case when length(v_body) > 120 then left(v_body, 117) || '...' else v_body end || '"',
         new.author_id
    from task_people tp
    join employees e on e.id = tp.employee_id and e.is_active
   where tp.task_id = new.task_id and tp.role = 'pic' and tp.employee_id is distinct from new.author_id;
  return null;
end $$;

create trigger trg_task_note_notify
after insert on task_notes
for each row execute function notify_task_comment();
