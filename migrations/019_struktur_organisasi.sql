-- 019: Struktur Organisasi (halaman /struktur-organisasi). Spesifikasi: docs/fase-2-3/11-struktur-organisasi.md
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Hanya menambah 3 tabel baru + 1 fungsi simpan. Tidak mengubah atau menghapus data yang sudah ada.
--
-- - Anggota tiap kartu diambil langsung dari tabel employees (karyawan aktif, per departemen).
-- - Yang disimpan di sini hanya pengaturan tampilan: pilar, kartu departemen, dan orang khusus
--   (anggota Board yang memimpin kartu lain + jabatan tampilan).
-- - Semua karyawan aktif boleh melihat; hanya admin dan CEO yang boleh mengubah.
-- - Setiap simpan tercatat di audit_log (Admin > Riwayat perubahan).

-- Pilar di bawah CEO (mis. Corporate Support).
create table org_pillars (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  sort_order int  not null default 0
);

-- Kartu departemen. pillar_id kosong = departemen tidak ditampilkan sebagai kartu.
create table org_units (
  dept_code    text primary key references departments,
  pillar_id    uuid references org_pillars on delete set null,
  sort_order   int  not null default 0,
  display_name text not null check (length(trim(display_name)) > 0),
  accent       text not null default '#0F766E' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  focus        text not null default ''
);

-- Orang khusus: lead_dept = memimpin kartu departemen itu (tampil paling atas, walau departemen
-- aslinya lain, mis. CTO). display_title = jabatan yang ditampilkan menggantikan job_title.
create table org_people (
  employee_id   uuid primary key references employees on delete cascade,
  lead_dept     text references org_units on delete set null,
  display_title text
);

alter table org_pillars enable row level security;
alter table org_units   enable row level security;
alter table org_people  enable row level security;

create policy read_org_pillars on org_pillars for select using ((select me()) is not null);
create policy read_org_units   on org_units   for select using ((select me()) is not null);
create policy read_org_people  on org_people  for select using ((select me()) is not null);
create policy edit_org_pillars on org_pillars for all
  using ((select is_admin_or_ceo())) with check ((select is_admin_or_ceo()));
create policy edit_org_units on org_units for all
  using ((select is_admin_or_ceo())) with check ((select is_admin_or_ceo()));
create policy edit_org_people on org_people for all
  using ((select is_admin_or_ceo())) with check ((select is_admin_or_ceo()));

-- Seluruh pengaturan dalam satu jsonb (dipakai untuk audit_log).
create function org_structure_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pillars', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order) from org_pillars p), '[]'),
    'units',   coalesce((select jsonb_agg(to_jsonb(u) order by u.dept_code) from org_units u), '[]'),
    'people',  coalesce((select jsonb_agg(to_jsonb(o) order by o.employee_id) from org_people o), '[]'))
$$;

-- Simpan seluruh struktur sekaligus (satu transaksi). p = {pillars: [...], units: [...], people: [...]}
-- Pilar/kartu/orang yang tidak ada di p dihapus.
create function save_org_structure(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  old_data jsonb := org_structure_json();
begin
  if not coalesce(is_admin_or_ceo(), false) then
    raise exception 'Hanya admin dan CEO yang boleh mengubah struktur organisasi.';
  end if;

  insert into org_pillars (id, name, sort_order)
  select x.id, trim(x.name), x.sort_order
    from jsonb_to_recordset(coalesce(p->'pillars', '[]')) as x(id uuid, name text, sort_order int)
  on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

  insert into org_units (dept_code, pillar_id, sort_order, display_name, accent, focus)
  select x.dept_code, x.pillar_id, x.sort_order, trim(x.display_name), upper(x.accent), coalesce(trim(x.focus), '')
    from jsonb_to_recordset(coalesce(p->'units', '[]'))
         as x(dept_code text, pillar_id uuid, sort_order int, display_name text, accent text, focus text)
  on conflict (dept_code) do update set
    pillar_id = excluded.pillar_id, sort_order = excluded.sort_order, display_name = excluded.display_name,
    accent = excluded.accent, focus = excluded.focus;

  delete from org_pillars
   where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'pillars', '[]')) x);
  delete from org_units
   where dept_code not in (select x->>'dept_code' from jsonb_array_elements(coalesce(p->'units', '[]')) x);

  delete from org_people where true;
  insert into org_people (employee_id, lead_dept, display_title)
  select x.employee_id, nullif(x.lead_dept, ''), nullif(trim(x.display_title), '')
    from jsonb_to_recordset(coalesce(p->'people', '[]')) as x(employee_id uuid, lead_dept text, display_title text)
   where nullif(x.lead_dept, '') is not null or nullif(trim(x.display_title), '') is not null;

  insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
  values ('org_structure', 'struktur', 'org_update', old_data, org_structure_json(), me());
end $$;

revoke execute on function save_org_structure(jsonb) from public, anon;
revoke execute on function org_structure_json() from public, anon;
grant execute on function save_org_structure(jsonb) to authenticated;
grant execute on function org_structure_json() to authenticated;

-- Isi awal = pengaturan skrip build_org_chart_v2.py.
with p as (
  insert into org_pillars (name, sort_order) values
    ('Corporate Support', 1), ('Growth & Marketing', 2), ('Operations & Technology', 3)
  returning id, name
)
insert into org_units (dept_code, pillar_id, sort_order, display_name, accent, focus)
select u.dept_code, p.id, u.sort_order, u.display_name, u.accent, u.focus
  from (values
    ('CA',  'Corporate Support',       1, 'Corporate Affairs',            '#0A8C8C', 'HR & rekrutmen · legal & kontrak · perjalanan dinas · cuti'),
    ('FA',  'Corporate Support',       2, 'Finance & Accounting',         '#2F6DB5', 'Pengadaan · pembayaran · reimbursement · aset · penagihan'),
    ('BDS', 'Growth & Marketing',      1, 'Business Dev. & Sales',        '#E0762B', 'Penjualan teknologi · proyek, CSR & grant · kemitraan'),
    ('DM',  'Growth & Marketing',      2, 'Digital Marketing & Content',  '#C2417A', 'Konten digital · kampanye · lead untuk sales'),
    ('AQ',  'Operations & Technology', 1, 'Aquaculture',                  '#3E9B5F', 'Budidaya · pendampingan petambak · data budidaya'),
    ('TO',  'Operations & Technology', 2, 'Technology Operations',        '#6B5BA8', 'Produk & software · instalasi · after-sales · stok')
  ) as u(dept_code, pillar, sort_order, display_name, accent, focus)
  join p on p.name = u.pillar;

-- CTO memimpin kartu Technology Operations (BOARD_LEADS di skrip).
insert into org_people (employee_id, lead_dept)
select id, 'TO' from employees
 where is_active and (job_title ~* '\mCTO\M' or job_title ilike '%chief technology officer%')
 limit 1;
