-- Sekali jalan (2 Nov 2026, diminta Athar): pulihkan kolom Struktur Organisasi yang terhapus tidak sengaja.
-- Jalankan SEKALI di Supabase: SQL Editor > New query > tempel > Run.
--
-- Membuat 3 kolom baru TANPA judul (Crustea tidak memakai pilar; judul bisa diisi lagi lewat Ubah struktur),
-- lalu mengembalikan tiap departemen ke kolom & urutan semula:
--   Kolom 1: Corporate Affairs, Finance & Accounting
--   Kolom 2: Business Development & Sales, Digital Marketing
--   Kolom 3: Aquaculture, Technology Operations
-- Nama tampilan, warna, fokus kerja, dan pemimpin kartu tidak diubah (masih tersimpan).
-- Tidak menghapus apa pun. Tercatat di Admin > Riwayat perubahan.

begin;

create temp table _old on commit drop as select org_structure_json() as data;

with p as (
  insert into org_pillars (name, sort_order) values ('', 1), ('', 2), ('', 3)
  returning id, sort_order
)
update org_units u
   set pillar_id = p.id, sort_order = x.ord
  from (values ('CA', 1, 1), ('FA', 1, 2), ('BDS', 2, 1), ('DM', 2, 2), ('AQ', 3, 1), ('TO', 3, 2)) as x(dept, col, ord)
  join p on p.sort_order = x.col
 where u.dept_code = x.dept;

insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
select 'org_structure', 'struktur', 'org_update', _old.data, org_structure_json(),
       (select id from employees where email = 'rafi.niffarii@gmail.com')
  from _old;

commit;

-- Periksa hasilnya (harus 6 baris, semuanya punya kolom):
select u.dept_code, u.display_name, p.sort_order as kolom, u.sort_order as urutan
  from org_units u left join org_pillars p on p.id = u.pillar_id
 where u.dept_code in ('CA', 'FA', 'BDS', 'DM', 'AQ', 'TO')
 order by p.sort_order, u.sort_order;
