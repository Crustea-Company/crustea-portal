-- 015: Aquaculture > Project Management (Aquagrowth, Mini RAS, Workshop, Pelatihan).
-- Lihat docs/fase-2-3/10-aquaculture.md. Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Alur reimburse, pembayaran, dinas, pengadaan, dan komisi tidak berubah.
--
-- - Proyek (aqua_projects) mengikuti SOP Aquaculture: peluang -> kelayakan & RAB -> review F&A -> CEO
--   -> presentasi/negosiasi -> proses kontrak (CA) -> kontrak ditandatangani -> eksekusi & laporan bulanan
--   -> panen & penjualan hasil (Aquagrowth/Mini RAS) -> selesai. Tahap hanya berubah lewat change_aqua_stage.
-- - Kelayakan finansial + RAB = satu paket pengajuan (requests.kind = 'aqua_plan', nomor RA-2026-0001),
--   isi di requests.data. Paket muncul di halaman Review F&A; setelah diterima F&A selalu ke CEO.
--   Status paket otomatis menggerakkan tahap proyek (Review F&A, Menunggu CEO, Disetujui CEO).
-- - Kontrak: Aquagrowth menyimpan daftar investor (modal + persentase, total 100%);
--   Mini RAS, Workshop, Pelatihan cukup nomor kontrak.
-- - Target kuartal: dana masuk proyek dicatat F&A (record_aqua_income) ke tabel revenues berstatus Lunas
--   dengan label alokasi (bawaan 'Aquagrowth'), sehingga otomatis masuk realisasi di /kpi/target.

-- ---------- A. Peran & notifikasi ----------
-- Pengelola proyek: departemen AQ (termasuk head AQ), admin, CEO.
create function is_aqua_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_dept() = 'AQ' or my_role() in ('admin', 'ceo'), false)
$$;

-- Boleh memundurkan tahap / membuka lagi proyek batal: head AQ, admin, CEO.
create function is_aqua_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((my_role() = 'head' and my_dept() = 'AQ') or my_role() in ('admin', 'ceo'), false)
$$;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset', 'aqua'));

-- ---------- B. Proyek ----------
create function aqua_stage_rank(s text) returns int
language sql immutable as $$
  select array_position(array['opportunity', 'plan', 'fa_review', 'ceo_review', 'approved', 'negotiation',
                              'contract', 'signed', 'execution', 'harvest', 'completed'], s)
$$;

create function aqua_stage_label(s text) returns text
language sql immutable as $$
  select case s
    when 'opportunity' then 'Identifikasi peluang'
    when 'plan'        then 'Kelayakan & RAB'
    when 'fa_review'   then 'Review F&A'
    when 'ceo_review'  then 'Menunggu CEO'
    when 'approved'    then 'Disetujui CEO'
    when 'negotiation' then 'Presentasi & negosiasi'
    when 'contract'    then 'Proses kontrak'
    when 'signed'      then 'Kontrak ditandatangani'
    when 'execution'   then 'Eksekusi & monitoring'
    when 'harvest'     then 'Panen & penjualan hasil'
    when 'completed'   then 'Selesai'
    when 'cancelled'   then 'Batal'
    else s end
$$;

create table aqua_projects (
  id                 uuid primary key default gen_random_uuid(),
  number             text unique,                                    -- otomatis, mis. AQ-2026-001
  type               text not null check (type in ('aquagrowth', 'mini_ras', 'workshop', 'training')),
  name               text not null check (length(trim(name)) > 0),
  location           text,
  partner            text,                                           -- calon mitra / investor / klien / peserta
  contact            text,
  source             text,                                           -- asal peluang (referensi, event, dll.)
  description        text,                                           -- data peluang: latar belakang, potensi
  estimated_value    bigint not null default 0 check (estimated_value >= 0),  -- perkiraan nilai (Rp)
  estimated_start    date,
  pic_id             uuid not null references employees default me(),
  stage              text not null default 'opportunity'
                     check (aqua_stage_rank(stage) is not null or stage = 'cancelled'),
  stage_since        timestamptz not null default now(),
  plan_id            uuid references requests,                       -- paket kelayakan & RAB yang berlaku
  investors          jsonb not null default '[]',                    -- Aquagrowth: [{name, capital, percent}]
  contract_number    text,
  contract_signed_on date,
  contract_value     bigint check (contract_value >= 0),
  cancel_reason      text,
  created_by         uuid references employees default me(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on aqua_projects (type, stage);

create table aqua_project_events (
  id         bigserial primary key,
  project_id uuid not null references aqua_projects on delete cascade,
  actor      uuid references employees,
  action     text not null check (action in ('create', 'edit', 'stage', 'plan', 'note', 'report', 'income')),
  from_stage text,
  to_stage   text,
  note       text,
  link       text,
  month      date,                                                   -- laporan bulanan: bulan laporan
  amount     bigint,                                                 -- dana masuk
  created_at timestamptz not null default now()
);
create index on aqua_project_events (project_id, created_at);

-- Dana masuk proyek tercatat di revenues (realisasi target kuartal).
alter table revenues add column aqua_project_id uuid references aqua_projects on delete set null;

create function prepare_aqua_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('aqua-number:' || v_year));
    select 'AQ-' || v_year || '-' || lpad((coalesce(max(split_part(number, '-', 3)::int), 0) + 1)::text, 3, '0')
      into new.number
      from aqua_projects where number like 'AQ-' || v_year || '-%';
    new.stage := 'opportunity';
    new.stage_since := now();
    new.plan_id := null;
    new.investors := '[]';
    new.contract_number := null;
    new.contract_signed_on := null;
    new.contract_value := null;
    new.cancel_reason := null;
    new.created_by := me();
    new.created_at := now();
  elsif current_user in ('authenticated', 'anon')
     and ((new.number, new.stage, new.stage_since, new.plan_id, new.investors, new.contract_number,
           new.contract_signed_on, new.contract_value, new.cancel_reason, new.created_by, new.created_at)
          is distinct from
          (old.number, old.stage, old.stage_since, old.plan_id, old.investors, old.contract_number,
           old.contract_signed_on, old.contract_value, old.cancel_reason, old.created_by, old.created_at)
          or (new.type <> old.type and old.plan_id is not null)) then
    raise exception 'Kolom ini hanya bisa diubah lewat alur proyek.';
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end $$;

create trigger trg_aqua_project_prepare
before insert or update on aqua_projects
for each row execute function prepare_aqua_project();

create function log_aqua_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into aqua_project_events (project_id, actor, action, to_stage) values (new.id, me(), 'create', new.stage);
    perform notify_people(dept_people('AQ', true), 'aqua',
      new.number || ' · Peluang proyek baru: ' || new.name, '/aquaculture/' || new.id);
  elsif new.stage = old.stage
     and (new.type, new.name, new.location, new.partner, new.contact, new.source, new.description,
          new.estimated_value, new.estimated_start, new.pic_id)
         is distinct from
         (old.type, old.name, old.location, old.partner, old.contact, old.source, old.description,
          old.estimated_value, old.estimated_start, old.pic_id) then
    insert into aqua_project_events (project_id, actor, action) values (new.id, me(), 'edit');
  end if;
  return null;
end $$;

create trigger trg_aqua_project_log
after insert or update on aqua_projects
for each row execute function log_aqua_project();

alter table aqua_projects       enable row level security;
alter table aqua_project_events enable row level security;

-- Semua karyawan melihat proyek (transparansi). AQ, admin, CEO menambah & mengubah data peluang.
create policy read_aqua_projects on aqua_projects for select using (me() is not null);
create policy insert_aqua_projects on aqua_projects for insert with check (is_aqua_editor());
create policy update_aqua_projects on aqua_projects for update using (is_aqua_editor()) with check (is_aqua_editor());
-- Peluang yang belum punya paket RAB boleh dihapus head AQ / admin / CEO.
create policy delete_aqua_projects on aqua_projects for delete
  using (is_aqua_manager() and stage = 'opportunity' and plan_id is null);
create policy read_aqua_project_events on aqua_project_events for select using (me() is not null);

-- ---------- C. Paket kelayakan finansial + RAB (mesin pengajuan, kind 'aqua_plan') ----------
alter table requests drop constraint requests_kind_check;
alter table requests add constraint requests_kind_check
  check (kind in ('reimburse', 'payment', 'procurement', 'travel', 'commission', 'aqua_plan'));

-- Nomor otomatis: RA-2026-0001 untuk paket RAB Aquaculture (selain itu sama dengan versi 007).
create or replace function prepare_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := case new.kind
    when 'reimburse' then 'RB' when 'payment' then 'PP' when 'procurement' then 'PR'
    when 'travel' then 'PD' when 'commission' then 'KK' when 'aqua_plan' then 'RA' end;
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

create or replace function request_status_label(s text, k text) returns text
language sql immutable as $$
  select case
    when k = 'travel' and s = 'submitted' then 'Diajukan'
    when k = 'travel' and s = 'approved'  then 'Diverifikasi Finance'
    when k = 'travel' and s = 'paid'      then 'Uang muka dicairkan'
    when k = 'procurement' and s = 'submitted' then 'Menunggu head'
    when k = 'procurement' and s = 'paid'      then 'Dibayar ke vendor'
    when k = 'aqua_plan' and s = 'approved'    then 'Disetujui CEO'
    else request_status_label(s) end
$$;

-- Paket yang sudah disetujui CEO tidak punya SLA lagi (selain itu sama dengan versi 010).
create or replace function sla_due(r requests) returns timestamptz
language sql stable as $$
  select case
    when r.kind = 'procurement' then case
      when r.status = 'submitted' then r.status_since + interval '24 hours'
      when r.status = 'ceo_review' then r.status_since + interval '48 hours'
      when r.status in ('head_approved', 'vendor_compared', 'fa_verified', 'fa_approved', 'ceo_approved')
        then least(workday_add(r.status_since, 2), workday_add(coalesce(r.submitted_at, r.status_since), 5))
      when r.status in ('received', 'payment_approved') then workday_add(r.status_since, 2)
      when r.status = 'paid' then workday_add(r.status_since, 5)
    end
    when r.status in ('submitted', 'in_review', 'ceo_review', 'assigner_approved', 'st_issued')
      or (r.status = 'approved' and r.kind <> 'aqua_plan'
          and (r.kind <> 'travel' or coalesce((r.data->>'advance')::boolean, false)))
    then workday_add(r.status_since, 2) end
$$;

-- Total modal (A capex + B modal kerja + C opex) dari baris RAB; baris = qty x volume x harga satuan (dibulatkan).
-- Sama dengan rabLineTotal/capitalTotal di src/lib/aquaculture.ts.
create function aqua_plan_total(p_data jsonb) returns bigint
language sql immutable as $$
  select coalesce(sum(round(coalesce((l->>'qty')::numeric, 0) * coalesce((l->>'volume')::numeric, 1)
                            * coalesce((l->>'price')::numeric, 0))), 0)::bigint
    from unnest(array['capex', 'workcap', 'opex']) sec
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p_data->sec) = 'array' then p_data->sec else '[]' end) l
$$;

-- Paket baru hanya untuk proyek di tahap peluang / kelayakan yang belum punya paket aktif.
-- Nominal paket = total modal (dihitung ulang setiap kali disimpan). Proyek paket tidak boleh diganti.
create function prepare_aqua_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project aqua_projects;
  v_status  text;
begin
  if tg_op = 'INSERT' then
    select * into v_project from aqua_projects where id::text = new.data->>'project_id';
    if not found then raise exception 'Proyek untuk paket RAB tidak ditemukan.'; end if;
    if not is_aqua_editor() then raise exception 'Hanya tim Aquaculture yang bisa menyusun paket RAB.'; end if;
    if v_project.stage not in ('opportunity', 'plan') then
      raise exception 'Paket RAB baru hanya bisa dibuat di tahap Identifikasi peluang / Kelayakan & RAB.';
    end if;
    select status into v_status from requests where id = v_project.plan_id;
    if v_project.plan_id is not null and v_status <> 'rejected' then
      raise exception 'Proyek ini sudah punya paket RAB. Ubah paket yang ada.';
    end if;
  elsif new.data->>'project_id' is distinct from old.data->>'project_id' then
    raise exception 'Proyek paket RAB tidak bisa diganti.';
  end if;
  new.amount := aqua_plan_total(new.data);
  return new;
end $$;

create trigger trg_request_aqua_plan
before insert or update on requests
for each row when (new.kind = 'aqua_plan') execute function prepare_aqua_plan();

-- Status paket menggerakkan tahap proyek.
create function sync_aqua_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project aqua_projects;
  v_stage   text;
begin
  select * into v_project from aqua_projects where id::text = new.data->>'project_id';
  if not found then return null; end if;
  if tg_op = 'INSERT' then
    update aqua_projects set plan_id = new.id, stage = 'plan',
           stage_since = case when stage = 'plan' then stage_since else now() end
     where id = v_project.id;
    insert into aqua_project_events (project_id, actor, action, from_stage, to_stage, note)
    values (v_project.id, me(), 'plan', v_project.stage, 'plan', 'Paket kelayakan & RAB dibuat: ' || new.number);
    return null;
  end if;
  if new.status = old.status or v_project.plan_id is distinct from new.id
     or v_project.stage not in ('plan', 'fa_review', 'ceo_review') then
    return null;
  end if;
  v_stage := case
    when new.status in ('submitted', 'in_review') then 'fa_review'
    when new.status = 'ceo_review' then 'ceo_review'
    when new.status = 'approved' then 'approved'
    else 'plan' end;
  if v_stage <> v_project.stage then
    update aqua_projects set stage = v_stage, stage_since = now() where id = v_project.id;
  end if;
  insert into aqua_project_events (project_id, actor, action, from_stage, to_stage, note)
  values (v_project.id, me(), 'plan', v_project.stage, v_stage,
          new.number || ' · ' || request_status_label(new.status, new.kind));
  if new.status in ('approved', 'needs_revision', 'rejected') then
    perform notify_people(array[v_project.pic_id] || dept_people('AQ', true), 'aqua',
      v_project.number || ' · Paket RAB ' || lower(request_status_label(new.status, new.kind)) || ': ' || v_project.name,
      '/aquaculture/' || v_project.id);
  end if;
  return null;
end $$;

create trigger trg_request_aqua_sync
after insert or update on requests
for each row when (new.kind = 'aqua_plan') execute function sync_aqua_plan();

-- Semua karyawan boleh melihat paket RAB Aquaculture; tim AQ boleh mengubah isinya saat draf / perlu perbaikan.
create policy read_aqua_plans on requests for select using (kind = 'aqua_plan' and me() is not null);
create policy update_aqua_plans on requests for update
  using (kind = 'aqua_plan' and is_aqua_editor() and status in ('draft', 'needs_revision'))
  with check (kind = 'aqua_plan' and is_aqua_editor() and status in ('draft', 'needs_revision'));

-- ---------- D. Alur tahap proyek ----------
-- Tim AQ (editor): Disetujui CEO -> Presentasi & negosiasi -> Proses kontrak (isi form kontrak, CA dikabari)
--   -> Kontrak ditandatangani (AQ atau CA; Mini RAS/Workshop/Pelatihan wajib nomor kontrak)
--   -> Eksekusi -> Panen (Aquagrowth/Mini RAS) -> Selesai (wajib ringkasan hasil).
-- Batal: wajib alasan, tidak saat paket sedang di F&A/CEO. Head AQ/admin/CEO: mundur tahap (wajib alasan),
-- buka lagi proyek batal (p_to = 'reopen').
-- Tahap Kelayakan & RAB s.d. Disetujui CEO hanya digerakkan status paket RAB.
create function change_aqua_stage(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := me();
  v_p       aqua_projects;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_today   date := (now() at time zone 'Asia/Jakarta')::date;
  v_ed      boolean := is_aqua_editor();
  v_mgr     boolean := is_aqua_manager();
  v_from    int;
  v_to      int;
  v_ok      boolean := false;
  v_extra   text;
  v_plan    text;
  v_inv     jsonb;
  v_sum     numeric;
  v_capital numeric;
  v_number  text;
  v_date    date;
  v_value   bigint;
  v_link    text := '/aquaculture/' || p_id;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_p from aqua_projects where id = p_id for update;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  v_from := aqua_stage_rank(v_p.stage);
  v_to := aqua_stage_rank(p_to);
  select status into v_plan from requests where id = v_p.plan_id;

  if p_to = 'cancelled' then
    v_ok := v_ed and v_p.stage not in ('fa_review', 'ceo_review', 'completed', 'cancelled');
  elsif p_to = 'reopen' then
    v_ok := v_mgr and v_p.stage = 'cancelled';
  elsif v_p.stage = 'cancelled' then
    v_ok := false;
  elsif p_to = 'negotiation' and v_p.stage = 'approved' then
    v_ok := v_ed;
  elsif p_to = 'contract' and v_p.stage in ('negotiation', 'contract') then
    v_ok := v_ed;
  elsif p_to = 'signed' and v_p.stage = 'contract' then
    v_ok := v_ed or my_dept() = 'CA';
  elsif p_to = 'execution' and v_p.stage = 'signed' then
    v_ok := v_ed;
  elsif p_to = 'harvest' and v_p.stage = 'execution' then
    v_ok := v_ed and v_p.type in ('aquagrowth', 'mini_ras');
  elsif p_to = 'completed' and v_p.stage in ('execution', 'harvest') then
    v_ok := v_ed;
  elsif v_to is not null and v_to < v_from then
    -- Mundur tahap: hanya di antara Presentasi & negosiasi s.d. Selesai.
    v_ok := v_mgr and v_to >= aqua_stage_rank('negotiation');
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Tahap tidak bisa diubah dari "%" ke "%".', aqua_stage_label(v_p.stage), aqua_stage_label(p_to);
  end if;

  if p_to = 'cancelled' and v_note is null then raise exception 'Tuliskan alasan proyek batal.'; end if;
  if p_to = 'reopen' and v_note is null then raise exception 'Tuliskan alasan proyek dibuka lagi.'; end if;
  if p_to = 'completed' and v_note is null then raise exception 'Tuliskan ringkasan hasil proyek.'; end if;
  if v_to is not null and v_to < v_from and p_to <> 'cancelled' and v_note is null then
    raise exception 'Tuliskan alasan tahap dimundurkan.';
  end if;

  if p_to = 'contract' and v_p.stage in ('negotiation', 'contract') then
    -- Form permohonan kontrak. Aquagrowth: daftar investor, modal > 0, persentase total 100%.
    if v_p.type = 'aquagrowth' then
      v_inv := case when jsonb_typeof(p_data->'investors') = 'array' then p_data->'investors' else '[]' end;
      if jsonb_array_length(v_inv) = 0 then raise exception 'Isi minimal satu investor.'; end if;
      if exists (select 1 from jsonb_array_elements(v_inv) x
                  where nullif(trim(coalesce(x->>'name', '')), '') is null
                     or coalesce((x->>'capital')::numeric, 0) <= 0
                     or coalesce((x->>'percent')::numeric, 0) <= 0) then
        raise exception 'Setiap investor wajib punya nama, modal, dan persentase lebih dari 0.';
      end if;
      select sum((x->>'percent')::numeric), sum((x->>'capital')::numeric) into v_sum, v_capital
        from jsonb_array_elements(v_inv) x;
      if abs(v_sum - 100) > 0.01 then
        raise exception 'Total persentase investor harus 100 persen (sekarang % persen).', round(v_sum, 2);
      end if;
      select jsonb_agg(jsonb_build_object('name', trim(x->>'name'), 'capital', round((x->>'capital')::numeric)::bigint,
                                          'percent', round((x->>'percent')::numeric, 2)))
        into v_inv from jsonb_array_elements(v_inv) x;
      update aqua_projects set investors = v_inv, contract_value = round(v_capital)::bigint where id = p_id;
      v_extra := jsonb_array_length(v_inv) || ' investor · modal Rp' ||
                 replace(to_char(round(v_capital), 'FM999G999G999G999'), ',', '.');
    end if;
    if v_p.stage = 'contract' then
      insert into aqua_project_events (project_id, actor, action, from_stage, to_stage, note)
      values (p_id, v_me, 'stage', 'contract', 'contract', concat_ws(E'\n', 'Form kontrak diperbarui. ' || v_extra, v_note));
      return;
    end if;
  elsif p_to = 'signed' then
    begin
      v_date := (p_data->>'signed_on')::date;
    exception when others then v_date := null;
    end;
    v_number := nullif(trim(coalesce(p_data->>'contract_number', '')), '');
    begin
      v_value := nullif(p_data->>'contract_value', '')::bigint;
    exception when others then v_value := null;
    end;
    if v_date is null or v_date > v_today then raise exception 'Tanggal tanda tangan belum diisi atau di masa depan.'; end if;
    if v_number is null and v_p.type <> 'aquagrowth' then raise exception 'Nomor kontrak wajib diisi.'; end if;
    if v_value is not null and v_value < 0 then raise exception 'Nilai kontrak tidak valid.'; end if;
    update aqua_projects
       set contract_number = v_number, contract_signed_on = v_date,
           contract_value = coalesce(v_value, contract_value)
     where id = p_id;
    v_extra := concat_ws(' · ', 'No. kontrak ' || v_number, 'ditandatangani ' || to_char(v_date, 'DD-MM-YYYY'),
                         'nilai Rp' || replace(to_char(coalesce(v_value, v_p.contract_value), 'FM999G999G999G999'), ',', '.'));
  elsif p_to = 'cancelled' then
    update aqua_projects set cancel_reason = v_note where id = p_id;
  elsif p_to = 'reopen' then
    -- Kembali ke tahap terakhir yang masuk akal menurut paket RAB.
    p_to := case when v_plan = 'approved' then 'approved'
                 when v_p.plan_id is not null and v_plan <> 'rejected' then 'plan'
                 else 'opportunity' end;
    if v_plan in ('submitted', 'in_review') then p_to := 'fa_review'; end if;
    if v_plan = 'ceo_review' then p_to := 'ceo_review'; end if;
    update aqua_projects set cancel_reason = null where id = p_id;
  end if;

  update aqua_projects set stage = p_to, stage_since = now() where id = p_id;
  insert into aqua_project_events (project_id, actor, action, from_stage, to_stage, note)
  values (p_id, v_me, 'stage', v_p.stage, p_to, nullif(concat_ws(E'\n', v_extra, v_note), ''));

  if p_to = 'contract' then
    perform notify_people(dept_people('CA') || array[v_p.pic_id], 'aqua',
      v_p.number || ' · Permohonan kontrak: ' || v_p.name, v_link);
  else
    perform notify_people(array[v_p.pic_id] || dept_people('AQ', true), 'aqua',
      v_p.number || ' · ' || aqua_stage_label(p_to) || ': ' || v_p.name, v_link);
  end if;
end $$;

-- Catatan (semua karyawan, mis. review lintas tim) dan laporan bulanan (tim AQ: bulan + link laporan).
create function add_aqua_note(p_id uuid, p_note text, p_report boolean default false,
                              p_month date default null, p_link text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p    aqua_projects;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_link text := nullif(trim(coalesce(p_link, '')), '');
begin
  if me() is null then raise exception 'Akses ditolak.'; end if;
  select * into v_p from aqua_projects where id = p_id;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if v_link is not null and v_link !~* '^https?://' then raise exception 'Link harus diawali http:// atau https://'; end if;
  if p_report then
    if not is_aqua_editor() then raise exception 'Laporan bulanan diisi tim Aquaculture.'; end if;
    if v_p.stage not in ('execution', 'harvest', 'completed') then
      raise exception 'Laporan bulanan dimulai setelah proyek masuk tahap eksekusi.';
    end if;
    if p_month is null or v_link is null then raise exception 'Isi bulan laporan dan link laporan.'; end if;
  elsif v_note is null then
    raise exception 'Catatan kosong.';
  end if;
  insert into aqua_project_events (project_id, actor, action, note, link, month)
  values (p_id, me(), case when p_report then 'report' else 'note' end, v_note, v_link,
          case when p_report then date_trunc('month', p_month)::date end);
  perform notify_people(array[v_p.pic_id] || case when p_report then dept_people('MGT') else '{}'::uuid[] end, 'aqua',
    v_p.number || ' · ' || case when p_report then 'Laporan bulanan ' || to_char(p_month, 'MM-YYYY') else 'Catatan baru' end ||
    ': ' || v_p.name, '/aquaculture/' || p_id);
end $$;

-- Dana masuk proyek (pembayaran klien/peserta, modal investor, penjualan panen) dicatat F&A/admin/CEO
-- ke revenues berstatus Lunas -> realisasi target kuartal sesuai label alokasi.
create function record_aqua_income(p_id uuid, p_date date, p_amount bigint, p_allocation text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p     aqua_projects;
  v_alloc text := nullif(trim(coalesce(p_allocation, '')), '');
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not can_record_revenue() then raise exception 'Dana masuk dicatat oleh F&A, admin, atau CEO.'; end if;
  select * into v_p from aqua_projects where id = p_id;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if aqua_stage_rank(v_p.stage) is null or aqua_stage_rank(v_p.stage) < aqua_stage_rank('signed') then
    raise exception 'Dana masuk dicatat setelah kontrak ditandatangani.';
  end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal dana masuk belum diisi atau di masa depan.';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0.'; end if;
  insert into revenues (revenue_date, amount, allocation, status, description, aqua_project_id)
  values (p_date, p_amount, v_alloc, 'paid', concat_ws(' · ', v_p.number, v_p.name, v_note), p_id);
  insert into aqua_project_events (project_id, actor, action, note, amount)
  values (p_id, me(), 'income', concat_ws(' · ', to_char(p_date, 'DD-MM-YYYY'), 'alokasi ' || coalesce(v_alloc, '-'), v_note), p_amount);
  perform notify_people(array[v_p.pic_id], 'aqua', v_p.number || ' · Dana masuk tercatat: ' || v_p.name, '/aquaculture/' || p_id);
end $$;

-- ---------- E. Catatan pengajuan: paket RAB boleh diberi catatan oleh tim AQ, TechOps, DM (review lintas tim) ----------
-- Catatan tanpa mengubah status (selain itu sama dengan versi 010).
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
          or (v_req.kind = 'travel' and (v_req.assigner_id = v_me or is_travel_hr()))
          or (v_req.kind = 'procurement' and (is_techops() or is_procurement_head(v_req.dept_code)))
          or (v_req.kind = 'aqua_plan' and (is_aqua_editor() or my_dept() in ('TO', 'DM')))) then
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
    elsif v_req.kind = 'procurement' and v_req.status in ('submitted', 'head_approved', 'po_issued', 'returned') then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.id <> v_me
         and case when v_req.status = 'submitted' then e.app_role = 'head' and e.dept_code = v_req.dept_code
                  else e.dept_code = 'TO' end;
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

-- ---------- F. Fungsi alur pengajuan (menggantikan versi 012) ----------
-- Perubahan: paket RAB Aquaculture (aqua_plan) yang diterima F&A selalu ke CEO (Menunggu CEO), dan tidak punya
-- tahap "Ditransfer". Selebihnya sama persis dengan versi 012.
create or replace function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null,
                                       p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_req      requests;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_reviewer boolean := is_request_reviewer();
  v_ceo      boolean := my_role() in ('ceo', 'admin');
  v_hr       boolean := is_travel_hr();
  v_to       boolean := is_techops();
  v_fa_head  boolean := is_fa_head();
  v_assigner boolean;
  v_head     boolean;
  v_advance  boolean;
  v_ok       boolean := false;
  v_year     text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_st       text;
  v_po       text;
  v_patch    jsonb;
  v_amount   bigint;
  v_vendor   jsonb;
  v_extra    text;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_req from requests where id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  v_assigner := v_req.assigner_id = v_me or my_role() = 'admin';
  v_head := is_procurement_head(v_req.dept_code);
  v_advance := coalesce((v_req.data->>'advance')::boolean, false);

  if p_to = 'submitted' then
    v_ok := v_req.requester_id = v_me and v_req.status in ('draft', 'needs_revision');
  elsif v_req.kind = 'procurement' then
    v_ok := case p_to
      when 'head_approved'    then v_head and v_req.status = 'submitted'
      when 'vendor_compared'  then v_to and v_req.status = 'head_approved'
      when 'fa_verified'      then v_reviewer and v_req.status = 'vendor_compared'
      when 'fa_approved'      then v_fa_head and v_req.status = 'fa_verified'
      when 'ceo_approved'     then v_ceo and v_req.status = 'ceo_review'
      when 'po_issued'        then v_reviewer and v_req.status in ('fa_approved', 'ceo_approved')
      when 'received'         then (v_to or v_req.requester_id = v_me) and v_req.status in ('po_issued', 'returned')
      when 'returned'         then (v_to or v_req.requester_id = v_me) and v_req.status = 'po_issued'
      when 'payment_approved' then v_fa_head and v_req.status = 'received'
      when 'paid'             then v_reviewer and v_req.status = 'payment_approved'
      when 'completed'        then (v_reviewer or v_to) and v_req.status = 'paid'
      when 'needs_revision'   then (v_head and v_req.status = 'submitted') or (v_to and v_req.status = 'head_approved')
                                   or (v_reviewer and v_req.status = 'vendor_compared')
                                   or (v_fa_head and v_req.status = 'fa_verified') or (v_ceo and v_req.status = 'ceo_review')
      when 'rejected'         then (v_head and v_req.status = 'submitted') or (v_to and v_req.status = 'head_approved')
                                   or (v_reviewer and v_req.status = 'vendor_compared')
                                   or (v_fa_head and v_req.status = 'fa_verified') or (v_ceo and v_req.status = 'ceo_review')
      else false end;
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
    v_ok := v_reviewer and v_req.status = 'approved' and v_req.kind <> 'aqua_plan';
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".',
      request_status_label(v_req.status, v_req.kind), request_status_label(p_to, v_req.kind);
  end if;
  -- Peninjau tidak boleh meninjau pengajuannya sendiri (kecuali admin; CEO boleh menyetujui
  -- penugasan dinasnya sendiri sebagai penugas; pemohon pengadaan ikut memeriksa barang yang diterima).
  if p_to <> 'submitted' and v_req.requester_id = v_me and my_role() <> 'admin'
     and not (p_to = 'assigner_approved' and my_role() = 'ceo')
     and not (v_req.kind = 'procurement' and p_to in ('received', 'returned')) then
    raise exception 'Anda tidak boleh meninjau pengajuan Anda sendiri.';
  end if;
  if p_to in ('needs_revision', 'rejected') and v_note is null then
    raise exception 'Catatan/alasan wajib diisi.';
  end if;
  if v_req.kind = 'procurement' and p_to = 'returned' and v_note is null then
    raise exception 'Tuliskan alasan retur (jumlah/spesifikasi/kondisi yang tidak sesuai).';
  end if;
  if v_req.kind = 'procurement' and p_to = 'completed' and v_note is null then
    raise exception 'Tuliskan nomor aset atau catatan stok.';
  end if;
  -- Klaim komisi: diterima hanya bila penjualan sudah lunas. Baris dari modul Penjualan memakai status Lunas
  -- yang dicatat Finance di lead; baris manual wajib dicentang F&A.
  if v_req.kind = 'commission' and p_to = 'approved' then
    select string_agg(s.number, ', ') into v_extra
      from jsonb_array_elements(v_req.data->'lines') l
      join sales_leads s on s.id::text = l->>'lead_id'
     where s.paid_on is null;
    if v_extra is not null then
      raise exception 'Penjualan % belum lunas. Finance menandai Lunas di halaman Penjualan dulu.', v_extra;
    end if;
    if exists (select 1 from jsonb_array_elements(v_req.data->'lines') l where nullif(l->>'lead_id', '') is null) then
      if not coalesce((p_data->>'sales_paid')::boolean, false) then
        raise exception 'Centang "Penjualan sudah lunas" sebelum menerima klaim komisi.';
      end if;
      v_extra := 'Penjualan dikonfirmasi lunas oleh F&A.';
    else
      v_extra := 'Penjualan lunas (tercatat di modul Penjualan).';
    end if;
    v_patch := jsonb_build_object('sales_paid', true, 'sales_paid_by', v_me, 'sales_paid_at', now());
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
  if p_to = 'completed' and v_req.kind = 'travel' and not exists (
    select 1 from request_files f where f.request_id = p_id and f.purpose = 'report') then
    raise exception 'FPTD dan laporan misi belum dilampirkan pemohon.';
  end if;

  -- Pengadaan: perbandingan vendor (TO) dan pilihan vendor (Head F&A).
  if v_req.kind = 'procurement' and p_to = 'vendor_compared' then
    if coalesce(jsonb_typeof(p_data->'vendors'), '') <> 'array' or jsonb_array_length(p_data->'vendors') < 3 then
      raise exception 'Isi minimal 3 vendor pembanding.';
    end if;
    if coalesce((p_data->>'recommended')::int, -1) not between 0 and jsonb_array_length(p_data->'vendors') - 1 then
      raise exception 'Pilih satu vendor yang direkomendasikan.';
    end if;
    v_patch := jsonb_build_object('vendors', p_data->'vendors', 'recommended', (p_data->>'recommended')::int);
  elsif v_req.kind = 'procurement' and p_to = 'fa_approved' then
    v_vendor := v_req.data->'vendors'->((p_data->>'selected')::int);
    if v_vendor is null or nullif(trim(coalesce(p_data->>'method', '')), '') is null then
      raise exception 'Pilih vendor dan metode pengadaan.';
    end if;
    v_amount := (v_vendor->>'price')::bigint;
    v_patch := jsonb_build_object('selected', (p_data->>'selected')::int, 'method', trim(p_data->>'method'));
    v_extra := 'Vendor dipilih: ' || (v_vendor->>'name') || ' · Rp' ||
               replace(to_char(v_amount, 'FM999G999G999G999'), ',', '.') || ' · metode: ' || trim(p_data->>'method');
  end if;

  -- Permintaan pembayaran >= Rp5 juta yang diterima F&A -> menunggu persetujuan CEO.
  if p_to = 'approved' and v_req.status <> 'ceo_review'
     and ((v_req.kind = 'payment' and v_req.amount >= 5000000) or v_req.kind = 'aqua_plan') then
    p_to := 'ceo_review';
  end if;
  -- Pengadaan >= Rp5 juta (harga vendor terpilih) yang disetujui Head F&A -> approval final CEO.
  if p_to = 'fa_approved' and coalesce(v_amount, v_req.amount) >= 5000000 then
    p_to := 'ceo_review';
  end if;

  -- Nomor surat tugas ST-2026-001, berurutan per tahun.
  if p_to = 'st_issued' then
    perform pg_advisory_xact_lock(hashtext('st-number:' || v_year));
    select 'ST-' || v_year || '-' || lpad((coalesce(max(split_part(st_number, '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_st
      from requests where st_number like 'ST-' || v_year || '-%';
  end if;
  -- Nomor PO PO-2026-001, berurutan per tahun (disimpan di data.po_number).
  if p_to = 'po_issued' then
    perform pg_advisory_xact_lock(hashtext('po-number:' || v_year));
    select 'PO-' || v_year || '-' || lpad((coalesce(max(split_part(data->>'po_number', '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_po
      from requests where kind = 'procurement' and data->>'po_number' like 'PO-' || v_year || '-%';
    v_patch := jsonb_build_object('po_number', v_po);
    v_extra := 'No. PO: ' || v_po;
  end if;
  if v_st is not null then v_extra := 'No. surat tugas: ' || v_st; end if;

  update requests
     set status = p_to,
         status_since = now(),
         submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
         paid_on = case when p_to = 'paid' then p_paid_on else paid_on end,
         st_number = coalesce(v_st, st_number),
         amount = coalesce(v_amount, amount),
         data = data || coalesce(v_patch, '{}'::jsonb)
   where id = p_id;

  insert into request_events (request_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, case when p_to = 'submitted' then 'submit' else 'status' end, v_req.status, p_to,
          case when v_extra is not null then concat_ws(E'\n', v_extra, v_note) else v_note end);

  if p_to = 'submitted' then
    if v_req.kind = 'travel' then
      -- Penugasan dinas -> penugas.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select v_req.assigner_id, 'request', p_id,
             v_req.number || ' · Perlu persetujuan penugas: ' || v_req.title, v_me
       where v_req.assigner_id <> v_me;
    elsif v_req.kind = 'procurement' then
      -- PR -> head departemen pemohon; bila tidak ada (atau pemohon sendiri head) -> CEO.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan head: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.app_role = 'head' and e.dept_code = v_req.dept_code and e.id <> v_me;
      if not found then
        insert into notifications (employee_id, kind, request_id, title, actor_id)
        select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan head: ' || v_req.title, v_me
          from employees e
         where e.is_active and e.app_role = 'ceo' and e.id <> v_me;
      end if;
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
             v_req.number || ' · Keputusan CEO: ' || request_status_label(p_to, v_req.kind) || ': ' || v_req.title, v_me
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
    elsif v_req.kind = 'procurement' and p_to in ('head_approved', 'vendor_compared', 'fa_verified', 'fa_approved',
                                                  'po_issued', 'received', 'returned', 'payment_approved', 'paid') then
      -- Pengadaan -> pihak yang memegang tahap berikutnya.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · ' || case p_to
               when 'head_approved'    then 'Perlu perbandingan vendor'
               when 'vendor_compared'  then 'Perlu verifikasi Finance'
               when 'fa_verified'      then 'Perlu persetujuan Head F&A'
               when 'fa_approved'      then 'Perlu terbitkan PO'
               when 'po_issued'        then 'PO terbit, siapkan penerimaan barang/jasa'
               when 'received'         then 'Barang/jasa diterima, perlu triple matching'
               when 'returned'         then 'Barang/jasa diretur ke vendor'
               when 'payment_approved' then 'Perlu dibayar ke vendor'
               when 'paid'             then 'Perlu registrasi aset/stok'
             end || ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.id <> v_me and case
               when p_to in ('head_approved', 'po_issued', 'paid') then e.dept_code = 'TO'
               when p_to in ('fa_verified', 'received') then e.dept_code = 'FA' and e.app_role = 'head'
               when p_to = 'returned' then e.dept_code in ('FA', 'TO')
               else e.dept_code = 'FA' end;
    end if;
  end if;
end $$;


-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
