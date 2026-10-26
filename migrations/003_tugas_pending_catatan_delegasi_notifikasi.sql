-- =====================================================================
-- 003 - Tugas: status Pending, catatan, pengingat, delegasi, notifikasi,
--       riwayat perubahan tugas, kode tugas otomatis
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Tidak mengubah atau menghapus data yang sudah ada.
-- =====================================================================

-- ---------- A. Status baru: pending ----------
-- Urutan: Belum Mulai, Berjalan, Pending, Selesai. Yang boleh mengubah status tetap
-- PIC, head departemennya, admin, dan CEO (aturan lama tidak berubah).
alter type task_status add value if not exists 'pending' after 'on_going';

-- ---------- B. Catatan per tugas (terlihat semua karyawan) ----------
create table task_notes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks on delete cascade,
  author_id  uuid not null references employees default me(),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on task_notes (task_id);

alter table task_notes enable row level security;
create policy read_task_notes on task_notes for select using (me() is not null);
create policy insert_own_notes on task_notes for insert with check (author_id = me());
create policy update_own_notes on task_notes for update
  using (author_id = me()) with check (author_id = me());
create policy delete_notes on task_notes for delete
  using (author_id = me() or my_role() = 'admin');

-- ---------- C. Pengingat pribadi ("ingatkan saya pada ...") ----------
-- Satu pengingat per tugas per orang; hanya bisa dilihat/diubah pemiliknya.
create table task_reminders (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks on delete cascade,
  employee_id uuid not null references employees default me(),
  remind_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (task_id, employee_id)
);

alter table task_reminders enable row level security;
create policy own_reminders on task_reminders for all
  using (employee_id = me()) with check (employee_id = me());

-- ---------- D. Notifikasi ----------
-- kind: reminder (pengingat sendiri), delegation (didelegasikan orang lain),
--       deadline (H-3, H-2, H-1 untuk tugas di mana saya PIC).
create table notifications (
  id          bigserial primary key,
  employee_id uuid not null references employees,        -- penerima
  kind        text not null check (kind in ('reminder', 'delegation', 'deadline')),
  task_id     uuid references tasks on delete cascade,
  title       text not null,
  actor_id    uuid references employees,                 -- pengirim (untuk delegasi)
  dedupe_key  text,                                      -- mencegah notifikasi ganda
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (employee_id, dedupe_key)
);
create index on notifications (employee_id, created_at desc);

alter table notifications enable row level security;
create policy read_own_notifications on notifications for select using (employee_id = me());
create policy update_own_notifications on notifications for update
  using (employee_id = me()) with check (employee_id = me());
-- Tidak ada izin insert langsung: notifikasi hanya dibuat oleh fungsi di bawah.

-- Dipanggil aplikasi setiap kali halaman dibuka: membuat notifikasi pengingat yang
-- sudah jatuh waktu dan deadline H-3/H-2/H-1 milik pengguna yang sedang login.
-- (Belum ada notifikasi push ke HP; itu menyusul saat deployment.)
create function sync_my_notifications() returns int
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

  return v_total;
end $$;

-- ---------- E. Delegasi: tambah sebagai PIC + notifikasi ----------
-- Yang boleh: PIC tugas itu, head departemen tugas, admin, CEO.
create function delegate_task(p_task uuid, p_employee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := me();
  v_task tasks;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_task from tasks where id = p_task;
  if not found then raise exception 'Tugas tidak ditemukan.'; end if;

  if not (my_role() in ('admin', 'ceo')
          or (my_role() = 'head' and v_task.dept_code = my_dept())
          or exists (select 1 from task_people
                      where task_id = p_task and employee_id = v_me and role = 'pic')) then
    raise exception 'Anda tidak berhak mendelegasikan tugas ini.';
  end if;
  if not exists (select 1 from employees where id = p_employee and is_active) then
    raise exception 'Karyawan tidak ditemukan atau sudah nonaktif.';
  end if;
  if exists (select 1 from task_people
              where task_id = p_task and employee_id = p_employee and role = 'pic') then
    raise exception 'Karyawan ini sudah menjadi PIC tugas ini.';
  end if;

  insert into task_people (task_id, employee_id, role) values (p_task, p_employee, 'pic');

  if p_employee <> v_me then
    insert into notifications (employee_id, kind, task_id, title, actor_id)
    values (p_employee, 'delegation', p_task, v_task.title, v_me);
  end if;
end $$;

-- ---------- F. Riwayat perubahan tugas (bisa dibaca semua karyawan) ----------
-- task_id sengaja tanpa relasi, supaya riwayat tetap ada setelah tugas dihapus.
create table task_history (
  id         bigserial primary key,
  task_id    uuid,
  task_code  text,
  task_title text,
  dept_code  text,
  action     text not null,  -- create, update, delete, add_person, remove_person
  changes    jsonb,          -- update: {kolom: [lama, baru]}; lainnya: data lengkap
  actor      uuid references employees,
  at         timestamptz not null default now()
);
create index on task_history (task_id);
create index on task_history (at desc);

alter table task_history enable row level security;
create policy read_task_history on task_history for select using (me() is not null);

create function log_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    insert into task_history (task_id, task_code, task_title, dept_code, action, changes, actor)
    values (new.id, new.code, new.title, new.dept_code, 'create', to_jsonb(new), me());
  elsif tg_op = 'DELETE' then
    insert into task_history (task_id, task_code, task_title, dept_code, action, changes, actor)
    values (old.id, old.code, old.title, old.dept_code, 'delete', to_jsonb(old), me());
  else
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
      into v_diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'updated_by');
    if v_diff is not null then
      insert into task_history (task_id, task_code, task_title, dept_code, action, changes, actor)
      values (new.id, new.code, new.title, new.dept_code, 'update', v_diff, me());
    end if;
  end if;
  return null;
end $$;

create trigger trg_task_history
after insert or update or delete on tasks
for each row execute function log_task_change();

create function log_task_people_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row  task_people := case when tg_op = 'INSERT' then new else old end;
  v_task tasks;
begin
  select * into v_task from tasks where id = v_row.task_id;
  if not found then return null; end if;  -- tugas sedang dihapus: sudah tercatat sebagai delete
  insert into task_history (task_id, task_code, task_title, dept_code, action, changes, actor)
  values (v_task.id, v_task.code, v_task.title, v_task.dept_code,
          case when tg_op = 'INSERT' then 'add_person' else 'remove_person' end,
          jsonb_build_object('employee_id', v_row.employee_id, 'role', v_row.role), me());
  return null;
end $$;

create trigger trg_task_people_history
after insert or delete on task_people
for each row execute function log_task_people_change();

-- ---------- G. Otomatis: updated_at/updated_by dan kode tugas ----------
create function touch_task() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(me(), new.updated_by);
  return new;
end $$;

create trigger trg_task_touch
before update on tasks
for each row execute function touch_task();

-- Tugas baru tanpa kode mendapat kode berikutnya per departemen, mis. CA-102.
create function set_task_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next int;
begin
  if new.code is null or trim(new.code) = '' then
    select coalesce(max((regexp_match(code, '^' || new.dept_code || '-(\d+)$'))[1]::int), 0) + 1
      into v_next
      from tasks
     where code like new.dept_code || '-%';
    new.code := new.dept_code || '-' || lpad(v_next::text, 2, '0');
  end if;
  return new;
end $$;

create trigger trg_task_code
before insert on tasks
for each row execute function set_task_code();
