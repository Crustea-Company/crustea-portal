-- 021: Masukan & Komunitas. Karyawan mengirim masukan/saran (boleh anonim) tentang karyawan lain,
-- departemen, atau perusahaan; Corporate Affairs (CA) meninjau dan memberi status; setelah
-- "Ditindaklanjuti" masukan tampil di papan komunitas publik (judul & ringkasan ditulis CA) dan
-- bisa dikomentari semua karyawan.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak mengubah/menghapus data lain.
--
-- Kerahasiaan:
-- * Isi masukan hanya terlihat oleh pengirim dan CA (dept CA + admin).
-- * Masukan anonim: kolom sender_id kosong. Hubungan pengirim <-> masukan disimpan di tabel
--   feedback_senders yang TIDAK bisa dibaca siapa pun lewat aplikasi/API (tanpa aturan baca);
--   hanya fungsi database yang memakainya (agar pengirim bisa melihat masukannya & menerima notifikasi).
--   Catatan dari pengirim anonim dan notifikasi ke CA disimpan tanpa nama pelaku.
-- * Papan publik hanya memuat judul, ringkasan, kategori, dan progres yang ditulis CA. Isi asli,
--   sasaran (nama orang/departemen), dan pengirim tidak pernah ikut tampil.

-- ---------- A. Notifikasi: jenis baru ----------
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset', 'aqua', 'feedback'));

-- Seperti notify_people, tetapi pelaku ditentukan sendiri (null = tanpa nama, untuk pengirim anonim).
create function notify_people_as(p_ids uuid[], p_kind text, p_title text, p_link text, p_actor uuid) returns void
language sql security definer set search_path = public as $$
  insert into notifications (employee_id, kind, title, link, actor_id)
  select distinct x, p_kind, p_title, p_link, p_actor
    from unnest(p_ids) x
   where x is not null and x is distinct from me()
$$;
revoke execute on function notify_people_as(uuid[], text, text, text, uuid) from public, anon, authenticated;

-- Peninjau masukan: anggota dept CA dan admin.
create function is_feedback_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_dept() = 'CA' or my_role() = 'admin', false)
$$;

create function feedback_reviewers() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from employees where is_active and (dept_code = 'CA' or app_role = 'admin')
$$;
revoke execute on function feedback_reviewers() from public, anon, authenticated;

create function feedback_status_label(s text) returns text
language sql immutable as $$
  select case s
    when 'new'          then 'Baru'
    when 'reviewed'     then 'Ditinjau'
    when 'followed_up'  then 'Ditindaklanjuti'
    when 'in_progress'  then 'Sedang diproses'
    when 'done'         then 'Selesai'
    when 'rejected'     then 'Ditolak'
    when 'not_followed' then 'Tidak ditindaklanjuti'
    else s end
$$;

-- ---------- B. Masukan (privat) ----------
create table feedback_items (
  id                 uuid primary key default gen_random_uuid(),
  number             text unique,                                     -- MS-2026-001
  target_kind        text not null check (target_kind in ('person', 'dept', 'company')),
  target_employee_id uuid references employees,
  target_dept        text references departments,
  category           text not null check (category in ('saran', 'keluhan', 'apresiasi', 'lainnya')),
  subject            text not null check (length(trim(subject)) > 0),
  body               text not null check (length(trim(body)) > 0),
  is_anonymous       boolean not null,
  sender_id          uuid references employees,                       -- kosong bila anonim
  status             text not null default 'new' check (status in ('new', 'reviewed', 'followed_up', 'in_progress',
                       'done', 'rejected', 'not_followed')),
  status_since       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (is_anonymous = (sender_id is null)),
  check (target_kind <> 'person' or target_employee_id is not null),
  check (target_kind <> 'dept' or target_dept is not null)
);
create index on feedback_items (status);

-- Pengirim setiap masukan (termasuk anonim). Tidak ada aturan baca: hanya fungsi database yang memakainya.
create table feedback_senders (
  feedback_id uuid primary key references feedback_items on delete cascade,
  employee_id uuid not null references employees
);
create index on feedback_senders (employee_id);

create table feedback_events (
  id          bigserial primary key,
  feedback_id uuid not null references feedback_items on delete cascade,
  actor       uuid references employees,                 -- kosong bila pengirim anonim
  by_sender   boolean not null default false,            -- dicatat oleh pengirim masukan
  action      text not null check (action in ('create', 'status', 'note', 'post_edit')),
  from_status text,
  to_status   text,
  note        text,
  internal    boolean not null default false,            -- catatan internal CA (tidak terlihat pengirim)
  created_at  timestamptz not null default now()
);
create index on feedback_events (feedback_id, created_at);

-- Masukan milik pengguna yang sedang login (termasuk yang anonim).
create function my_feedback_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(feedback_id), '{}') from feedback_senders where employee_id = me()
$$;

-- ---------- C. Papan komunitas (publik) ----------
create table community_posts (
  feedback_id  uuid primary key references feedback_items on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  summary      text not null check (length(trim(summary)) > 0),
  category     text not null,
  status       text not null,                            -- salinan status masukan
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on community_posts (published_at desc);

-- Progres publik: status + catatan publik dari CA.
create table community_post_events (
  id          bigserial primary key,
  feedback_id uuid not null references community_posts on delete cascade,
  actor       uuid references employees,
  status      text,
  note        text,
  created_at  timestamptz not null default now()
);
create index on community_post_events (feedback_id, created_at);

create table community_comments (
  id          bigserial primary key,
  feedback_id uuid not null references community_posts on delete cascade,
  author_id   uuid not null references employees default me(),
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index on community_comments (feedback_id, created_at);

alter table feedback_items        enable row level security;
alter table feedback_senders      enable row level security;
alter table feedback_events       enable row level security;
alter table community_posts       enable row level security;
alter table community_post_events enable row level security;
alter table community_comments    enable row level security;

-- Masukan & riwayatnya: CA/admin, atau pengirimnya sendiri. Tulis hanya lewat fungsi di bawah.
create policy read_feedback_items on feedback_items for select
  using ((select is_feedback_reviewer()) or id = any((select my_feedback_ids())::uuid[]));
create policy read_feedback_events on feedback_events for select
  using ((select is_feedback_reviewer()) or (not internal and feedback_id = any((select my_feedback_ids())::uuid[])));
-- feedback_senders: sengaja tanpa aturan apa pun, dan hak aksesnya dicabut.
revoke all on feedback_senders from anon, authenticated;

-- Papan komunitas: semua karyawan aktif melihat. Postingan & progres hanya ditulis lewat fungsi.
create policy read_community_posts on community_posts for select using ((select me()) is not null);
create policy read_community_post_events on community_post_events for select using ((select me()) is not null);
create policy read_community_comments on community_comments for select using ((select me()) is not null);
create policy insert_community_comments on community_comments for insert
  with check (author_id = (select me()));
-- Komentar dihapus penulisnya sendiri atau CA/admin (moderasi).
create policy delete_community_comments on community_comments for delete
  using (author_id = (select me()) or (select is_feedback_reviewer()));

-- ---------- D. Kirim masukan ----------
create function submit_feedback(p_target_kind text, p_target_employee uuid, p_target_dept text, p_category text,
                                p_subject text, p_body text, p_anonymous boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := me();
  v_id   uuid;
  v_no   text;
  v_year text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_anon boolean := coalesce(p_anonymous, false);
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  if p_target_kind not in ('person', 'dept', 'company') then raise exception 'Pilih masukan ini tentang siapa.'; end if;
  if p_target_kind = 'person' and not exists (select 1 from employees where id = p_target_employee and is_active) then
    raise exception 'Pilih karyawan yang dituju.';
  end if;
  if p_target_kind = 'dept' and not exists (select 1 from departments where code = p_target_dept) then
    raise exception 'Pilih departemen yang dituju.';
  end if;
  if nullif(trim(coalesce(p_subject, '')), '') is null then raise exception 'Judul singkat belum diisi.'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'Isi masukan belum diisi.'; end if;

  perform pg_advisory_xact_lock(hashtext('feedback-number:' || v_year));
  select 'MS-' || v_year || '-' || lpad((coalesce(max(split_part(number, '-', 3)::int), 0) + 1)::text, 3, '0')
    into v_no from feedback_items where number like 'MS-' || v_year || '-%';

  insert into feedback_items (number, target_kind, target_employee_id, target_dept, category, subject, body,
                              is_anonymous, sender_id)
  values (v_no, p_target_kind,
          case when p_target_kind = 'person' then p_target_employee end,
          case when p_target_kind = 'dept' then p_target_dept end,
          p_category, trim(p_subject), trim(p_body), v_anon, case when v_anon then null else v_me end)
  returning id into v_id;
  insert into feedback_senders (feedback_id, employee_id) values (v_id, v_me);
  insert into feedback_events (feedback_id, actor, by_sender, action, to_status)
  values (v_id, case when v_anon then null else v_me end, true, 'create', 'new');

  perform notify_people_as(feedback_reviewers(), 'feedback',
    v_no || ' · Masukan baru' || case when v_anon then ' (anonim)' else '' end || ': ' || trim(p_subject),
    '/komunitas/masukan/' || v_id, case when v_anon then null else v_me end);
  return v_id;
end $$;

-- ---------- E. Ubah status (hanya CA/admin) ----------
-- Baru -> Ditinjau -> Ditindaklanjuti (terbit di papan komunitas) -> Sedang diproses -> Selesai.
-- Baru/Ditinjau -> Ditolak / Tidak ditindaklanjuti (wajib catatan untuk pengirim).
-- Membuka lagi (Ditolak/Tidak ditindaklanjuti -> Ditinjau, Selesai -> Sedang diproses) wajib alasan.
-- p_note = catatan untuk pengirim; p_public_note = catatan di progres publik (setelah terbit);
-- p_title & p_summary = judul dan ringkasan publik, wajib saat Ditindaklanjuti.
create function change_feedback_status(p_id uuid, p_to text, p_note text default null, p_public_note text default null,
                                       p_title text default null, p_summary text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := me();
  v_item    feedback_items;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_pub     text := nullif(trim(coalesce(p_public_note, '')), '');
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_ok      boolean;
  v_reopen  boolean;
  v_sender  uuid;
  v_others  uuid[];
begin
  if v_me is null or not is_feedback_reviewer() then raise exception 'Hanya Corporate Affairs yang boleh mengubah status.'; end if;
  select * into v_item from feedback_items where id = p_id for update;
  if not found then raise exception 'Masukan tidak ditemukan.'; end if;

  v_reopen := (v_item.status in ('rejected', 'not_followed') and p_to = 'reviewed')
           or (v_item.status = 'done' and p_to = 'in_progress');
  v_ok := v_reopen or case v_item.status
    when 'new'         then p_to in ('reviewed', 'followed_up', 'rejected', 'not_followed')
    when 'reviewed'    then p_to in ('followed_up', 'rejected', 'not_followed')
    when 'followed_up' then p_to in ('in_progress', 'done')
    when 'in_progress' then p_to = 'done'
    else false end;
  if not coalesce(v_ok, false) then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".', feedback_status_label(v_item.status), feedback_status_label(p_to);
  end if;
  if p_to in ('rejected', 'not_followed') and v_note is null then
    raise exception 'Tuliskan alasan untuk pengirim.';
  end if;
  if v_reopen and v_note is null then raise exception 'Tuliskan alasan dibuka lagi.'; end if;
  if p_to = 'followed_up' and (v_title is null or v_summary is null) then
    raise exception 'Tuliskan judul dan ringkasan publik untuk papan komunitas.';
  end if;

  update feedback_items set status = p_to, status_since = now(), updated_at = now() where id = p_id;
  insert into feedback_events (feedback_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, 'status', v_item.status, p_to, v_note);

  if p_to = 'followed_up' then
    insert into community_posts (feedback_id, title, summary, category, status)
    values (p_id, v_title, v_summary, v_item.category, p_to);
  end if;
  if exists (select 1 from community_posts where feedback_id = p_id) then
    update community_posts set status = p_to, updated_at = now() where feedback_id = p_id;
    insert into community_post_events (feedback_id, actor, status, note) values (p_id, v_me, p_to, v_pub);
    -- Yang pernah berkomentar ikut diberi tahu progresnya.
    select coalesce(array_agg(distinct author_id), '{}') into v_others from community_comments where feedback_id = p_id;
    perform notify_people_as(v_others, 'feedback',
      'Komunitas · ' || feedback_status_label(p_to) || ': ' || (select title from community_posts where feedback_id = p_id),
      '/komunitas/' || p_id, v_me);
  end if;

  select employee_id into v_sender from feedback_senders where feedback_id = p_id;
  perform notify_people_as(array[v_sender], 'feedback',
    v_item.number || ' · Masukan Anda: ' || feedback_status_label(p_to)
      || case when p_to = 'followed_up' then ' (tampil di papan komunitas)' else '' end,
    '/komunitas/masukan/' || p_id, v_me);
end $$;

-- Ubah judul/ringkasan publik (CA/admin).
create function update_community_post(p_id uuid, p_title text, p_summary text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
begin
  if not is_feedback_reviewer() then raise exception 'Hanya Corporate Affairs yang boleh mengubah postingan.'; end if;
  if v_title is null or v_summary is null then raise exception 'Judul dan ringkasan publik wajib diisi.'; end if;
  update community_posts set title = v_title, summary = v_summary, updated_at = now() where feedback_id = p_id;
  if not found then raise exception 'Postingan tidak ditemukan.'; end if;
  insert into feedback_events (feedback_id, actor, action, note, internal)
  values (p_id, me(), 'post_edit', 'Judul/ringkasan publik diubah: ' || v_title, true);
end $$;

-- ---------- F. Catatan pada masukan ----------
-- Pengirim (tetap tanpa nama bila anonim) atau CA. p_internal = catatan internal CA (tidak terlihat pengirim).
create function add_feedback_note(p_id uuid, p_note text, p_internal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_item     feedback_items;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_sender   uuid;
  v_reviewer boolean := is_feedback_reviewer();
  v_is_mine  boolean;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  if v_note is null then raise exception 'Catatan kosong.'; end if;
  select * into v_item from feedback_items where id = p_id;
  if not found then raise exception 'Masukan tidak ditemukan.'; end if;
  select employee_id into v_sender from feedback_senders where feedback_id = p_id;
  v_is_mine := v_sender = v_me;
  -- Peninjau yang juga pengirim masukan ini dicatat sebagai pengirim (agar anonimnya tetap terjaga).
  if v_is_mine then
    insert into feedback_events (feedback_id, actor, by_sender, action, note)
    values (p_id, case when v_item.is_anonymous then null else v_me end, true, 'note', v_note);
    perform notify_people_as(feedback_reviewers(), 'feedback',
      v_item.number || ' · Catatan baru dari pengirim: ' || v_item.subject,
      '/komunitas/masukan/' || p_id, case when v_item.is_anonymous then null else v_me end);
  elsif v_reviewer then
    insert into feedback_events (feedback_id, actor, action, note, internal)
    values (p_id, v_me, 'note', v_note, coalesce(p_internal, false));
    if not coalesce(p_internal, false) then
      perform notify_people_as(array[v_sender], 'feedback',
        v_item.number || ' · Catatan dari Corporate Affairs untuk masukan Anda', '/komunitas/masukan/' || p_id, v_me);
    end if;
  else
    raise exception 'Akses ditolak.';
  end if;
end $$;

-- ---------- G. Notifikasi komentar ----------
-- Ke CA, pengirim masukan, dan yang pernah berkomentar (kecuali penulis komentar).
create function after_community_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title  text;
  v_ids    uuid[];
begin
  select title into v_title from community_posts where feedback_id = new.feedback_id;
  select coalesce(array_agg(distinct author_id), '{}') into v_ids
    from community_comments where feedback_id = new.feedback_id and id <> new.id;
  v_ids := v_ids || feedback_reviewers()
        || coalesce((select array_agg(employee_id) from feedback_senders where feedback_id = new.feedback_id), '{}');
  perform notify_people_as(v_ids, 'feedback', 'Komunitas · Komentar baru: ' || v_title,
    '/komunitas/' || new.feedback_id, new.author_id);
  return new;
end $$;

create trigger trg_community_comment_created
after insert on community_comments
for each row execute function after_community_comment();

grant execute on function submit_feedback(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function change_feedback_status(uuid, text, text, text, text, text) to authenticated;
grant execute on function update_community_post(uuid, text, text) to authenticated;
grant execute on function add_feedback_note(uuid, text, boolean) to authenticated;
grant execute on function my_feedback_ids() to authenticated;
grant execute on function is_feedback_reviewer() to authenticated;
