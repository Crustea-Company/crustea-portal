-- 025: Project Management: kode proyek per jenis + dana masuk saat Eksekusi & monitoring.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- - Nomor proyek: Grant = GR-2026-001, CSR = CSR-2026-001, jenis lain tetap AQ-2026-001.
--   Proyek Grant/CSR yang sudah ada diberi nomor baru (AQ-2026-003 -> GR-2026-001).
--   Ganti jenis di tahap Identifikasi peluang ke jenis berawalan lain = nomor baru.
-- - Begitu proyek masuk "Eksekusi & monitoring", F&A otomatis mendapat notifikasi untuk mencatat dana masuk
--   (link langsung ke bagian Dana masuk di halaman proyek).
-- - Grant/CSR boleh dicatat dana masuknya mulai tahap Eksekusi (sebelumnya tidak bisa sama sekali).

-- ---------- A. Nomor per jenis ----------
create function aqua_number_prefix(p_type text) returns text
language sql immutable as $$
  select case p_type when 'grant' then 'GR' when 'csr' then 'CSR' else 'AQ' end
$$;

create function next_aqua_number(p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := aqua_number_prefix(p_type);
  v_year   text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_number text;
begin
  perform pg_advisory_xact_lock(hashtext('aqua-number:' || v_prefix || v_year));
  select v_prefix || '-' || v_year || '-' || lpad((coalesce(max(split_part(number, '-', 3)::int), 0) + 1)::text, 3, '0')
    into v_number
    from aqua_projects where number like v_prefix || '-' || v_year || '-%';
  return v_number;
end $$;
revoke execute on function next_aqua_number(text) from public, anon, authenticated;

-- Sama dengan versi 015, kecuali nomor memakai awalan jenis (dan nomor baru bila awalan jenis berganti).
create or replace function prepare_aqua_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := next_aqua_number(new.type);
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
  else
    if current_user in ('authenticated', 'anon')
       and ((new.number, new.stage, new.stage_since, new.plan_id, new.investors, new.contract_number,
             new.contract_signed_on, new.contract_value, new.cancel_reason, new.created_by, new.created_at)
            is distinct from
            (old.number, old.stage, old.stage_since, old.plan_id, old.investors, old.contract_number,
             old.contract_signed_on, old.contract_value, old.cancel_reason, old.created_by, old.created_at)
            or (new.type <> old.type and old.plan_id is not null)) then
      raise exception 'Kolom ini hanya bisa diubah lewat alur proyek.';
    end if;
    if aqua_number_prefix(new.type) <> aqua_number_prefix(old.type) then
      new.number := next_aqua_number(new.type);
    end if;
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select id, type from aqua_projects where type in ('grant', 'csr') order by created_at loop
    update aqua_projects set number = next_aqua_number(r.type) where id = r.id;
  end loop;
end $$;

-- ---------- B. Masuk Eksekusi -> F&A dikabari untuk mencatat dana masuk ----------
-- Pembungkus alur tahap (versi 024) + notifikasi F&A. Alur Grant/CSR sama dengan versi 024.
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

  if v_p.type not in ('grant', 'csr') then
    perform change_aqua_stage_flow(p_id, p_to, p_note, p_data);
  else
    v_from := grant_stage_rank(v_p.stage);
    v_to := grant_stage_rank(p_to);
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

-- ---------- C. Dana masuk: Grant/CSR mulai Eksekusi (selain itu sama dengan versi 015/024) ----------
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
  if v_p.type in ('grant', 'csr') then
    if v_p.stage not in ('execution', 'reporting', 'completed') then
      raise exception 'Dana masuk Grant/CSR dicatat mulai tahap Eksekusi & monitoring.';
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
