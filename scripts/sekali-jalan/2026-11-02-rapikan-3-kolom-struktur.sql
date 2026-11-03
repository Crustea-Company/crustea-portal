-- Sekali jalan (2 Nov 2026, diminta Athar): rapikan Struktur Organisasi menjadi tepat 3 kolom,
-- apa pun keadaannya sekarang (menggantikan dua skrip pemulihan sebelumnya).
--   Kolom 1: Corporate Affairs, Finance & Accounting
--   Kolom 2: Business Development & Sales, Digital Marketing
--   Kolom 3: Aquaculture, Technology Operations
-- Judul kolom yang sudah ada dipertahankan; kolom yang kurang dibuat tanpa judul.
-- Kolom selebihnya dihapus hanya bila kosong. Nama tampilan, warna, fokus, pemimpin kartu tidak diubah.
-- Jalankan SEKALI di Supabase: SQL Editor > New query > tempel > Run (pilih "Run without RLS").
-- PENTING: tutup/muat ulang halaman Struktur Organisasi sebelum menekan Ubah struktur lagi.

begin;

create temp table _old on commit drop as select org_structure_json() as data;

do $$
declare
  cols uuid[];
begin
  -- Pastikan ada minimal 3 kolom.
  while (select count(*) from org_pillars) < 3 loop
    insert into org_pillars (name, sort_order) values ('', 1000 + (select count(*) from org_pillars));
  end loop;

  select array_agg(id order by sort_order, id) into cols from org_pillars;

  update org_units u
     set pillar_id = cols[x.col], sort_order = x.ord
    from (values ('CA', 1, 1), ('FA', 1, 2), ('BDS', 2, 1), ('DM', 2, 2), ('AQ', 3, 1), ('TO', 3, 2)) as x(dept, col, ord)
   where u.dept_code = x.dept;

  -- Kolom ke-4 dst. dihapus bila kosong.
  delete from org_pillars p
   where p.id <> all (cols[1:3])
     and not exists (select 1 from org_units u where u.pillar_id = p.id);

  update org_pillars p
     set sort_order = r.n
    from (select id, row_number() over (order by sort_order, id) as n from org_pillars) r
   where r.id = p.id;
end $$;

insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
select 'org_structure', 'struktur', 'org_update', _old.data, org_structure_json(),
       (select id from employees where email = 'rafi.niffarii@gmail.com')
  from _old;

commit;

-- Periksa hasilnya (harus 3 baris, masing-masing 2 departemen):
select p.sort_order as kolom, p.name as judul, string_agg(u.display_name, ', ' order by u.sort_order) as departemen
  from org_pillars p left join org_units u on u.pillar_id = p.id
 group by p.id, p.sort_order, p.name
 order by p.sort_order;
