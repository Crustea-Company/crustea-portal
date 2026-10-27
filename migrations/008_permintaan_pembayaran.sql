-- 008: Permintaan pembayaran (kind = 'payment', nomor PP-...)
-- Lihat docs/fase-2-3/03-permintaan-pembayaran.md.
--
-- Menambah status 'ceo_review' ("Menunggu CEO"): permintaan pembayaran >= Rp5.000.000 yang sudah
-- diterima F&A harus disetujui CEO dulu sebelum "Diterima". Di bawah Rp5 juta (dan jenis pengajuan
-- lain, mis. reimburse) alurnya tidak berubah.
--   peninjau F&A : submitted / in_review -> approved  ==> otomatis jadi ceo_review bila payment >= 5 jt
--   CEO / admin  : ceo_review -> approved, needs_revision (wajib catatan), rejected (wajib alasan)
-- Tidak ada tabel baru; isi form disimpan di requests.data.

-- ---------- A. Status baru ----------
alter table requests drop constraint requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('draft', 'submitted', 'in_review', 'ceo_review', 'approved', 'paid', 'needs_revision', 'rejected'));

create or replace function request_status_label(s text) returns text
language sql immutable as $$
  select case s
    when 'draft'          then 'Draf'
    when 'submitted'      then 'Belum di-review'
    when 'in_review'      then 'Sedang di-review'
    when 'ceo_review'     then 'Menunggu CEO'
    when 'approved'       then 'Diterima'
    when 'paid'           then 'Ditransfer'
    when 'needs_revision' then 'Perlu perbaikan'
    when 'rejected'       then 'Ditolak'
    else s end
$$;

-- SLA 2 hari kerja juga berlaku saat menunggu CEO.
create or replace function sla_due(r requests) returns timestamptz
language sql stable as $$
  select case when r.status in ('submitted', 'in_review', 'ceo_review', 'approved')
              then workday_add(r.status_since, 2) end
$$;

-- ---------- B. Fungsi alur pengajuan (menggantikan versi 007) ----------
create or replace function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_req      requests;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_reviewer boolean := is_request_reviewer();
  v_ceo      boolean := my_role() in ('ceo', 'admin');
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
    v_ok := (v_reviewer and v_req.status in ('submitted', 'in_review'))
         or (v_ceo and v_req.status = 'ceo_review');
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

  -- Permintaan pembayaran >= Rp5 juta yang diterima F&A -> menunggu persetujuan CEO.
  if p_to = 'approved' and v_req.status <> 'ceo_review'
     and v_req.kind = 'payment' and v_req.amount >= 5000000 then
    p_to := 'ceo_review';
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
  else
    if v_req.requester_id <> v_me then
      -- Status berubah -> pemohon.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      values (v_req.requester_id, 'request', p_id,
              v_req.number || ' · ' || request_status_label(p_to) || ': ' || v_req.title, v_me);
    end if;
    if p_to = 'ceo_review' then
      -- Perlu persetujuan CEO.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan CEO: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me;
    elsif v_req.status = 'ceo_review' then
      -- Keputusan CEO -> F&A (agar bisa ditransfer / ditindaklanjuti).
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · Keputusan CEO: ' || request_status_label(p_to) || ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
  end if;
end $$;

-- ---------- C. Notifikasi "Lewat SLA" juga untuk CEO (status Menunggu CEO) ----------
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
  -- F&A: status yang menunggu F&A. CEO: status Menunggu CEO.
  insert into notifications (employee_id, kind, request_id, title, dedupe_key)
  select v_me, 'sla', r.id,
         r.number || ' · ' || request_status_label(r.status) || ': ' || r.title,
         'sla:' || r.id || ':' || r.status || ':' || extract(epoch from r.status_since)::bigint
    from requests r
   where ((is_request_reviewer() and r.status in ('submitted', 'in_review', 'approved'))
          or (my_role() = 'ceo' and r.status = 'ceo_review'))
     and r.requester_id <> v_me
     and workday_add(r.status_since, 2) < now()
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end $$;

-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
