-- 022: Tugas - kolom tanggal dibuat (untuk urutan "Terbaru dibuat" di halaman Tugas).
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Jalankan SEBELUM memakai versi aplikasi terbaru (halaman Tugas membaca kolom ini).
--
-- Tugas yang sudah ada: tanggal dibuat diambil dari catatan "dibuat" di Riwayat tugas (task_history);
-- tugas hasil impor awal yang tidak punya catatan itu memakai waktu terakhir diubah (updated_at).
-- Selama pengisian, pencatat riwayat dan pengisi "terakhir diubah" dimatikan sebentar supaya
-- Riwayat tugas tidak kebanjiran baris dan updated_at tidak berubah.

alter table tasks add column created_at timestamptz;

alter table tasks disable trigger trg_task_history;
alter table tasks disable trigger trg_task_touch;

update tasks t
   set created_at = coalesce(
         (select min(h.at) from task_history h where h.task_id = t.id and h.action = 'create'),
         t.updated_at);

alter table tasks enable trigger trg_task_history;
alter table tasks enable trigger trg_task_touch;

alter table tasks alter column created_at set default now();
alter table tasks alter column created_at set not null;
