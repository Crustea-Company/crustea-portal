-- 029: Program & Prioritas: program lintas tim (mis. Komdigi Pendampingan Online, P4G Jawa Barat: CB & WE,
-- P4G Deployment Lampung) dengan prioritas, PIC + peran, laporan status, timeline (milestone), dan tugas terkait.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak mengubah data lain.
--
-- Hak akses:
-- - Semua karyawan melihat semua program.
-- - Pengatur prioritas (buat program, ubah prioritas & urutan): admin, CEO, CTO (head TO), CMO (head BDS).
-- - Ketua program (is_lead) boleh mengubah isi programnya (kecuali prioritas) dan anggotanya.
-- - Anggota program + pengatur prioritas: tambah/centang milestone, tulis laporan status (anggota dikabari).
-- - Tugas bisa dikaitkan ke program (tasks.program_id); aturan ubah tugas tidak berubah.

create function can_prioritize() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('admin', 'ceo') or (my_role() = 'head' and my_dept() in ('TO', 'BDS')), false)
$$;

create table programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  priority    int not null default 2 check (priority between 1 and 3),   -- 1 Tinggi, 2 Sedang, 3 Rendah
  sort        int not null default 0,                                   -- urutan di dalam prioritas
  status      text not null default 'active' check (status in ('planned', 'active', 'on_hold', 'done', 'cancelled')),
  health      text not null default 'on_track' check (health in ('on_track', 'at_risk', 'off_track')),
  start_date  date,
  end_date    date check (end_date is null or start_date is null or end_date >= start_date),
  created_by  uuid references employees default me(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table program_people (
  program_id  uuid not null references programs on delete cascade,
  employee_id uuid not null references employees,
  role        text,                               -- mis. "WE", "CB", "Logistik"
  is_lead     boolean not null default false,
  primary key (program_id, employee_id)
);

create table program_milestones (
  id         bigserial primary key,
  program_id uuid not null references programs on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  due_date   date,
  pic_id     uuid references employees,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on program_milestones (program_id, due_date);

create table program_updates (
  id         bigserial primary key,
  program_id uuid not null references programs on delete cascade,
  author_id  uuid not null references employees default me(),
  health     text not null check (health in ('on_track', 'at_risk', 'off_track')),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index on program_updates (program_id, created_at desc);

alter table tasks add column program_id uuid references programs on delete set null;
create index on tasks (program_id);

-- Pembantu (security definer: tidak memicu aturan akses tabel lain, menghindari rekursi).
create function is_program_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_people where program_id = p and employee_id = me())
$$;
create function is_program_lead(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_people where program_id = p and employee_id = me() and is_lead)
$$;

-- Prioritas & urutan hanya oleh pengatur prioritas; updated_at otomatis.
create function prepare_program() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and tg_op = 'UPDATE'
     and (new.priority, new.sort) is distinct from (old.priority, old.sort) and not can_prioritize() then
    raise exception 'Prioritas hanya bisa diubah admin, CEO, CTO, dan CMO.';
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end $$;
create trigger trg_program_prepare before insert or update on programs for each row execute function prepare_program();

-- Laporan status: kondisi program ikut diperbarui, anggota dikabari.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset', 'aqua', 'feedback', 'comment', 'program'));

create function after_program_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  update programs set health = new.health where id = new.program_id returning name into v_name;
  perform notify_people(array(select employee_id from program_people where program_id = new.program_id), 'program',
    'Laporan status: ' || v_name, '/program/' || new.program_id);
  return null;
end $$;
create trigger trg_program_update_after after insert on program_updates for each row execute function after_program_update();

alter table programs           enable row level security;
alter table program_people     enable row level security;
alter table program_milestones enable row level security;
alter table program_updates    enable row level security;

create policy read_programs on programs for select using ((select me()) is not null);
create policy insert_programs on programs for insert with check ((select can_prioritize()));
create policy update_programs on programs for update
  using ((select can_prioritize()) or is_program_lead(id)) with check ((select can_prioritize()) or is_program_lead(id));
create policy delete_programs on programs for delete using ((select can_prioritize()));

create policy read_program_people on program_people for select using ((select me()) is not null);
create policy write_program_people on program_people for all
  using ((select can_prioritize()) or is_program_lead(program_id))
  with check ((select can_prioritize()) or is_program_lead(program_id));

create policy read_program_milestones on program_milestones for select using ((select me()) is not null);
create policy write_program_milestones on program_milestones for all
  using ((select can_prioritize()) or is_program_member(program_id))
  with check ((select can_prioritize()) or is_program_member(program_id));

create policy read_program_updates on program_updates for select using ((select me()) is not null);
create policy insert_program_updates on program_updates for insert
  with check (author_id = (select me()) and ((select can_prioritize()) or is_program_member(program_id)));
