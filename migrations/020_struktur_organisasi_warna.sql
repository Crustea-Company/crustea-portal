-- 020: Struktur Organisasi - warna kartu bisa diatur semua, nama pilar boleh kosong.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Hanya: (1) kolom baru org_units.colors, (2) nama pilar boleh kosong,
-- (3) fungsi simpan ikut menyimpan warna.
--
-- colors = warna tambahan per kartu, mis. {"bg": "#FFFFFF", "name": "#0F172A"}.
-- Kunci yang tidak diisi memakai warna bawaan (turunan warna utama `accent`).

alter table org_units add column colors jsonb not null default '{}';

-- Nama pilar kosong = kolom tanpa judul (untuk struktur tanpa pilar).
alter table org_pillars drop constraint if exists org_pillars_name_check;
alter table org_pillars alter column name set default '';

create or replace function save_org_structure(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  old_data jsonb := org_structure_json();
begin
  if not coalesce(is_admin_or_ceo(), false) then
    raise exception 'Hanya admin dan CEO yang boleh mengubah struktur organisasi.';
  end if;

  insert into org_pillars (id, name, sort_order)
  select x.id, coalesce(trim(x.name), ''), x.sort_order
    from jsonb_to_recordset(coalesce(p->'pillars', '[]')) as x(id uuid, name text, sort_order int)
  on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

  insert into org_units (dept_code, pillar_id, sort_order, display_name, accent, focus, colors)
  select x.dept_code, x.pillar_id, x.sort_order, trim(x.display_name), upper(x.accent), coalesce(trim(x.focus), ''),
         coalesce(x.colors, '{}')
    from jsonb_to_recordset(coalesce(p->'units', '[]'))
         as x(dept_code text, pillar_id uuid, sort_order int, display_name text, accent text, focus text, colors jsonb)
  on conflict (dept_code) do update set
    pillar_id = excluded.pillar_id, sort_order = excluded.sort_order, display_name = excluded.display_name,
    accent = excluded.accent, focus = excluded.focus, colors = excluded.colors;

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
