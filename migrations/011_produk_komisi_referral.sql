-- 011: Master produk, klaim komisi (kind = 'commission', nomor KK-...), kode referral karyawan.
-- Lihat docs/fase-2-3/06-produk-komisi-referral.md. Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Alur reimburse, permintaan pembayaran, dinas, dan pengadaan tidak berubah.
--
-- Alur klaim komisi (mesin bersama): Belum di-review -> Sedang di-review -> Diterima -> Ditransfer (F&A).
-- Syarat Diterima: F&A mencentang "Penjualan sudah lunas" (sampai modul Penjualan #6 tersedia).
-- Komisi per baris dihitung otomatis di database dari master produk yang berlaku pada tanggal closing.

-- ---------- A. Kode referral karyawan (mis. CRU-FARHAH) ----------
alter table employees add column referral_code text unique;

-- Kode = CRU- + nama depan (huruf saja). Bila sudah dipakai: CRU-NAMA2, CRU-NAMA3, ...
create function make_referral_code(p_name text, p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_base text := 'CRU-' || coalesce(nullif(upper(regexp_replace(split_part(trim(p_name), ' ', 1), '[^A-Za-z]', '', 'g')), ''), 'KARYAWAN');
  v_code text := v_base;
  v_n    int := 1;
begin
  while exists (select 1 from employees where referral_code = v_code and id <> p_id) loop
    v_n := v_n + 1;
    v_code := v_base || v_n;
  end loop;
  return v_code;
end $$;

do $$
declare r record;
begin
  for r in select id, full_name from employees where referral_code is null order by is_active desc, full_name loop
    update employees set referral_code = make_referral_code(r.full_name, r.id) where id = r.id;
  end loop;
end $$;

create function set_referral_code() returns trigger
language plpgsql as $$
begin
  new.referral_code := coalesce(nullif(upper(trim(coalesce(new.referral_code, ''))), ''),
                                make_referral_code(new.full_name, new.id));
  return new;
end $$;

create trigger trg_employee_referral_code
before insert on employees
for each row execute function set_referral_code();

-- ---------- B. Master produk (admin/F&A mengubah; berlaku mulai/sampai) ----------
-- Satu produk (code) boleh punya beberapa versi harga dengan periode berlaku yang tidak tumpang tindih.
create table products (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (code ~ '^[a-z0-9-]+$'),
  name           text not null check (length(trim(name)) > 0),
  type           text not null check (type in ('unit', 'bundle')),   -- Satuan / Bundle
  price          bigint not null check (price >= 0),                 -- harga jual acuan, excl. VAT
  hpp            bigint not null check (hpp >= 0),                   -- HPP per unit
  commission_pct numeric(6,4) not null check (commission_pct between 0 and 1),  -- 0,025 = 2,5%
  max_discount   numeric(6,4) not null check (max_discount between 0 and 1),
  bundle_items   text,                                               -- komposisi bundle
  promo_price    bigint check (promo_price >= 0),                    -- harga promo brosur (informasi)
  notes          text,
  valid_from     date not null,
  valid_to       date check (valid_to is null or valid_to >= valid_from),
  updated_by     uuid references employees default me(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on products (code, valid_from);

create function check_product_period() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from products p
     where p.code = new.code and p.id <> new.id
       and daterange(p.valid_from, p.valid_to, '[]') && daterange(new.valid_from, new.valid_to, '[]')) then
    raise exception 'Periode berlaku "%" tumpang tindih dengan versi lain. Isi "berlaku sampai" di versi lama dulu.', new.name;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(me(), new.updated_by);
  return new;
end $$;

create trigger trg_product_period
before insert or update on products
for each row execute function check_product_period();

alter table products enable row level security;
create policy read_products on products for select using (me() is not null);
create policy write_products on products for all using (is_request_reviewer()) with check (is_request_reviewer());

insert into products (code, name, type, price, hpp, commission_pct, max_discount, bundle_items, promo_price, notes, valid_from) values
  ('aerator-brush-3f', 'Aerator Brush 3 Fasa', 'unit', 6900000, 6500000, 0.025, 0.025, null, null, null, '2026-10-22'),
  ('aerator-brush-1f', 'Aerator Brush 1 Fasa', 'unit', 6500000, 6100000, 0.05, 0.05, null, 5200000,
   'Harga promo brosur lebih rendah dari HPP', '2026-10-22'),
  ('aerator-mini', 'Aerator Mini', 'unit', 3500000, 2750000, 0.05, 0.07, null, 3000000, null, '2026-10-22'),
  ('ebii-system', 'EBII System', 'unit', 29120000, 26000000, 0.025, 0.025, null, null, null, '2026-10-22'),
  ('smart-energy', 'Smart Energy', 'unit', 2000000, 1750000, 0.06, 0.06, null, 2100000, null, '2026-10-22'),
  ('panel-surya-on-grid', 'Panel Surya On-grid (belum jasa)', 'unit', 35000000, 31250000, 0.025, 0.025, null, null, null, '2026-10-22'),
  ('panel-surya-off-grid', 'Panel Surya Off-grid (belum jasa)', 'unit', 45000000, 40180000, 0.025, 0.025, null, null, null, '2026-10-22'),
  ('ecoaerator', 'Ecoaerator (aerator + panel surya)', 'bundle', 41832000, 37350000, 0.025, 0.025,
   'Aerator + panel surya', null, null, '2026-10-22'),
  ('full-set-technology', 'Full set technology (Ecoaerator + EBII + Smart Energy)', 'bundle', 72912000, 65100000, 0.025, 0.025,
   'Ecoaerator + EBII System + Smart Energy', null, null, '2026-10-22');

-- ---------- C. Hitung klaim komisi otomatis ----------
-- data.lines = [{customer, invoice, closing_date, product_code, units, sales_total, justification, referral_code}]
-- Database mengisi: product_id, product_name, commission_pct, hpp_unit, hpp_total, profit, commission,
-- no_profit (profit <= 0 -> komisi 0), below_min (harga/unit di bawah harga minimal), referral_id, referral_name.
-- requests.amount = total komisi.
-- Bukan security definer: current_user dipakai untuk membedakan pemohon (API) dari fungsi alur.
create function prepare_commission_claim() returns trigger
language plpgsql set search_path = public as $$
declare
  v_out   jsonb := '[]';
  v_line  jsonb;
  v_i     int := 0;
  v_p     products;
  v_ref   employees;
  v_date  date;
  v_units int;
  v_sales bigint;
  v_hpp   bigint;
  v_prof  bigint;
  v_comm  bigint;
  v_code  text;
  v_total bigint := 0;
begin
  if new.kind <> 'commission' then return new; end if;
  -- Tanda "penjualan lunas" hanya diisi F&A lewat change_request_status.
  if current_user in ('authenticated', 'anon') then
    new.data := new.data - 'sales_paid' - 'sales_paid_by' - 'sales_paid_at';
  end if;
  if tg_op = 'UPDATE' and new.data->'lines' is not distinct from old.data->'lines' then return new; end if;

  if coalesce(jsonb_typeof(new.data->'lines'), '') <> 'array' or jsonb_array_length(new.data->'lines') = 0 then
    raise exception 'Isi minimal satu baris penjualan.';
  end if;
  if jsonb_array_length(new.data->'lines') > 30 then
    raise exception 'Maksimal 30 baris penjualan per klaim.';
  end if;

  for v_line in select value from jsonb_array_elements(new.data->'lines') loop
    v_i := v_i + 1;
    if nullif(trim(coalesce(v_line->>'customer', '')), '') is null then
      raise exception 'Baris %: nama customer belum diisi.', v_i;
    end if;
    if nullif(trim(coalesce(v_line->>'invoice', '')), '') is null then
      raise exception 'Baris %: no. invoice/PO/kontrak belum diisi.', v_i;
    end if;
    begin
      v_date := (v_line->>'closing_date')::date;
      v_units := (v_line->>'units')::int;
      v_sales := (v_line->>'sales_total')::bigint;
    exception when others then
      raise exception 'Baris %: tanggal closing, jumlah unit, atau total penjualan tidak valid.', v_i;
    end;
    if v_date is null or v_date > (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Baris %: tanggal closing belum diisi atau di masa depan.', v_i;
    end if;
    if coalesce(v_units, 0) < 1 then raise exception 'Baris %: jumlah unit minimal 1.', v_i; end if;
    if coalesce(v_sales, 0) <= 0 then raise exception 'Baris %: total penjualan belum diisi.', v_i; end if;
    if coalesce(v_line->>'justification', '') !~* '^https?://' then
      raise exception 'Baris %: justifikasi harus berupa link (diawali http:// atau https://).', v_i;
    end if;

    select * into v_p from products
     where code = v_line->>'product_code' and valid_from <= v_date and (valid_to is null or valid_to >= v_date)
     order by valid_from desc limit 1;
    if not found then
      raise exception 'Baris %: produk belum dipilih atau tidak berlaku pada tanggal closing.', v_i;
    end if;

    v_code := nullif(upper(trim(coalesce(v_line->>'referral_code', ''))), '');
    v_ref := null;
    if v_code is not null then
      select * into v_ref from employees where referral_code = v_code and is_active;
      if not found then raise exception 'Baris %: kode referral "%" tidak dikenal.', v_i, v_code; end if;
    end if;

    v_hpp := v_units * v_p.hpp;
    v_prof := v_sales - v_hpp;
    v_comm := case when v_prof <= 0 then 0 else round(v_prof * v_p.commission_pct) end;
    v_total := v_total + v_comm;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'customer', trim(v_line->>'customer'),
      'invoice', trim(v_line->>'invoice'),
      'closing_date', v_date,
      'product_code', v_p.code,
      'units', v_units,
      'sales_total', v_sales,
      'justification', trim(v_line->>'justification'),
      'referral_code', v_code,
      'referral_id', v_ref.id,
      'referral_name', v_ref.full_name,
      'product_id', v_p.id,
      'product_name', v_p.name,
      'commission_pct', v_p.commission_pct,
      'hpp_unit', v_p.hpp,
      'hpp_total', v_hpp,
      'profit', v_prof,
      'commission', v_comm,
      'no_profit', v_prof <= 0,
      'below_min', v_sales < v_units * round(v_p.price * (1 - v_p.max_discount))
    ));
  end loop;

  new.data := jsonb_set(new.data, '{lines}', v_out);
  new.amount := v_total;
  return new;
end $$;

create trigger trg_request_commission
before insert or update on requests
for each row execute function prepare_commission_claim();

-- ---------- D. Fungsi alur pengajuan (menggantikan versi 010) ----------
-- Tambahan: klaim komisi hanya bisa "Diterima" setelah F&A mencentang "Penjualan sudah lunas" (p_data.sales_paid).

create or replace function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null,
                                       p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := me();
  v_req      requests;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_reviewer boolean := is_request_reviewer();
  v_ceo      boolean := my_role() in ('ceo', 'admin');
  v_hr       boolean := is_travel_hr();
  v_to       boolean := is_techops();
  v_fa_head  boolean := is_fa_head();
  v_assigner boolean;
  v_head     boolean;
  v_advance  boolean;
  v_ok       boolean := false;
  v_year     text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_st       text;
  v_po       text;
  v_patch    jsonb;
  v_amount   bigint;
  v_vendor   jsonb;
  v_extra    text;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_req from requests where id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  v_assigner := v_req.assigner_id = v_me or my_role() = 'admin';
  v_head := is_procurement_head(v_req.dept_code);
  v_advance := coalesce((v_req.data->>'advance')::boolean, false);

  if p_to = 'submitted' then
    v_ok := v_req.requester_id = v_me and v_req.status in ('draft', 'needs_revision');
  elsif v_req.kind = 'procurement' then
    v_ok := case p_to
      when 'head_approved'    then v_head and v_req.status = 'submitted'
      when 'vendor_compared'  then v_to and v_req.status = 'head_approved'
      when 'fa_verified'      then v_reviewer and v_req.status = 'vendor_compared'
      when 'fa_approved'      then v_fa_head and v_req.status = 'fa_verified'
      when 'ceo_approved'     then v_ceo and v_req.status = 'ceo_review'
      when 'po_issued'        then v_reviewer and v_req.status in ('fa_approved', 'ceo_approved')
      when 'received'         then (v_to or v_req.requester_id = v_me) and v_req.status in ('po_issued', 'returned')
      when 'returned'         then (v_to or v_req.requester_id = v_me) and v_req.status = 'po_issued'
      when 'payment_approved' then v_fa_head and v_req.status = 'received'
      when 'paid'             then v_reviewer and v_req.status = 'payment_approved'
      when 'completed'        then (v_reviewer or v_to) and v_req.status = 'paid'
      when 'needs_revision'   then (v_head and v_req.status = 'submitted') or (v_to and v_req.status = 'head_approved')
                                   or (v_reviewer and v_req.status = 'vendor_compared')
                                   or (v_fa_head and v_req.status = 'fa_verified') or (v_ceo and v_req.status = 'ceo_review')
      when 'rejected'         then (v_head and v_req.status = 'submitted') or (v_to and v_req.status = 'head_approved')
                                   or (v_reviewer and v_req.status = 'vendor_compared')
                                   or (v_fa_head and v_req.status = 'fa_verified') or (v_ceo and v_req.status = 'ceo_review')
      else false end;
  elsif v_req.kind = 'travel' then
    if p_to = 'assigner_approved' then
      v_ok := v_assigner and v_req.status = 'submitted';
    elsif p_to = 'st_issued' then
      v_ok := v_hr and v_req.status = 'assigner_approved';
    elsif p_to = 'approved' then
      v_ok := v_reviewer and v_req.status = 'st_issued';
    elsif p_to in ('needs_revision', 'rejected') then
      v_ok := (v_assigner and v_req.status = 'submitted')
           or (v_hr and v_req.status = 'assigner_approved')
           or (v_reviewer and v_req.status = 'st_issued');
    elsif p_to = 'paid' then
      v_ok := v_reviewer and v_req.status = 'approved' and v_advance;
    elsif p_to = 'completed' then
      v_ok := v_reviewer and (v_req.status = 'paid' or (v_req.status = 'approved' and not v_advance));
    end if;
  elsif p_to = 'in_review' then
    v_ok := v_reviewer and v_req.status = 'submitted';
  elsif p_to in ('approved', 'needs_revision', 'rejected') then
    v_ok := (v_reviewer and v_req.status in ('submitted', 'in_review'))
         or (v_ceo and v_req.status = 'ceo_review');
  elsif p_to = 'paid' then
    v_ok := v_reviewer and v_req.status = 'approved';
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".',
      request_status_label(v_req.status, v_req.kind), request_status_label(p_to, v_req.kind);
  end if;
  -- Peninjau tidak boleh meninjau pengajuannya sendiri (kecuali admin; CEO boleh menyetujui
  -- penugasan dinasnya sendiri sebagai penugas; pemohon pengadaan ikut memeriksa barang yang diterima).
  if p_to <> 'submitted' and v_req.requester_id = v_me and my_role() <> 'admin'
     and not (p_to = 'assigner_approved' and my_role() = 'ceo')
     and not (v_req.kind = 'procurement' and p_to in ('received', 'returned')) then
    raise exception 'Anda tidak boleh meninjau pengajuan Anda sendiri.';
  end if;
  if p_to in ('needs_revision', 'rejected') and v_note is null then
    raise exception 'Catatan/alasan wajib diisi.';
  end if;
  if v_req.kind = 'procurement' and p_to = 'returned' and v_note is null then
    raise exception 'Tuliskan alasan retur (jumlah/spesifikasi/kondisi yang tidak sesuai).';
  end if;
  if v_req.kind = 'procurement' and p_to = 'completed' and v_note is null then
    raise exception 'Tuliskan nomor aset atau catatan stok.';
  end if;
  -- Klaim komisi: diterima hanya bila penjualan sudah lunas (dicentang F&A).
  if v_req.kind = 'commission' and p_to = 'approved' then
    if not coalesce((p_data->>'sales_paid')::boolean, false) then
      raise exception 'Centang "Penjualan sudah lunas" sebelum menerima klaim komisi.';
    end if;
    v_patch := jsonb_build_object('sales_paid', true, 'sales_paid_by', v_me, 'sales_paid_at', now());
    v_extra := 'Penjualan dikonfirmasi lunas oleh F&A.';
  end if;
  if p_to = 'paid' and p_paid_on is null then
    raise exception 'Tanggal % wajib diisi.', case when v_req.kind = 'travel' then 'pencairan' else 'transfer' end;
  end if;
  if p_to = 'submitted' and v_req.kind = 'travel' then
    if v_req.assigner_id is null then raise exception 'Pilih siapa yang menugaskan.'; end if;
    if v_req.assigner_id = v_req.requester_id and my_role() <> 'ceo' then
      raise exception 'Penugas tidak boleh diri sendiri.';
    end if;
  end if;
  if p_to = 'completed' and v_req.kind = 'travel' and not exists (
    select 1 from request_files f where f.request_id = p_id and f.purpose = 'report') then
    raise exception 'FPTD dan laporan misi belum dilampirkan pemohon.';
  end if;

  -- Pengadaan: perbandingan vendor (TO) dan pilihan vendor (Head F&A).
  if v_req.kind = 'procurement' and p_to = 'vendor_compared' then
    if coalesce(jsonb_typeof(p_data->'vendors'), '') <> 'array' or jsonb_array_length(p_data->'vendors') < 3 then
      raise exception 'Isi minimal 3 vendor pembanding.';
    end if;
    if coalesce((p_data->>'recommended')::int, -1) not between 0 and jsonb_array_length(p_data->'vendors') - 1 then
      raise exception 'Pilih satu vendor yang direkomendasikan.';
    end if;
    v_patch := jsonb_build_object('vendors', p_data->'vendors', 'recommended', (p_data->>'recommended')::int);
  elsif v_req.kind = 'procurement' and p_to = 'fa_approved' then
    v_vendor := v_req.data->'vendors'->((p_data->>'selected')::int);
    if v_vendor is null or nullif(trim(coalesce(p_data->>'method', '')), '') is null then
      raise exception 'Pilih vendor dan metode pengadaan.';
    end if;
    v_amount := (v_vendor->>'price')::bigint;
    v_patch := jsonb_build_object('selected', (p_data->>'selected')::int, 'method', trim(p_data->>'method'));
    v_extra := 'Vendor dipilih: ' || (v_vendor->>'name') || ' · Rp' ||
               replace(to_char(v_amount, 'FM999G999G999G999'), ',', '.') || ' · metode: ' || trim(p_data->>'method');
  end if;

  -- Permintaan pembayaran >= Rp5 juta yang diterima F&A -> menunggu persetujuan CEO.
  if p_to = 'approved' and v_req.status <> 'ceo_review'
     and v_req.kind = 'payment' and v_req.amount >= 5000000 then
    p_to := 'ceo_review';
  end if;
  -- Pengadaan >= Rp5 juta (harga vendor terpilih) yang disetujui Head F&A -> approval final CEO.
  if p_to = 'fa_approved' and coalesce(v_amount, v_req.amount) >= 5000000 then
    p_to := 'ceo_review';
  end if;

  -- Nomor surat tugas ST-2026-001, berurutan per tahun.
  if p_to = 'st_issued' then
    perform pg_advisory_xact_lock(hashtext('st-number:' || v_year));
    select 'ST-' || v_year || '-' || lpad((coalesce(max(split_part(st_number, '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_st
      from requests where st_number like 'ST-' || v_year || '-%';
  end if;
  -- Nomor PO PO-2026-001, berurutan per tahun (disimpan di data.po_number).
  if p_to = 'po_issued' then
    perform pg_advisory_xact_lock(hashtext('po-number:' || v_year));
    select 'PO-' || v_year || '-' || lpad((coalesce(max(split_part(data->>'po_number', '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_po
      from requests where kind = 'procurement' and data->>'po_number' like 'PO-' || v_year || '-%';
    v_patch := jsonb_build_object('po_number', v_po);
    v_extra := 'No. PO: ' || v_po;
  end if;
  if v_st is not null then v_extra := 'No. surat tugas: ' || v_st; end if;

  update requests
     set status = p_to,
         status_since = now(),
         submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
         paid_on = case when p_to = 'paid' then p_paid_on else paid_on end,
         st_number = coalesce(v_st, st_number),
         amount = coalesce(v_amount, amount),
         data = data || coalesce(v_patch, '{}'::jsonb)
   where id = p_id;

  insert into request_events (request_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, case when p_to = 'submitted' then 'submit' else 'status' end, v_req.status, p_to,
          case when v_extra is not null then concat_ws(E'\n', v_extra, v_note) else v_note end);

  if p_to = 'submitted' then
    if v_req.kind = 'travel' then
      -- Penugasan dinas -> penugas.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select v_req.assigner_id, 'request', p_id,
             v_req.number || ' · Perlu persetujuan penugas: ' || v_req.title, v_me
       where v_req.assigner_id <> v_me;
    elsif v_req.kind = 'procurement' then
      -- PR -> head departemen pemohon; bila tidak ada (atau pemohon sendiri head) -> CEO.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan head: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.app_role = 'head' and e.dept_code = v_req.dept_code and e.id <> v_me;
      if not found then
        insert into notifications (employee_id, kind, request_id, title, actor_id)
        select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan head: ' || v_req.title, v_me
          from employees e
         where e.is_active and e.app_role = 'ceo' and e.id <> v_me;
      end if;
    else
      -- Pengajuan baru / dikirim ulang -> semua karyawan F&A.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · ' ||
             case when v_req.status = 'needs_revision' then 'Dikirim ulang' else 'Pengajuan baru' end ||
             ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
    -- Nilai >= Rp5.000.000 -> CEO (sekali per pengajuan).
    if v_req.amount >= 5000000 then
      insert into notifications (employee_id, kind, request_id, title, actor_id, dedupe_key)
      select e.id, 'request', p_id, v_req.number || ' · Pengajuan ≥ Rp5 juta: ' || v_req.title,
             v_me, 'ceo-request:' || p_id
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me
      on conflict (employee_id, dedupe_key) do nothing;
    end if;
  else
    if v_req.requester_id <> v_me then
      -- Status berubah -> pemohon.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      values (v_req.requester_id, 'request', p_id,
              v_req.number || ' · ' || request_status_label(p_to, v_req.kind) || ': ' || v_req.title, v_me);
    end if;
    if p_to = 'ceo_review' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu persetujuan CEO: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.app_role = 'ceo' and e.id <> v_me;
    elsif v_req.status = 'ceo_review' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · Keputusan CEO: ' || request_status_label(p_to, v_req.kind) || ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    elsif p_to = 'assigner_approved' then
      -- Disetujui penugas -> HR/CA menerbitkan surat tugas.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu nomor surat tugas: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'CA' and e.id <> v_me;
    elsif p_to = 'st_issued' then
      -- Surat tugas terbit -> F&A memverifikasi.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Perlu verifikasi Finance: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    elsif v_req.kind = 'procurement' and p_to in ('head_approved', 'vendor_compared', 'fa_verified', 'fa_approved',
                                                  'po_issued', 'received', 'returned', 'payment_approved', 'paid') then
      -- Pengadaan -> pihak yang memegang tahap berikutnya.
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id,
             v_req.number || ' · ' || case p_to
               when 'head_approved'    then 'Perlu perbandingan vendor'
               when 'vendor_compared'  then 'Perlu verifikasi Finance'
               when 'fa_verified'      then 'Perlu persetujuan Head F&A'
               when 'fa_approved'      then 'Perlu terbitkan PO'
               when 'po_issued'        then 'PO terbit, siapkan penerimaan barang/jasa'
               when 'received'         then 'Barang/jasa diterima, perlu triple matching'
               when 'returned'         then 'Barang/jasa diretur ke vendor'
               when 'payment_approved' then 'Perlu dibayar ke vendor'
               when 'paid'             then 'Perlu registrasi aset/stok'
             end || ': ' || v_req.title, v_me
        from employees e
       where e.is_active and e.id <> v_me and case
               when p_to in ('head_approved', 'po_issued', 'paid') then e.dept_code = 'TO'
               when p_to in ('fa_verified', 'received') then e.dept_code = 'FA' and e.app_role = 'head'
               when p_to = 'returned' then e.dept_code in ('FA', 'TO')
               else e.dept_code = 'FA' end;
    end if;
  end if;
end $$;

-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
