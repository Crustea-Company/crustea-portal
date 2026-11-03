-- Sekali jalan (2 Nov 2026, diminta Athar): setelah pemulihan muncul 6 kolom Struktur Organisasi.
-- Hapus HANYA kolom yang tidak berisi departemen, lalu urutkan ulang sisanya 1, 2, 3.
-- Kolom yang berisi departemen tidak disentuh. Tercatat di Admin > Riwayat perubahan.
-- Jalankan SEKALI di Supabase: SQL Editor > New query > tempel > Run.

begin;

create temp table _old on commit drop as select org_structure_json() as data;

delete from org_pillars p
 where not exists (select 1 from org_units u where u.pillar_id = p.id);

update org_pillars p
   set sort_order = r.n
  from (select id, row_number() over (order by sort_order, id) as n from org_pillars) r
 where r.id = p.id;

insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
select 'org_structure', 'struktur', 'org_update', _old.data, org_structure_json(),
       (select id from employees where email = 'rafi.niffarii@gmail.com')
  from _old;

commit;

-- Periksa hasilnya (harus 3 kolom, masing-masing 2 departemen):
select p.sort_order as kolom, p.name as judul, string_agg(u.display_name, ', ' order by u.sort_order) as departemen
  from org_pillars p left join org_units u on u.pillar_id = p.id
 group by p.id, p.sort_order, p.name
 order by p.sort_order;
