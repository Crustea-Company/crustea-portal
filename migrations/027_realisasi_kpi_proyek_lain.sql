-- 027: Realisasi angka KPI per kuartal + jenis proyek "Proyek lain".
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- A. Realisasi KPI: setiap item KPI bisa diisi angka realisasi per kuartal (kalender), mis. 3.200 dari target 5.000 kg.
--    Diisi oleh yang boleh mencentang item (PIC, head dept, admin, CEO; can_edit_kpi) lewat RPC set_kpi_realization.
-- B. Proyek lain (type 'other', nomor PL-2026-001): Aquatour, Webinar, Smallholder, Event P4G, dll. Kolom kategori bebas.
--    Tanpa RAB/kontrak. Alur: Identifikasi peluang -> Konsep & proposal -> Eksekusi & monitoring -> Laporan -> Selesai.
--    Aturan sama dengan Grant/CSR (maju: tim AQ/admin/CEO/PIC; mundur & buka lagi: head AQ/admin/CEO; wajib catatan).

-- ---------- A. Realisasi KPI per kuartal ----------
create table kpi_realizations (
  kpi_id     int not null references kpi_items on delete cascade,
  year       int not null check (year between 2024 and 2100),
  quarter    int not null check (quarter between 1 and 4),
  value      numeric not null check (value >= 0),
  note       text,
  updated_by uuid references employees,
  updated_at timestamptz not null default now(),
  primary key (kpi_id, year, quarter)
);

alter table kpi_realizations enable row level security;
create policy read_kpi_realizations on kpi_realizations for select using ((select me()) is not null);

-- p_value kosong = hapus angka kuartal itu.
create function set_kpi_realization(p_id int, p_year int, p_quarter int, p_value numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v kpi_items;
begin
  select * into v from kpi_items where id = p_id;
  if v.id is null then raise exception 'Item KPI tidak ditemukan.'; end if;
  if not can_edit_kpi(v.dept_code, v.pic_type, v.pic_id) then
    raise exception 'Anda tidak berhak mengisi realisasi item KPI ini.';
  end if;
  if p_quarter not between 1 and 4 or p_year not between 2024 and 2100 then raise exception 'Kuartal tidak valid.'; end if;
  if p_value is null then
    delete from kpi_realizations where kpi_id = p_id and year = p_year and quarter = p_quarter;
    return;
  end if;
  if p_value < 0 then raise exception 'Realisasi tidak boleh negatif.'; end if;
  insert into kpi_realizations (kpi_id, year, quarter, value, note, updated_by, updated_at)
  values (p_id, p_year, p_quarter, p_value, nullif(trim(coalesce(p_note, '')), ''), me(), now())
  on conflict (kpi_id, year, quarter) do update
    set value = excluded.value, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke execute on function set_kpi_realization(int, int, int, numeric, text) from public, anon;
grant execute on function set_kpi_realization(int, int, int, numeric, text) to authenticated;

-- ---------- B. Proyek lain ----------
alter table aqua_projects add column category text;

-- Alur jenis sederhana (tanpa RAB). Grant/CSR sama dengan versi 024; Proyek lain tanpa "Proposal diajukan".
create function simple_stages(p_type text) returns text[]
language sql immutable as $$
  select case
    when p_type = 'other' then array['opportunity', 'proposal', 'execution', 'reporting', 'completed']
    when p_type in ('grant', 'csr') then array['opportunity', 'proposal', 'submitted', 'execution', 'reporting', 'completed']
  end
$$;

alter table aqua_projects drop constraint aqua_projects_type_check;
alter table aqua_projects add constraint aqua_projects_type_check
  check (type in ('aquagrowth', 'mini_ras', 'workshop', 'training', 'grant', 'csr', 'other'));
alter table aqua_projects drop constraint aqua_projects_stage_check;
alter table aqua_projects add constraint aqua_projects_stage_check
  check (stage = 'cancelled' or case when simple_stages(type) is not null then array_position(simple_stages(type), stage) is not null
                                     else aqua_stage_rank(stage) is not null end);

create or replace function aqua_number_prefix(p_type text) returns text
language sql immutable as $$
  select case p_type when 'grant' then 'GR' when 'csr' then 'CSR' when 'other' then 'PL' else 'AQ' end
$$;

create or replace function aqua_stage_label(s text) returns text
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
    when 'proposal'    then 'Konsep & proposal'
    when 'submitted'   then 'Proposal diajukan'
    when 'reporting'   then 'Laporan & pertanggungjawaban'
    else s end
$$;

-- Paket RAB hanya untuk jenis yang memakai alur RAB (selain itu sama dengan versi 024).
create or replace function prepare_aqua_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project aqua_projects;
  v_status  text;
begin
  if tg_op = 'INSERT' then
    select * into v_project from aqua_projects where id::text = new.data->>'project_id';
    if not found then raise exception 'Proyek untuk paket RAB tidak ditemukan.'; end if;
    if not is_aqua_editor() then raise exception 'Hanya tim Aquaculture yang bisa menyusun paket RAB.'; end if;
    if simple_stages(v_project.type) is not null then raise exception 'Proyek Grant/CSR/Proyek lain tidak memakai paket RAB.'; end if;
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

-- Pembungkus alur tahap (versi 025) dengan alur sederhana per jenis (simple_stages).
create or replace function change_aqua_stage(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := me();
  v_p     aqua_projects;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_from  int;
  v_to    int;
  v_ok    boolean := false;
  v_stage text;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_p from aqua_projects where id = p_id for update;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;

  if simple_stages(v_p.type) is null then
    perform change_aqua_stage_flow(p_id, p_to, p_note, p_data);
  else
    v_from := array_position(simple_stages(v_p.type), v_p.stage);
    v_to := array_position(simple_stages(v_p.type), p_to);
    if p_to = 'reopen' then
      v_ok := is_aqua_manager() and v_p.stage = 'cancelled';
    elsif v_p.stage = 'cancelled' then
      v_ok := false;
    elsif p_to = 'cancelled' then
      v_ok := (is_aqua_editor() or v_p.pic_id = v_me) and v_p.stage <> 'completed';
    elsif v_to = v_from + 1 then
      v_ok := is_aqua_editor() or v_p.pic_id = v_me;
    elsif v_to < v_from then
      v_ok := is_aqua_manager();
    end if;
    if not coalesce(v_ok, false) then
      raise exception 'Tahap tidak bisa diubah dari "%" ke "%".', aqua_stage_label(v_p.stage), aqua_stage_label(p_to);
    end if;
    if v_note is null then raise exception 'Tuliskan catatan perubahan status.'; end if;

    if p_to = 'reopen' then
      select from_stage into p_to from aqua_project_events
       where project_id = p_id and to_stage = 'cancelled' order by created_at desc, id desc limit 1;
      p_to := coalesce(p_to, 'opportunity');
      update aqua_projects set cancel_reason = null where id = p_id;
    elsif p_to = 'cancelled' then
      update aqua_projects set cancel_reason = v_note where id = p_id;
    end if;

    update aqua_projects set stage = p_to, stage_since = now() where id = p_id;
    insert into aqua_project_events (project_id, actor, action, from_stage, to_stage, note)
    values (p_id, v_me, 'stage', v_p.stage, p_to, v_note);
    perform notify_people(array[v_p.pic_id, v_p.created_by], 'aqua',
      v_p.number || ' · ' || aqua_stage_label(p_to) || ': ' || v_p.name, '/projects/' || p_id);
  end if;

  select stage into v_stage from aqua_projects where id = p_id;
  if v_stage = 'execution' and v_p.stage <> 'execution' then
    perform notify_people(dept_people('FA'), 'aqua',
      v_p.number || ' · Masuk eksekusi, catat dana masuk: ' || v_p.name, '/projects/' || p_id || '#dana-masuk');
  end if;
end $$;

-- Dana masuk: jenis sederhana mulai Eksekusi (selain itu sama dengan versi 025).
create or replace function record_aqua_income(p_id uuid, p_date date, p_amount bigint, p_allocation text, p_note text default null)
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
  if simple_stages(v_p.type) is not null then
    if v_p.stage not in ('execution', 'reporting', 'completed') then
      raise exception 'Dana masuk proyek ini dicatat mulai tahap Eksekusi & monitoring.';
    end if;
  elsif aqua_stage_rank(v_p.stage) is null or aqua_stage_rank(v_p.stage) < aqua_stage_rank('signed') then
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
  perform notify_people(array[v_p.pic_id], 'aqua', v_p.number || ' · Dana masuk tercatat: ' || v_p.name, '/projects/' || p_id);
end $$;
