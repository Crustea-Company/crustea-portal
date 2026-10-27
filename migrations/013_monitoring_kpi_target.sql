-- 013: Monitoring KPI + target kuartal per divisi.
-- Lihat docs/fase-2-3/08-monitoring-kpi-target.md. Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Isi kpi_items (223 baris) tidak berubah; hanya ditambah kolom "terakhir diubah".
--
-- Realisasi target = pendapatan berstatus LUNAS (PAID), dihitung pada bulan lunasnya:
--   * otomatis dari modul Penjualan: sales_leads yang sudah closing dan lunas (paid_on), masuk ke sumber
--     target yang ditandai from_sales (Penjualan Teknologi);
--   * manual dari tabel revenues (proyek, trading, grant, dll.), dicatat F&A / admin / CEO.
-- Kuartal target = kuartal kalender (Q4 = Okt-Des), berbeda dengan kuartal ATS (periode 29-28).

-- ---------- A. KPI: centang selesai & catatan realisasi ----------
alter table kpi_items add column updated_at timestamptz;
alter table kpi_items add column updated_by uuid references employees;

-- Boleh mengubah item KPI: PIC item (orangnya, atau anggota departemen bila PIC = departemen),
-- head departemen item, admin, CEO.
create function can_edit_kpi(p_dept text, p_pic_type text, p_pic_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    my_role() in ('admin', 'ceo')
    or (my_role() = 'head' and my_dept() = p_dept)
    or (p_pic_type = 'person' and p_pic_id = me())
    or (p_pic_type = 'department' and my_dept() = p_dept),
  false)
$$;

-- Satu-satunya jalan bagi PIC (bukan head) untuk mengubah item: hanya status selesai & catatan realisasi.
create function update_kpi_item(p_id int, p_is_done boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v kpi_items;
begin
  select * into v from kpi_items where id = p_id;
  if v.id is null then
    raise exception 'Item KPI tidak ditemukan.';
  end if;
  if not can_edit_kpi(v.dept_code, v.pic_type, v.pic_id) then
    raise exception 'Anda tidak berhak mengubah item KPI ini.';
  end if;
  update kpi_items
     set is_done = coalesce(p_is_done, is_done),
         realization_note = nullif(trim(coalesce(p_note, '')), ''),
         updated_at = now(),
         updated_by = me()
   where id = p_id;
end $$;
revoke execute on function update_kpi_item(int, boolean, text) from public, anon;
grant execute on function update_kpi_item(int, boolean, text) to authenticated;

-- ---------- B. Target kuartal ----------
create table quarter_targets (
  id       serial primary key,
  year     int not null check (year between 2024 and 2100),
  quarter  int not null check (quarter between 1 and 4),
  total    bigint not null check (total >= 0),             -- target total kuartal (Rp)
  notes    text,
  unique (year, quarter)
);

-- Sumber pendapatan: bobot (%) x total = target alokasi. Bobot kosong = tanpa target (hanya proyeksi).
create table target_sources (
  id          serial primary key,
  target_id   int not null references quarter_targets on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  division    text not null check (length(trim(division)) > 0),   -- divisi PIC, mis. 'Bisdev'
  weight      numeric(5, 2) check (weight between 0 and 100),
  alloc_label text not null check (length(trim(alloc_label)) > 0), -- label alokasi pendapatan
  from_sales  boolean not null default false,                      -- realisasi otomatis dari modul Penjualan
  sort        int not null default 0,
  unique (target_id, alloc_label)
);
create unique index on target_sources (target_id) where from_sales;

create table target_strategies (
  id         serial primary key,
  source_id  int not null references target_sources on delete cascade,
  strategy   text not null check (length(trim(strategy)) > 0),
  projection bigint not null default 0 check (projection >= 0),
  sort       int not null default 0
);

-- Pendapatan di luar modul Penjualan. alokasi kosong / tidak cocok = "Alokasi lain / belum dipilih".
create table revenues (
  id           uuid primary key default gen_random_uuid(),
  revenue_date date not null,
  amount       bigint not null check (amount > 0),
  allocation   text,
  status       text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  description  text not null check (length(trim(description)) > 0),
  created_by   uuid references employees default me(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on revenues (revenue_date);

create function touch_revenue() returns trigger
language plpgsql as $$
begin
  new.allocation := nullif(trim(coalesce(new.allocation, '')), '');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger trg_revenue_touch before insert or update on revenues
for each row execute function touch_revenue();

-- Pencatat pendapatan: F&A, admin, CEO. Pengelola target: admin, CEO.
create function can_record_revenue() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('admin', 'ceo') or my_dept() = 'FA', false)
$$;

alter table quarter_targets   enable row level security;
alter table target_sources    enable row level security;
alter table target_strategies enable row level security;
alter table revenues          enable row level security;

-- Semua karyawan melihat target & realisasi (transparansi, sama seperti pipeline penjualan).
create policy read_quarter_targets on quarter_targets for select using (me() is not null);
create policy admin_quarter_targets on quarter_targets for all
  using (is_admin_or_ceo()) with check (is_admin_or_ceo());
create policy read_target_sources on target_sources for select using (me() is not null);
create policy admin_target_sources on target_sources for all
  using (is_admin_or_ceo()) with check (is_admin_or_ceo());
create policy read_target_strategies on target_strategies for select using (me() is not null);
create policy admin_target_strategies on target_strategies for all
  using (is_admin_or_ceo()) with check (is_admin_or_ceo());
create policy read_revenues on revenues for select using (me() is not null);
create policy write_revenues on revenues for all
  using (can_record_revenue()) with check (can_record_revenue());

-- ---------- C. Data awal: target Q4 2026 (MONITORING TARGET 1,5 JUTA USD) ----------
insert into quarter_targets (year, quarter, total, notes)
values (2026, 4, 4000000000, 'Dari file MONITORING TARGET 1,5 JUTA USD');

insert into target_sources (target_id, name, division, weight, alloc_label, from_sales, sort)
select t.id, s.name, s.division, s.weight, s.name, s.from_sales, s.sort
  from quarter_targets t,
       (values ('Penjualan Teknologi',    'Bisdev',             55::numeric, true,  1),
               ('Aquagrowth Project',     'Aquaculture',        20,          false, 2),
               ('Trading Ikan dan Udang', 'Aquaculture',        8,           false, 3),
               ('Open Project',           'Teknologi & Bisdev', 15,          false, 4),
               ('Grant / Sumber Lain',    'Bisdev',             2,           false, 5),
               ('Krasty Food',            'Bisdev',             null,        false, 6))
       as s(name, division, weight, from_sales, sort)
 where t.year = 2026 and t.quarter = 4;

-- Proyeksi strategi diimpor sebagai satu baris per sumber; admin bisa memecahnya per strategi.
insert into target_strategies (source_id, strategy, projection)
select s.id, 'Proyeksi awal (dari Excel)', p.projection
  from target_sources s
  join quarter_targets t on t.id = s.target_id and t.year = 2026 and t.quarter = 4
  join (values ('Penjualan Teknologi',    2299000000::bigint),
               ('Aquagrowth Project',     8300000000),
               ('Trading Ikan dan Udang', 650000000),
               ('Open Project',           600000000),
               ('Grant / Sumber Lain',    500000000),
               ('Krasty Food',            50000000)) as p(name, projection)
    on p.name = s.name;
