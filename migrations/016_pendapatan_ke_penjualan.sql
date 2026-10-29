-- 016: Hubungkan pendapatan (Target kuartal) dengan penjualan di pipeline (modul Penjualan).
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- Masalah yang diperbaiki: penjualan yang sudah Lunas di pipeline DAN tercatat di pendapatan terhitung dua kali
-- di realisasi target. Mulai sekarang:
--   * pendapatan boleh ditautkan ke satu atau beberapa lead (tabel revenue_leads);
--   * lead yang punya pendapatan tertaut TIDAK dihitung lagi dari nilai lead-nya; yang dihitung adalah uang
--     yang benar-benar masuk (pendapatan, pada tanggalnya). Lead lunas tanpa tautan tetap dihitung seperti biasa.
--
-- Data (dari file "MONITORING TARGET 1,5 JUTA USD - Revenue Updated" + "Sebaran Teknologi Crustea", 29 Okt 2026):
--   semua 42 baris pendapatan di file sudah ada sejak migrasi 014, jadi tidak ada pendapatan baru.
--   Pendapatan "Penjualan Teknologi" ditautkan ke lead hasil impor Pipeline Order:
--     PT Ghana Utamadi Dhuniara 30 Apr (Rp69.925.000)   -> Pak Moel: Brush 6 unit + Mini 12 unit
--     Pak Made Bali 27 Apr (Rp6.695.500)                  -> Made Adnyana: Brush 1 unit
--     DP 2 mini aerator 7 Jun + Sodikin 11 Jul            -> Pak Sodikin: Mini 2 unit (lunas 11 Jul)
--     Gracielia 29 Jun (Rp12.564.000)                     -> Gracielia: Mini 4 unit
--   Lead baru untuk penjualan yang belum ada di pipeline:
--     Cicilan Rozikin 23 Apr (Mini aerator) · PT Royal Korindah 21 Mei (DP PLTS) · Rizhar Eman 30 Jul + 19 Agu.
--   Tanggal lunas lead disamakan dengan tanggal pembayaran terakhir; lokasi diisi dari Sebaran Teknologi.
--   INDERAAGRI "Refund apps" (Rp1.400.000) bukan penjualan alat: tidak ditautkan.
--   KOMDIGI: tercatat BIMTEK 22 Jun (Rp171.424.589) dan DP 30% 7 Jul (Rp244.122.677) sebagai Open Project/CSR.

-- ---------- A. Tabel tautan pendapatan <-> lead ----------
create table revenue_leads (
  revenue_id uuid not null references revenues on delete cascade,
  lead_id    uuid not null references sales_leads on delete cascade,
  created_by uuid references employees default me(),
  created_at timestamptz not null default now(),
  primary key (revenue_id, lead_id)
);
create index on revenue_leads (lead_id);

alter table revenue_leads enable row level security;
create policy read_revenue_leads on revenue_leads for select using (me() is not null);
create policy write_revenue_leads on revenue_leads for all
  using (can_record_revenue()) with check (can_record_revenue());

-- ---------- B. Data: tautkan & lengkapi (aman dijalankan ulang) ----------
do $$
declare
  v_pic  uuid;
  v_lead uuid;
  r      record;
begin
  select id into v_pic from employees
   where is_active and ((app_role = 'head' and dept_code = 'BDS') or app_role = 'admin')
   order by (app_role = 'head') desc, full_name limit 1;

  -- Lead baru untuk penjualan yang hanya ada di pendapatan.
  for r in
    select * from (values
      ('Bpk Rozikin', '+62 857-4392-1142', 'Desa Kertojayan, Kec. Grabag, Kab. Purworejo', 'aerator-mini', 12780000,
       '2026-04-23'::date, 'won',
       'Cicilan mini aerator (pendapatan 23 Apr 2026 "CICILAN ROZIKIN"). Jumlah unit & status lunas belum tercatat. Impor pendapatan 2026 · Rozikin'),
      ('PT Royal Korindah', null, null, null, 62271000,
       '2026-05-21'::date, 'won',
       'PLTS (Sebaran Teknologi 2026 #57). Pendapatan 21 Mei 2026 = DP PLTS; nilai total kontrak belum tercatat. Impor pendapatan 2026 · Royal Korindah'),
      ('Rizhar Eman', null, null, null, 6283000,
       '2026-07-30'::date, 'feedback',
       'Beli teknologi (Sales Petambak): pembayaran 30 Jul + 19 Agu 2026. Jenis alat belum tercatat. Impor pendapatan 2026 · Rizhar Eman')
    ) as t(customer, contact, location, product_code, value, closed_on, stage, notes)
  loop
    if not exists (select 1 from sales_leads where notes = r.notes) then
      insert into sales_leads (lead_date, source, customer, contact, location, product_code, units, value, sales_id,
                               notes, stage, so_number, closed_on, paid_on)
      values (r.closed_on, 'other', r.customer, r.contact, r.location, r.product_code, 1, r.value, v_pic,
              r.notes, r.stage, 'IMPOR-PENDAPATAN', r.closed_on,
              case when r.stage = 'feedback' then '2026-08-19'::date end);
    end if;
  end loop;

  -- Tautan pendapatan -> lead: (tanggal, nominal pendapatan, akhir catatan lead).
  for r in
    select * from (values
      ('2026-04-30'::date, 69925000::bigint, '· Order Brush #20'),
      ('2026-04-30'::date, 69925000::bigint, '· Order Non-Brush #4'),
      ('2026-04-27'::date, 6695500::bigint, '· Order Brush #19'),
      ('2026-06-07'::date, 4600000::bigint, '· Order Non-Brush #12'),
      ('2026-07-11'::date, 1843500::bigint, '· Order Non-Brush #12'),
      ('2026-06-29'::date, 12564000::bigint, '· Order Non-Brush #15'),
      ('2026-04-23'::date, 12780000::bigint, '· Rozikin'),
      ('2026-05-21'::date, 62271000::bigint, '· Royal Korindah'),
      ('2026-07-30'::date, 2000000::bigint, '· Rizhar Eman'),
      ('2026-08-19'::date, 4283000::bigint, '· Rizhar Eman')
    ) as t(revenue_date, amount, lead_suffix)
  loop
    insert into revenue_leads (revenue_id, lead_id)
    select v.id, l.id
      from revenues v
      join sales_leads l on l.notes like '%' || r.lead_suffix
     where v.revenue_date = r.revenue_date and v.amount = r.amount and v.allocation = 'Penjualan Teknologi'
    on conflict do nothing;
  end loop;

  -- Tanggal lunas lead = pembayaran terakhir; lokasi dari Sebaran Teknologi.
  update sales_leads set paid_on = '2026-04-30', location = coalesce(location, 'PT Ghana Utamadi Dhuniara, Mlonggo, Jepara')
   where notes like '%· Order Brush #20' or notes like '%· Order Non-Brush #4';
  update sales_leads set paid_on = '2026-04-27', location = coalesce(location, 'Desa Keramas, Blahbatuh, Gianyar, Bali')
   where notes like '%· Order Brush #19';
  update sales_leads set paid_on = '2026-07-11', location = coalesce(location, 'Punjulharjo, Rembang')
   where notes like '%· Order Non-Brush #12';
  update sales_leads set paid_on = '2026-06-29', location = coalesce(location, 'Kawasan Industri Wijayakusuma, Semarang')
   where notes like '%· Order Non-Brush #15';

  -- Notifikasi "Anda menjadi PIC sales" dari lead baru di atas tidak perlu dikirim.
  delete from notifications where kind = 'sales' and created_at = now() and title like '%Anda menjadi PIC sales lead%';
end $$;

-- Muat ulang daftar tabel di API Supabase.
notify pgrst, 'reload schema';

-- Cek hasil: pendapatan yang tertaut ke lead (harus 10 baris).
select v.revenue_date, v.amount, v.description, l.number, l.customer
  from revenue_leads rl join revenues v on v.id = rl.revenue_id join sales_leads l on l.id = rl.lead_id
 order by v.revenue_date, l.number;
