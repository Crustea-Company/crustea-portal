-- 017: Percepat aturan akses (RLS). Tidak mengubah siapa boleh melihat/mengubah apa, tidak menghapus data.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run (aman bila tidak sengaja dijalankan dua kali).
--
-- Masalah: aturan seperti "me() is not null" dijalankan ulang untuk SETIAP baris (mis. halaman Tugas:
-- ~1.600 kali per permintaan), padahal hasilnya sama untuk satu permintaan. Diukur 28 Okt 2026:
-- daftar tugas butuh ~1,1 detik, permintaan kecil ~0,22 detik.
-- Perbaikan (saran resmi Supabase): bungkus fungsi tanpa argumen menjadi "(select me())" supaya
-- database menghitungnya sekali per permintaan. Fungsi dengan argumen (mis. per tugas) tidak diubah.

do $$
declare
  p record;
  fns constant text := 'me|my_role|my_dept|is_admin_or_ceo|is_aqua_editor|is_aqua_manager|is_fa_head|'
                    || 'is_request_reviewer|is_sales_manager|is_techops|is_travel_hr|can_record_revenue';
  pattern text := '(?<!SELECT )\m(' || fns || ')\(\)';
  q text;
  c text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
  loop
    q := regexp_replace(p.qual, pattern, '(SELECT \1())', 'g');
    c := regexp_replace(p.with_check, pattern, '(SELECT \1())', 'g');
    if q is distinct from p.qual or c is distinct from p.with_check then
      execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
           || case when q is distinct from p.qual then format(' using (%s)', q) else '' end
           || case when c is distinct from p.with_check then format(' with check (%s)', c) else '' end;
      n := n + 1;
    end if;
  end loop;
  raise notice 'Aturan akses yang dipercepat: %', n;
end $$;
