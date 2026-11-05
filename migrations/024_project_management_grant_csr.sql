-- 024: Project Management (dulu "Aquaculture"): jenis proyek Grant & CSR + alamat halaman /projects.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- - Jenis baru 'grant' dan 'csr'. Tanpa kelayakan finansial/RAB dan tanpa kontrak. Alur:
--   Identifikasi peluang -> Penyusunan proposal -> Proposal diajukan -> Eksekusi & monitoring
--   -> Laporan & pertanggungjawaban -> Selesai (Batal kapan saja sebelum selesai).
--   Maju satu tahap: tim AQ/admin/CEO atau PIC proyek. Mundur & buka lagi proyek batal: head AQ/admin/CEO.
--   Setiap perubahan tahap wajib catatan. PIC = kolom pic_id yang sudah ada.
-- - Proyek lama (Aquagrowth, Mini RAS, Workshop, Pelatihan) tidak berubah alurnya.
-- - Semua link notifikasi /aquaculture/... diganti /projects/... (lama dan yang akan datang).
-- - KPI departemen: tidak perlu perubahan database (aturan write_kpi sudah mengizinkan admin, CEO, head dept).

-- ---------- A. Jenis & tahap ----------
create function grant_stage_rank(s text) returns int
language sql immutable as $$
  select array_position(array['opportunity', 'proposal', 'submitted', 'execution', 'reporting', 'completed'], s)
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
    when 'proposal'    then 'Penyusunan proposal'
    when 'submitted'   then 'Proposal diajukan'
    when 'reporting'   then 'Laporan & pertanggungjawaban'
    else s end
$$;

alter table aqua_projects drop constraint aqua_projects_type_check;
alter table aqua_projects add constraint aqua_projects_type_check
  check (type in ('aquagrowth', 'mini_ras', 'workshop', 'training', 'grant', 'csr'));

-- Tahap harus cocok dengan alur jenisnya (ganti jenis antar-alur hanya bisa di tahap yang ada di keduanya).
alter table aqua_projects drop constraint aqua_projects_stage_check;
alter table aqua_projects add constraint aqua_projects_stage_check
  check (stage = 'cancelled' or case when type in ('grant', 'csr') then grant_stage_rank(stage) is not null
                                     else aqua_stage_rank(stage) is not null end);

-- ---------- B. Grant/CSR tidak memakai paket RAB (selain itu sama dengan versi 015) ----------
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
    if v_project.type in ('grant', 'csr') then raise exception 'Proyek Grant/CSR tidak memakai paket RAB.'; end if;
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

-- ---------- C. Alur tahap ----------
-- Fungsi lama (Aquagrowth, Mini RAS, Workshop, Pelatihan) diganti nama dan hanya dipanggil lewat change_aqua_stage.
alter function change_aqua_stage(uuid, text, text, jsonb) rename to change_aqua_stage_flow;
revoke execute on function change_aqua_stage_flow(uuid, text, text, jsonb) from public, anon, authenticated;

create function change_aqua_stage(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := me();
  v_p    aqua_projects;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_from int;
  v_to   int;
  v_ok   boolean := false;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_p from aqua_projects where id = p_id for update;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if v_p.type not in ('grant', 'csr') then
    perform change_aqua_stage_flow(p_id, p_to, p_note, p_data);
    return;
  end if;

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
    -- Kembali ke tahap sebelum dibatalkan.
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
end $$;
revoke execute on function change_aqua_stage(uuid, text, text, jsonb) from public, anon;
grant execute on function change_aqua_stage(uuid, text, text, jsonb) to authenticated;

-- ---------- D. Alamat baru /projects ----------
-- Fungsi yang membuat notifikasi: ganti link /aquaculture/ menjadi /projects/ (isi fungsi lain tidak berubah).
-- Laporan bulanan juga boleh di tahap "Laporan & pertanggungjawaban" (Grant/CSR).
do $$
declare
  f   text;
  def text;
begin
  foreach f in array array['log_aqua_project', 'sync_aqua_plan', 'change_aqua_stage_flow', 'add_aqua_note', 'record_aqua_income'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace;
    if def is null or position('/aquaculture/' in def) = 0 then
      raise exception 'Fungsi % tidak ditemukan atau tidak berisi link /aquaculture/.', f;
    end if;
    def := replace(def, '/aquaculture/', '/projects/');
    if f = 'add_aqua_note' then
      def := replace(def, '(''execution'', ''harvest'', ''completed'')', '(''execution'', ''harvest'', ''reporting'', ''completed'')');
    end if;
    execute def;
  end loop;
end $$;

update notifications set link = '/projects' || substr(link, length('/aquaculture') + 1) where link like '/aquaculture%';
update procedures set body = replace(body, '](/aquaculture', '](/projects') where body like '%](/aquaculture%';
