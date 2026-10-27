-- 009: Penugasan perjalanan dinas (kind = 'travel', nomor PD-..., surat tugas ST-...)
-- Lihat docs/fase-2-3/04-perjalanan-dinas.md.
--
-- Alur khusus dinas (jenis pengajuan lain tidak berubah):
--   pemohon      : draft / needs_revision -> submitted ("Diajukan")
--   penugas      : submitted -> assigner_approved ("Disetujui penugas")
--   HR/CA        : assigner_approved -> st_issued ("Surat tugas terbit", nomor ST otomatis)
--   F&A          : st_issued -> approved ("Diverifikasi Finance")
--   F&A          : approved -> paid ("Uang muka dicairkan", hanya bila uang muka diminta)
--   F&A          : approved / paid -> completed ("Selesai", setelah FPTD + laporan misi dilampirkan)
--   Perlu perbaikan / Ditolak: oleh pihak yang sedang memegang tahap itu (wajib catatan).

-- ---------- A. Tarif & parameter dinas (bisa diubah admin) ----------
create table travel_rates (
  grade           text primary key,
  label           text not null,
  sort            int not null,
  daily           bigint not null check (daily >= 0),            -- uang harian / hari
  hotel           bigint not null check (hotel >= 0),            -- plafon hotel / malam
  local_transport bigint not null check (local_transport >= 0),  -- plafon transport lokal / hari
  representation  bigint not null default 0 check (representation >= 0)  -- plafon / kegiatan; 0 = tidak ada
);

insert into travel_rates (grade, label, sort, daily, hotel, local_transport, representation) values
  ('director',   'Direktur',           1, 450000, 900000, 150000, 700000),
  ('head',       'Head/Manager',       2, 300000, 700000, 120000, 500000),
  ('supervisor', 'Supervisor/Leader',  3, 300000, 700000, 120000, 0),
  ('staff_ft',   'Staff Full Time',    4, 200000, 500000, 120000, 0),
  ('staff_pt',   'Staff Part-time',    5, 150000, 300000, 100000, 0),
  ('intern',     'Karyawan Magang',    6, 100000, 200000, 100000, 0);

create table travel_params (
  key   text primary key,
  label text not null,
  value numeric not null check (value >= 0)
);

insert into travel_params (key, label, value) values
  ('min_notice_days', 'Tenggat penugasan minimal (hari kerja)', 3),
  ('report_days',     'Batas FPTD & laporan misi setelah kembali (hari kerja)', 3),
  ('local_km',        'Zona lokal sampai (km)', 30),
  ('province_km',     'Dalam provinsi sampai (km)', 150),
  ('private_km_rate', 'Kendaraan pribadi (Rp/km)', 3000);

alter table travel_rates  enable row level security;
alter table travel_params enable row level security;
create policy read_travel_rates on travel_rates for select using (me() is not null);
create policy admin_travel_rates on travel_rates for update
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy read_travel_params on travel_params for select using (me() is not null);
create policy admin_travel_params on travel_params for update
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ---------- B. Golongan jabatan karyawan ----------
alter table employees add column grade text references travel_rates;

create function default_grade(p_role app_role, p_status emp_status) returns text
language sql immutable as $$
  select case
    when p_role = 'ceo' then 'director'
    when p_role in ('head', 'admin') then 'head'
    when p_status = 'INTERN' then 'intern'
    when p_status = 'PKWT' then 'staff_pt'
    else 'staff_ft' end
$$;

-- Isi awal tanpa membanjiri riwayat karyawan.
alter table employees disable trigger trg_employee_audit;
update employees set grade = default_grade(app_role, emp_status) where grade is null;
alter table employees enable trigger trg_employee_audit;

-- Karyawan baru tanpa golongan mendapat golongan bawaan.
create function set_default_grade() returns trigger
language plpgsql as $$
begin
  new.grade := coalesce(new.grade, default_grade(new.app_role, new.emp_status));
  return new;
end $$;

create trigger trg_employee_default_grade
before insert on employees
for each row execute function set_default_grade();

-- ---------- C. Kolom & status baru di pengajuan ----------
alter table requests add column assigner_id uuid references employees;  -- penugas (dinas)
alter table requests add column st_number text unique;                  -- nomor surat tugas

alter table requests drop constraint requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('draft', 'submitted', 'in_review', 'ceo_review', 'assigner_approved', 'st_issued',
                    'approved', 'paid', 'completed', 'needs_revision', 'rejected'));

alter table request_files drop constraint request_files_purpose_check;
alter table request_files add constraint request_files_purpose_check
  check (purpose in ('proof', 'transfer', 'report'));

create or replace function request_status_label(s text) returns text
language sql immutable as $$
  select case s
    when 'draft'             then 'Draf'
    when 'submitted'         then 'Belum di-review'
    when 'in_review'         then 'Sedang di-review'
    when 'ceo_review'        then 'Menunggu CEO'
    when 'assigner_approved' then 'Disetujui penugas'
    when 'st_issued'         then 'Surat tugas terbit'
    when 'approved'          then 'Diterima'
    when 'paid'              then 'Ditransfer'
    when 'completed'         then 'Selesai'
    when 'needs_revision'    then 'Perlu perbaikan'
    when 'rejected'          then 'Ditolak'
    else s end
$$;

-- Label per jenis (dinas memakai istilahnya sendiri).
create function request_status_label(s text, k text) returns text
language sql immutable as $$
  select case
    when k = 'travel' and s = 'submitted' then 'Diajukan'
    when k = 'travel' and s = 'approved'  then 'Diverifikasi Finance'
    when k = 'travel' and s = 'paid'      then 'Uang muka dicairkan'
    else request_status_label(s) end
$$;

-- HR = departemen Corporate Affairs (dan admin): menerbitkan nomor surat tugas.
create function is_travel_hr() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_dept() = 'CA' or my_role() = 'admin', false)
$$;

-- SLA 2 hari kerja di setiap tahap yang menunggu tindakan. Dinas yang sudah diverifikasi
-- tanpa uang muka (atau sudah dicairkan) menunggu FPTD pemohon, bukan peninjau.
create or replace function sla_due(r requests) returns timestamptz
language sql stable as $$
  select case
    when r.status in ('submitted', 'in_review', 'ceo_review', 'assigner_approved', 'st_issued')
      or (r.status = 'approved' and (r.kind <> 'travel' or coalesce((r.data->>'advance')::boolean, false)))
    then workday_add(r.status_since, 2) end
$$;

-- Nomor surat tugas hanya diisi fungsi alur.
create or replace function guard_request_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.kind, new.number, new.requester_id, new.dept_code, new.status, new.status_since,
          new.submitted_at, new.paid_on, new.created_at, new.st_number)
         is distinct from
         (old.kind, old.number, old.requester_id, old.dept_code, old.status, old.status_since,
          old.submitted_at, old.paid_on, old.created_at, old.st_number) then
    raise exception 'Kolom ini hanya bisa diubah lewat alur pengajuan.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- D. Keamanan (RLS) ----------
-- Penugas dan HR/CA juga melihat pengajuan dinas yang relevan.
drop policy read_requests on requests;
create policy read_requests on requests for select using (
  requester_id = me() or is_request_reviewer() or my_role() = 'ceo'
  or assigner_id = me() or (kind = 'travel' and is_travel_hr())
);

-- Lampiran FPTD & laporan misi (purpose 'report') ditambah pemohon setelah diverifikasi Finance.
drop policy insert_request_files on request_files;
create policy insert_request_files on request_files for insert with check (
  uploaded_by = me()
  and (kind = 'link' or path like me()::text || '/%')
  and (
    (purpose = 'proof' and exists (
      select 1 from requests r
       where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
    or (purpose = 'transfer' and is_request_reviewer() and exists (
      select 1 from requests r where r.id = request_id and r.status in ('approved', 'paid')))
    or (purpose = 'report' and exists (
      select 1 from requests r
       where r.id = request_id and r.requester_id = me() and r.kind = 'travel' and r.status in ('approved', 'paid')))
  )
);
drop policy delete_request_files on request_files;
create policy delete_request_files on request_files for delete using (
  (purpose = 'proof' and exists (
    select 1 from requests r
     where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
  or (purpose = 'transfer' and uploaded_by = me() and is_request_reviewer())
  or (purpose = 'report' and uploaded_by = me() and exists (
    select 1 from requests r where r.id = request_id and r.status in ('approved', 'paid')))
);

-- ---------- E. Fungsi alur pengajuan (menggantikan versi 008) ----------
create or replace function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_req      requests;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_reviewer boolean := is_request_reviewer();
  v_ceo      boolean := my_role() in ('ceo', 'admin');
  v_hr       boolean := is_travel_hr();
  v_assigner boolean;
  v_advance  boolean;
  v_ok       boolean := false;
  v_year     text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_st       text;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_req from requests where id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  v_assigner := v_req.assigner_id = v_me or my_role() = 'admin';
  v_advance := coalesce((v_req.data->>'advance')::boolean, false);

  if p_to = 'submitted' then
    v_ok := v_req.requester_id = v_me and v_req.status in ('draft', 'needs_revision');
  elsif v_req.kind = 'travel' then
    if p_to = 'assigner_approved' then
      v_ok := v_assigner and v_req.status = 'submitted';
    elsif p_to = 'st_issued' then
      v_ok := v_hr and v_req.status = 'assigner_approved';
    elsif p_to = 'approved' then
      v_ok := v_reviewer and v_req.status = 'st_issued';
    elsif p_to in ('needs_revision', 'rejected') then
      v_ok := (v_assigner and v_req.status = 'submitted')
           or (v_hr and v_req.status = 'assigner_approved')
           or (v_reviewer and v_req.status = 'st_issued');
    elsif p_to = 'paid' then
      v_ok := v_reviewer and v_req.status = 'approved' and v_advance;
    elsif p_to = 'completed' then
      v_ok := v_reviewer and (v_req.status = 'paid' or (v_req.status = 'approved' and not v_advance));
    end if;
  elsif p_to = 'in_review' then
    v_ok := v_reviewer and v_req.status = 'submitted';
  elsif p_to in ('approved', 'needs_revision', 'rejected') then
    v_ok := (v_reviewer and v_req.status in ('submitted', 'in_review'))
         or (v_ceo and v_req.status = 'ceo_review');
  elsif p_to = 'paid' then
    v_ok := v_reviewer and v_req.status = 'approved';
  end if;
  if not v_ok then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".',
      request_status_label(v_req.status, v_req.kind), request_status_label(p_to, v_req.kind);
  end if;
  -- Peninjau tidak boleh meninjau pengajuannya sendiri (kecuali admin; CEO boleh menyetujui
  -- penugasan dinasnya sendiri sebagai penugas).
  if p_to <> 'submitted' and v_req.requester_id = v_me and my_role() <> 'admin'
     and not (p_to = 'assigner_approved' and my_role() = 'ceo') then
    raise exception 'Anda tidak boleh meninjau pengajuan Anda sendiri.';
  end if;
  if p_to in ('needs_revision', 'rejected') and v_note is null then
    raise exception 'Catatan/alasan wajib diisi.';
  end if;
  if p_to = 'paid' and p_paid_on is null then
    raise exception 'Tanggal % wajib diisi.', case when v_req.kind = 'travel' then 'pencairan' else 'transfer' end;
  end if;
  if p_to = 'submitted' and v_req.kind = 'travel' then
    if v_req.assigner_id is null then raise exception 'Pilih siapa yang menugaskan.'; end if;
    if v_req.assigner_id = v_req.requester_id and my_role() <> 'ceo' then
      raise exception 'Penugas tidak boleh diri sendiri.';
    end if;
  end if;
  if p_to = 'completed' and not exists (
    select 1 from request_files f where f.request_id = p_id and f.purpose = 'report') then
    raise exception 'FPTD dan laporan misi belum dilampirkan pemohon.';
  end if;

  -- Permintaan pembayaran >= Rp5 juta yang diterima F&A -> menunggu persetujuan CEO.
  if p_to = 'approved' and v_req.status <> 'ceo_review'
     and v_req.kind = 'payment' and v_req.amount >= 5000000 then
    p_to := 'ceo_review';
  end if;

  -- Nomor surat tugas ST-2026-001, berurutan per tahun.
  if p_to = 'st_issued' then
    perform pg_advisory_xact_lock(hashtext('st-number:' || v_year));
    select 'ST-' || v_year || '-' || lpad((coalesce(max(split_part(st_number, '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_st
      from requests where st_number like 'ST-' || v_year || '-%';
  end if;

  update requests
     set status = p_to,
         status_since = now(),
         submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
         paid_on = case when p_to = 'paid' then p_paid_on else paid_on end,
         st_number = coalesce(v_st, st_number)
   where id = p_id;

  insert into request_events (request_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, case when p_to = 'submitted' then 'submit' else 'status' end, v_req.status, p_to,
          case when v_st is not null then concat_ws(E'\n', 'No. surat tugas: ' || v_st, v_note) else v_note end);

  if p_to = 'submitted' then
    if v_req.kind = 'travel' then
      -- Penugasan dinas -> penugas.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select v_req.assigner_id, 'request', p_id,
             v_req.number || ' · Perlu persetujuan penugas: ' || v_req.title, v_me
       where v_req.assigner_id <> v_me;
    else
      -- Pengajuan baru / dikirim ulang -> semua karyawan F&A.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · ' ||
             case when v_req.status = 'needs_revision' then 'Dikirim ulang' else 'Pengajuan baru' end ||
             ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
    -- Nilai >= Rp5.000.000 -> CEO (sekali per pengajuan).
    if v_req.amount >= 5000000 then
      insert into notifications (employee_id, kind, request_id, title, actor_id, dedupe_key)
      select e.id, 'request', p_id, v_req.number || ' · Pengajuan ≥ Rp5 juta: ' || v_req.title,
             v_me, 'ceo-request:' || p_id
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me
      on conflict (employee_id, dedupe_key) do nothing;
    end if;
  else
    if v_req.requester_id <> v_me then
      -- Status berubah -> pemohon.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      values (v_req.requester_id, 'request', p_id,
              v_req.number || ' · ' || request_status_label(p_to, v_req.kind) || ': ' || v_req.title, v_me);
    end if;
    if p_to = 'ceo_review' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan CEO: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me;
    elsif v_req.status = 'ceo_review' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · Keputusan CEO: ' || request_status_label(p_to) || ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    elsif p_to = 'assigner_approved' then
      -- Disetujui penugas -> HR/CA menerbitkan surat tugas.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu nomor surat tugas: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'CA' and e.id <> v_me;
    elsif p_to = 'st_issued' then
      -- Surat tugas terbit -> F&A memverifikasi.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu verifikasi Finance: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
  end if;
end $$;

-- Catatan tanpa mengubah status. Dinas: penugas dan HR/CA juga boleh memberi catatan.
create or replace function add_request_note(p_id uuid, p_note text) returns void
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
  if not (v_req.requester_id = v_me or is_request_reviewer()
          or (v_req.kind = 'travel' and (v_req.assigner_id = v_me or is_travel_hr()))) then
    raise exception 'Anda tidak berhak memberi catatan pada pengajuan ini.';
  end if;

  insert into request_events (request_id, actor, action, note) values (p_id, v_me, 'note', v_note);

  if v_req.requester_id = v_me then
    if v_req.status = 'draft' then
      null;
    elsif v_req.kind = 'travel' and v_req.status = 'submitted' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select v_req.assigner_id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
       where v_req.assigner_id <> v_me;
    elsif v_req.kind = 'travel' and v_req.status = 'assigner_approved' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'CA' and e.id <> v_me;
    else
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
  else
    insert into notifications (employee_id, kind, request_id, title, actor_id)
    values (v_req.requester_id, 'request', p_id, v_req.number || ' · Catatan baru: ' || v_req.title, v_me);
  end if;
end $$;

-- ---------- F. Notifikasi "Lewat SLA" & batas FPTD ----------
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

  -- Pengajuan yang lewat SLA (2 hari kerja di status yang sama), sekali per status,
  -- untuk pihak yang sedang memegang tahap itu.
  insert into notifications (employee_id, kind, request_id, title, dedupe_key)
  select v_me, 'sla', r.id,
         r.number || ' · ' || request_status_label(r.status, r.kind) || ': ' || r.title,
         'sla:' || r.id || ':' || r.status || ':' || extract(epoch from r.status_since)::bigint
    from requests r
   where r.requester_id <> v_me
     and sla_due(r) < now()
     and (
       (is_request_reviewer() and ((r.kind <> 'travel' and r.status in ('submitted', 'in_review', 'approved'))
                                   or (r.kind = 'travel' and r.status in ('st_issued', 'approved'))))
       or (my_role() = 'ceo' and r.status = 'ceo_review')
       or (r.kind = 'travel' and r.status = 'submitted' and r.assigner_id = v_me)
       or (r.kind = 'travel' and r.status = 'assigner_approved' and is_travel_hr())
     )
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Pemohon dinas: batas FPTD & laporan misi sudah lewat.
  insert into notifications (employee_id, kind, request_id, title, dedupe_key)
  select v_me, 'sla', r.id, r.number || ' · Batas FPTD & laporan misi lewat: ' || r.title, 'fptd:' || r.id
    from requests r
   where r.requester_id = v_me and r.kind = 'travel' and r.status in ('approved', 'paid')
     and (r.data->>'report_due')::date < v_today
     and not exists (select 1 from request_files f where f.request_id = r.id and f.purpose = 'report')
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end $$;

-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
