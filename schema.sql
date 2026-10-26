-- =====================================================================
-- Crustea Portal - Skema database Fase 1 (+ tabel KPI untuk impor awal)
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- =====================================================================

-- ---------- Tipe data ----------
create type emp_status  as enum ('PKWTT','PKWT','INTERN');
create type app_role    as enum ('admin','ceo','head','staff');
create type task_status as enum ('not_started','on_going','done');

-- ---------- Master ----------
create table departments (
  code text primary key,
  name text not null
);

create table employees (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  full_name    text not null,
  dept_code    text references departments,
  job_title    text,
  emp_status   emp_status not null,
  app_role     app_role not null default 'staff',
  ats_required boolean not null default true,   -- CEO, CTO, Head of CA = false
  is_active    boolean not null default true,
  left_at      date
);

create table employee_aliases (
  alias       text primary key,
  employee_id uuid not null references employees
);

-- Jam kerja mingguan: PKWTT 40, PKWT 20, Intern 20. Ekspektasi bulanan = x4.
create function weekly_hours(s emp_status) returns int
language sql immutable as $$
  select case s when 'PKWTT' then 40 else 20 end
$$;

-- ---------- To-do & Sprint ----------
create table sprints (
  id         int primary key,
  name       text not null,
  start_date date,
  end_date   date,
  focus      text
);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  dept_code   text not null references departments,
  title       text not null,
  workstream  text,
  output      text,
  status      task_status not null default 'not_started',
  start_date  date,
  deadline    date,
  is_priority boolean not null default false,
  sprint_id   int references sprints,
  source      text,
  notes       text,
  sop_codes   text[],
  updated_by  uuid references employees,
  updated_at  timestamptz not null default now()
);

create table task_people (
  task_id     uuid references tasks on delete cascade,
  employee_id uuid references employees,
  role        text not null check (role in ('pic','support')),
  primary key (task_id, employee_id, role)
);

-- ---------- ATS (log kerja harian) ----------
create table periods (
  period_month date primary key,          -- tgl 1 bulan periode
  locked_at    timestamptz,
  locked_by    uuid references employees
);

create table work_logs (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees,
  log_date      date not null,
  activity      text not null,
  minutes       int  not null check (minutes > 0),
  proof         text,
  period_month  date not null,
  is_correction boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on work_logs (employee_id, period_month);

create table period_snapshots (
  employee_id    uuid references employees,
  period_month   date references periods,
  emp_status     emp_status not null,
  total_hours    numeric,                  -- boleh kosong untuk data impor
  expected_hours numeric,                  -- boleh kosong untuk data impor
  achievement    numeric not null,         -- 1.0 = 100%
  source         text not null default 'app',  -- 'import' untuk Jul-Sep 2026
  locked_at      timestamptz not null default now(),
  primary key (employee_id, period_month)
);

-- Periode = tgl 29 bulan sebelumnya s.d. tgl 28. Tgl > 28 masuk bulan berikutnya.
create function period_of(d date) returns date
language sql immutable as $$
  select (make_date(extract(year from d)::int, extract(month from d)::int, 1)
          + case when extract(day from d) > 28
                 then interval '1 month' else interval '0' end)::date
$$;

create function set_work_log_period() returns trigger
language plpgsql as $$
begin
  new.period_month := period_of(new.log_date);
  if exists (select 1 from periods p
             where p.period_month = new.period_month and p.locked_at is not null) then
    new.is_correction := true;
  end if;
  return new;
end $$;

create trigger trg_work_log_period
before insert or update of log_date on work_logs
for each row execute function set_work_log_period();

-- ---------- KPI (dipakai penuh di Fase 2, tabel dibuat sekarang untuk impor) ----------
create table kpi_items (
  id             serial primary key,
  objective_code text not null,            -- mis. 'BDS-A.1'
  objective      text not null,
  dept_code      text not null references departments,
  item           text not null,
  pic_type       text not null check (pic_type in ('person','department')),
  pic_id         uuid references employees,
  target_value   numeric,
  target_unit    text,
  target_period  text,                     -- 'quarter' atau kosong
  target_weeks   text,                     -- mis. '9-W1;9-W2' (bulan-minggu)
  is_done        boolean not null default false,
  realization_note text
);

-- ---------- Audit ----------
create table audit_log (
  id         bigserial primary key,
  table_name text,
  row_id     text,
  action     text,
  old_data   jsonb,
  new_data   jsonb,
  actor      uuid,
  at         timestamptz not null default now()
);

-- Periode Jul-Sep 2026 sudah dikunci (nilai statis dari sheet)
insert into periods (period_month, locked_at) values
  ('2026-07-01', now()), ('2026-08-01', now()), ('2026-09-01', now());

-- =====================================================================
-- Keamanan (Row Level Security)
-- =====================================================================
create function me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees
  where lower(email) = lower(auth.jwt() ->> 'email') and is_active
$$;

create function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select app_role from employees where id = me()
$$;

create function my_dept() returns text
language sql stable security definer set search_path = public as $$
  select dept_code from employees where id = me()
$$;

create function is_admin_or_ceo() returns boolean
language sql stable as $$ select my_role() in ('admin','ceo') $$;

alter table departments      enable row level security;
alter table employees        enable row level security;
alter table employee_aliases enable row level security;
alter table sprints          enable row level security;
alter table tasks            enable row level security;
alter table task_people      enable row level security;
alter table periods          enable row level security;
alter table work_logs        enable row level security;
alter table period_snapshots enable row level security;
alter table kpi_items        enable row level security;
alter table audit_log        enable row level security;

-- Data referensi: semua karyawan aktif boleh baca, hanya admin yang ubah
create policy read_departments on departments for select using (me() is not null);
create policy admin_departments on departments for all using (my_role() = 'admin') with check (my_role() = 'admin');

create policy read_employees on employees for select using (me() is not null);
create policy admin_employees on employees for all using (my_role() = 'admin') with check (my_role() = 'admin');

create policy read_aliases on employee_aliases for select using (me() is not null);
create policy admin_aliases on employee_aliases for all using (my_role() = 'admin') with check (my_role() = 'admin');

create policy read_sprints on sprints for select using (me() is not null);
create policy admin_sprints on sprints for all using (my_role() = 'admin') with check (my_role() = 'admin');

create policy read_periods on periods for select using (me() is not null);
create policy admin_periods on periods for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- To-do: transparan untuk semua karyawan
create policy read_tasks on tasks for select using (me() is not null);
create policy insert_tasks on tasks for insert with check (
  my_role() in ('admin','ceo') or dept_code = my_dept()
);
create policy update_tasks on tasks for update using (
  my_role() in ('admin','ceo')
  or (my_role() = 'head' and dept_code = my_dept())
  or exists (select 1 from task_people tp
             where tp.task_id = tasks.id and tp.employee_id = me() and tp.role = 'pic')
);
create policy delete_tasks on tasks for delete using (
  my_role() = 'admin' or (my_role() = 'head' and dept_code = my_dept())
);

create policy read_task_people on task_people for select using (me() is not null);
create policy write_task_people on task_people for all using (
  my_role() in ('admin','ceo')
  or exists (select 1 from tasks t where t.id = task_people.task_id
             and (t.dept_code = my_dept()))
) with check (
  my_role() in ('admin','ceo')
  or exists (select 1 from tasks t where t.id = task_people.task_id
             and (t.dept_code = my_dept()))
);

-- ATS: hanya pemilik, head departemennya, admin, dan CEO
create policy read_work_logs on work_logs for select using (
  employee_id = me()
  or is_admin_or_ceo()
  or (my_role() = 'head' and exists (select 1 from employees e
        where e.id = work_logs.employee_id and e.dept_code = my_dept()))
);
create policy insert_own_logs on work_logs for insert with check (employee_id = me());
create policy update_own_logs on work_logs for update using (
  employee_id = me() and not exists (select 1 from periods p
    where p.period_month = work_logs.period_month and p.locked_at is not null)
);
create policy delete_own_logs on work_logs for delete using (
  employee_id = me() and not exists (select 1 from periods p
    where p.period_month = work_logs.period_month and p.locked_at is not null)
);

create policy read_snapshots on period_snapshots for select using (
  employee_id = me()
  or is_admin_or_ceo()
  or (my_role() = 'head' and exists (select 1 from employees e
        where e.id = period_snapshots.employee_id and e.dept_code = my_dept()))
);
create policy admin_snapshots on period_snapshots for all
  using (my_role() = 'admin') with check (my_role() = 'admin');

create policy read_kpi on kpi_items for select using (me() is not null);
create policy write_kpi on kpi_items for all using (
  my_role() in ('admin','ceo') or (my_role() = 'head' and dept_code = my_dept())
) with check (
  my_role() in ('admin','ceo') or (my_role() = 'head' and dept_code = my_dept())
);

create policy admin_audit on audit_log for select using (is_admin_or_ceo());
