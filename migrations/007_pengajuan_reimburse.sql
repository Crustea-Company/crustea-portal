-- =====================================================================
-- 007 - Mesin pengajuan bersama + Klaim Reimburse
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Tidak mengubah atau menghapus data yang sudah ada (kecuali satu kalimat
-- di prosedur "Klaim reimburse, komisi, cuti, lembur", lihat bagian I).
-- =====================================================================
-- - Satu tabel `requests` untuk semua jenis pengajuan: reimburse sekarang; permintaan
--   pembayaran, pengadaan, perjalanan dinas, dan komisi menyusul memakai tabel yang sama.
-- - Status: draft -> submitted (Belum di-review) -> in_review (Sedang di-review)
--   -> approved (Diterima) -> paid (Ditransfer). Cabang: needs_revision (Perlu perbaikan),
--   rejected (Ditolak).
-- - Status hanya bisa diubah lewat fungsi change_request_status (memeriksa urutan + peran,
--   mencatat riwayat, membuat notifikasi).
-- - Peninjau = karyawan aktif departemen FA (termasuk head FA) dan admin. CEO bisa melihat semua.
-- - SLA = 2 hari kerja per status (Senin-Jumat, tanpa tanggal di tabel `holidays`).

-- ---------- A. Hari libur nasional (diisi admin) ----------
create table holidays (
  date date primary key,
  name text not null check (length(trim(name)) > 0)
);

alter table holidays enable row level security;
create policy read_holidays on holidays for select using (me() is not null);
create policy admin_holidays on holidays for all
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Tambah n hari kerja (lewati Sabtu, Minggu, dan libur), jam tetap sama. Zona waktu WIB.
-- Contoh: Jumat 15.00 + 2 hari kerja = Selasa 15.00.
create function workday_add(p_from timestamptz, p_days int) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := p_from at time zone 'Asia/Jakarta';
  v_date  date := v_local::date;
  v_left  int := p_days;
begin
  while v_left > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6
       and not exists (select 1 from holidays h where h.date = v_date) then
      v_left := v_left - 1;
    end if;
  end loop;
  return (v_date + v_local::time) at time zone 'Asia/Jakarta';
end $$;

-- ---------- B. Peran peninjau ----------
-- Peninjau = karyawan departemen FA (termasuk head FA) dan admin.
create function is_request_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_dept() = 'FA' or my_role() = 'admin', false)
$$;

create function request_status_label(s text) returns text
language sql immutable as $$
  select case s
    when 'draft'          then 'Draf'
    when 'submitted'      then 'Belum di-review'
    when 'in_review'      then 'Sedang di-review'
    when 'approved'       then 'Diterima'
    when 'paid'           then 'Ditransfer'
    when 'needs_revision' then 'Perlu perbaikan'
    when 'rejected'       then 'Ditolak'
    else s end
$$;

-- ---------- C. Pengajuan ----------
create table requests (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('reimburse', 'payment', 'procurement', 'travel', 'commission')),
  number       text unique,                        -- otomatis, mis. RB-2026-0001
  requester_id uuid not null references employees default me(),
  dept_code    text references departments,        -- otomatis dari departemen pemohon
  title        text not null check (length(trim(title)) > 0),
  amount       bigint not null default 0 check (amount >= 0),   -- rupiah bulat
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'in_review', 'approved', 'paid', 'needs_revision', 'rejected')),
  status_since timestamptz not null default now(),
  data         jsonb not null default '{}',        -- isi form khusus per jenis
  submitted_at timestamptz,                        -- pertama kali dikirim
  paid_on      date,                               -- tanggal transfer
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on requests (requester_id);
create index on requests (status);

-- Riwayat (terlihat oleh pemohon dan peninjau). action: submit, status, note, edit.
create table request_events (
  id          bigserial primary key,
  request_id  uuid not null references requests on delete cascade,
  actor       uuid references employees,
  action      text not null check (action in ('submit', 'status', 'note', 'edit')),
  from_status text,
  to_status   text,
  note        text,
  at          timestamptz not null default now()
);
create index on request_events (request_id, at);

-- Lampiran: file di Storage (bucket request-files) atau link.
-- purpose: proof = bukti dari pemohon; transfer = bukti transfer dari F&A.
create table request_files (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests on delete cascade,
  kind        text not null check (kind in ('file', 'link')),
  purpose     text not null default 'proof' check (purpose in ('proof', 'transfer')),
  path        text,                                -- file: <id karyawan>/<acak>/<nama>
  url         text,                                -- link
  name        text not null,
  size_bytes  int,
  uploaded_by uuid not null references employees default me(),
  created_at  timestamptz not null default now(),
  check ((kind = 'file' and path is not null) or (kind = 'link' and url ~* '^https?://'))
);
create index on request_files (request_id);

-- Tanggal batas SLA (dipakai aplikasi sebagai kolom "sla_due"). Kosong untuk status
-- yang tidak sedang menunggu peninjau.
create function sla_due(r requests) returns timestamptz
language sql stable as $$
  select case when r.status in ('submitted', 'in_review', 'approved')
              then workday_add(r.status_since, 2) end
$$;

-- ---------- D. Otomatis: nomor, departemen, penjaga kolom, riwayat ubah ----------
create function prepare_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := case new.kind
    when 'reimburse' then 'RB' when 'payment' then 'PP' when 'procurement' then 'PR'
    when 'travel' then 'PD' when 'commission' then 'KK' end;
  v_year text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtext('request-number:' || v_prefix || v_year));
  select coalesce(max(split_part(number, '-', 3)::int), 0) + 1 into v_next
    from requests where number like v_prefix || '-' || v_year || '-%';
  new.number := v_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
  select dept_code into new.dept_code from employees where id = new.requester_id;
  new.status_since := now();
  new.submitted_at := null;
  new.paid_on := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger trg_request_prepare
before insert on requests
for each row execute function prepare_request();

-- Pemohon hanya boleh mengubah judul, nominal, dan isi form. Status dan kolom lain
-- hanya berubah lewat change_request_status.
create function guard_request_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.kind, new.number, new.requester_id, new.dept_code, new.status, new.status_since,
          new.submitted_at, new.paid_on, new.created_at)
         is distinct from
         (old.kind, old.number, old.requester_id, old.dept_code, old.status, old.status_since,
          old.submitted_at, old.paid_on, old.created_at) then
    raise exception 'Kolom ini hanya bisa diubah lewat alur pengajuan.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_request_guard
before update on requests
for each row execute function guard_request_update();

-- Catat "diubah pemohon" di riwayat (perubahan status dicatat oleh change_request_status).
create function log_request_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status and new.status_since = old.status_since
     and (new.title, new.amount, new.data) is distinct from (old.title, old.amount, old.data) then
    insert into request_events (request_id, actor, action) values (new.id, me(), 'edit');
  end if;
  return null;
end $$;

create trigger trg_request_edit_log
after update on requests
for each row execute function log_request_edit();

-- Maksimal 10 lampiran per jenis lampiran per pengajuan.
create function check_request_file_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from request_files
       where request_id = new.request_id and purpose = new.purpose) >= 10 then
    raise exception 'Maksimal 10 lampiran per pengajuan.';
  end if;
  return new;
end $$;

create trigger trg_request_file_limit
before insert on request_files
for each row execute function check_request_file_limit();

-- ---------- E. Keamanan (RLS) ----------
alter table requests       enable row level security;
alter table request_events enable row level security;
alter table request_files  enable row level security;

-- Pemohon melihat miliknya; peninjau dan CEO melihat semua.
create policy read_requests on requests for select using (
  requester_id = me() or is_request_reviewer() or my_role() = 'ceo'
);
-- Pengajuan baru selalu dimulai sebagai draf milik sendiri, lalu dikirim lewat fungsi.
create policy insert_own_requests on requests for insert
  with check (requester_id = me() and status = 'draft');
-- Pemohon boleh mengubah isi saat draf / perlu perbaikan.
create policy update_own_requests on requests for update
  using (requester_id = me() and status in ('draft', 'needs_revision'))
  with check (requester_id = me() and status in ('draft', 'needs_revision'));
-- Draf yang belum pernah dikirim boleh dihapus pemiliknya.
create policy delete_own_drafts on requests for delete
  using (requester_id = me() and status = 'draft');

-- Riwayat terlihat oleh siapa pun yang boleh melihat pengajuannya. Ditulis hanya oleh fungsi.
create policy read_request_events on request_events for select using (
  exists (select 1 from requests r where r.id = request_id)
);

create policy read_request_files on request_files for select using (
  exists (select 1 from requests r where r.id = request_id)
);
-- File harus berada di folder Storage milik pengunggah sendiri.
create policy insert_request_files on request_files for insert with check (
  uploaded_by = me()
  and (kind = 'link' or path like me()::text || '/%')
  and (
    (purpose = 'proof' and exists (
      select 1 from requests r
       where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
    or (purpose = 'transfer' and is_request_reviewer() and exists (
      select 1 from requests r where r.id = request_id and r.status in ('approved', 'paid')))
  )
);
create policy delete_request_files on request_files for delete using (
  (purpose = 'proof' and exists (
    select 1 from requests r
     where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
  or (purpose = 'transfer' and uploaded_by = me() and is_request_reviewer())
);

-- ---------- F. Storage: bucket privat request-files (maks 5 MB per file) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-files', 'request-files', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- Unggah & hapus hanya di folder sendiri (<id karyawan>/...).
create policy request_files_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'request-files' and (storage.foldername(name))[1] = me()::text
);
create policy request_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'request-files' and (storage.foldername(name))[1] = me()::text
);
-- Membuka file: pemilik folder, atau siapa pun yang boleh melihat pengajuannya.
create policy request_files_read on storage.objects for select to authenticated using (
  bucket_id = 'request-files'
  and ((storage.foldername(name))[1] = me()::text
       or exists (select 1 from public.request_files f where f.path = storage.objects.name))
);

-- ---------- G. Notifikasi jenis baru: request dan sla ----------
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla'));
alter table notifications add column request_id uuid references requests on delete cascade;

-- ---------- H. Fungsi alur pengajuan ----------
-- Urutan yang diizinkan:
--   pemohon : draft / needs_revision -> submitted
--   peninjau: submitted -> in_review
--             submitted / in_review -> approved, needs_revision (wajib catatan), rejected (wajib alasan)
--             approved -> paid (wajib tanggal transfer)
-- Peninjau tidak boleh meninjau pengajuannya sendiri (kecuali admin).
create function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_req      requests;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_reviewer boolean := is_request_reviewer();
  v_ok       boolean := false;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_req from requests where id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;

  if p_to = 'submitted' then
    v_ok := v_req.requester_id = v_me and v_req.status in ('draft', 'needs_revision');
  elsif p_to = 'in_review' then
    v_ok := v_reviewer and v_req.status = 'submitted';
  elsif p_to in ('approved', 'needs_revision', 'rejected') then
    v_ok := v_reviewer and v_req.status in ('submitted', 'in_review');
  elsif p_to = 'paid' then
    v_ok := v_reviewer and v_req.status = 'approved';
  end if;
  if not v_ok then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".',
      request_status_label(v_req.status), request_status_label(p_to);
  end if;
  if p_to <> 'submitted' and v_req.requester_id = v_me and my_role() <> 'admin' then
    raise exception 'Anda tidak boleh meninjau pengajuan Anda sendiri.';
  end if;
  if p_to in ('needs_revision', 'rejected') and v_note is null then
    raise exception 'Catatan/alasan wajib diisi.';
  end if;
  if p_to = 'paid' and p_paid_on is null then
    raise exception 'Tanggal transfer wajib diisi.';
  end if;

  update requests
     set status = p_to,
         status_since = now(),
         submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
         paid_on = case when p_to = 'paid' then p_paid_on else paid_on end
   where id = p_id;

  insert into request_events (request_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, case when p_to = 'submitted' then 'submit' else 'status' end, v_req.status, p_to, v_note);

  if p_to = 'submitted' then
    -- Pengajuan baru / dikirim ulang -> semua karyawan F&A.
    insert into notifications (employee_id, kind, request_id, title, actor_id)
    select e.id, 'request', p_id,
           v_req.number || ' · ' ||
           case when v_req.status = 'needs_revision' then 'Dikirim ulang' else 'Pengajuan baru' end ||
           ': ' || v_req.title, v_me
      from employees e
     where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    -- Nilai >= Rp5.000.000 -> CEO (sekali per pengajuan).
    if v_req.amount >= 5000000 then
      insert into notifications (employee_id, kind, request_id, title, actor_id, dedupe_key)
      select e.id, 'request', p_id, v_req.number || ' · Pengajuan ≥ Rp5 juta: ' || v_req.title,
             v_me, 'ceo-request:' || p_id
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me
      on conflict (employee_id, dedupe_key) do nothing;
    end if;
  elsif v_req.requester_id <> v_me then
    -- Status berubah -> pemohon.
    insert into notifications (employee_id, kind, request_id, title, actor_id)
    values (v_req.requester_id, 'request', p_id,
            v_req.number || ' · ' || request_status_label(p_to) || ': ' || v_req.title, v_me);
  end if;
end $$;

-- Catatan tanpa mengubah status (pemohon atau peninjau). Pihak lain mendapat notifikasi.
create function add_request_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := me();
  v_req  requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  if v_note is null then raise exception 'Catatan belum diisi.'; end if;
  select * into v_req from requests where id = p_id;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if not (v_req.requester_id = v_me or is_request_reviewer()) then
    raise exception 'Anda tidak berhak memberi catatan pada pengajuan ini.';
  end if;

  insert into request_events (request_id, actor, action, note) values (p_id, v_me, 'note', v_note);

  if v_req.requester_id = v_me then
    if v_req.status <> 'draft' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
  else
    insert into notifications (employee_id, kind, request_id, title, actor_id)
    values (v_req.requester_id, 'request', p_id, v_req.number || ' · Catatan baru dari F&A: ' || v_req.title, v_me);
  end if;
end $$;

-- sync_my_notifications (dari migrasi 003) + notifikasi "Lewat SLA" untuk peninjau.
create or replace function sync_my_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := me();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_total int := 0;
  v_n     int;
begin
  if v_me is null then return 0; end if;

  insert into notifications (employee_id, kind, task_id, title, dedupe_key)
  select v_me, 'reminder', r.task_id, t.title,
         'reminder:' || r.id || ':' || extract(epoch from r.remind_at)::bigint
    from task_reminders r join tasks t on t.id = r.task_id
   where r.employee_id = v_me and r.remind_at <= now()
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into notifications (employee_id, kind, task_id, title, dedupe_key)
  select v_me, 'deadline', t.id, t.title,
         'deadline:' || t.id || ':' || t.deadline || ':' || (t.deadline - v_today)
    from tasks t
    join task_people tp on tp.task_id = t.id and tp.employee_id = v_me and tp.role = 'pic'
   where t.status <> 'done' and t.deadline - v_today between 1 and 3
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Pengajuan yang lewat SLA (2 hari kerja di status yang sama), sekali per status.
  if is_request_reviewer() then
    insert into notifications (employee_id, kind, request_id, title, dedupe_key)
    select v_me, 'sla', r.id,
           r.number || ' · ' || request_status_label(r.status) || ': ' || r.title,
           'sla:' || r.id || ':' || r.status || ':' || extract(epoch from r.status_since)::bigint
      from requests r
     where r.status in ('submitted', 'in_review', 'approved')
       and r.requester_id <> v_me
       and workday_add(r.status_since, 2) < now()
    on conflict (employee_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  return v_total;
end $$;

-- ---------- I. Prosedur: ganti teks "sedang dikembangkan" di bagian Reimburse ----------
-- Hanya mengganti kalimat itu kalau isinya masih sama seperti isi awal.
update procedures
   set body = replace(body,
     E'## Reimburse\n\n> Formulir di aplikasi **sedang dikembangkan**. Sementara itu, ikuti langkah di bawah.',
     E'## Reimburse\n\n> Ajukan lewat **[Form reimburse](/pengajuan/reimburse/baru)**, lalu pantau statusnya di **[Pengajuan saya](/pengajuan)**.')
 where title = 'Klaim reimburse, komisi, cuti, lembur';

-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
