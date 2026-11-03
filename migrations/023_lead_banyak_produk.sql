-- 023: Satu lead boleh berisi beberapa produk, masing-masing dengan jumlah unit dan nilai sendiri.
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak menghapus data.
--
-- sales_leads.items = [{product_code, units, value}, ...]. Kolom lama tetap ada sebagai ringkasan otomatis:
--   product_code = produk pertama, units = total unit, value = total nilai (dipakai laporan & target kuartal).
-- Lead lama otomatis diberi satu baris produk dari isinya sekarang.
-- Ikut menyesuaikan: kebutuhan stok per produk, stok keluar otomatis saat work order (per produk),
-- syarat closing (setiap baris punya produk & nilai), dan klaim komisi dari penjualan (satu baris klaim per produk).

alter table sales_leads add column items jsonb not null default '[]'::jsonb;

-- Baris produk sebuah lead; lead tanpa baris memakai kolom ringkasan lama.
create function lead_items(l sales_leads) returns jsonb
language sql stable as $$
  select case when jsonb_array_length(l.items) > 0 then l.items
              else jsonb_build_array(jsonb_build_object('product_code', l.product_code, 'units', l.units, 'value', l.value)) end
$$;

-- ---------- A. Nomor, kode referral, baris produk, perlindungan kolom alur (menggantikan versi 012) ----------
create or replace function prepare_sales_lead() returns trigger
language plpgsql set search_path = public as $$
declare
  v_year  text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_api   boolean := current_user in ('authenticated', 'anon');
  v_items jsonb := '[]';
  v_it    jsonb;
  v_i     int := 0;
  v_code  text;
  v_units int;
  v_value bigint;
begin
  new.customer := trim(new.customer);
  new.referral_code := nullif(upper(trim(coalesce(new.referral_code, ''))), '');
  if tg_op = 'INSERT' then
    if v_api then
      new.stage := 'lead';
      new.stage_since := now();
      new.lost_reason := null;
      new.so_number := null;
      new.closed_on := null;
      new.paid_on := null;
      new.paid_by := null;
      new.installed_on := null;
      new.created_by := me();
    end if;
    if new.lead_date > (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Tanggal lead masuk tidak boleh di masa depan.';
    end if;
    perform pg_advisory_xact_lock(hashtext('lead-number:' || v_year));
    select 'LD-' || v_year || '-' || lpad((coalesce(max(split_part(number, '-', 3)::int), 0) + 1)::text, 3, '0')
      into new.number
      from sales_leads where number like 'LD-' || v_year || '-%';
  else
    new.id := old.id;
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if v_api then
      new.stage := old.stage;
      new.stage_since := old.stage_since;
      new.lost_reason := old.lost_reason;
      new.so_number := old.so_number;
      new.closed_on := old.closed_on;
      new.paid_on := old.paid_on;
      new.paid_by := old.paid_by;
      new.installed_on := old.installed_on;
      -- Setelah closing, produk/unit/nilai/kode referral menjadi dasar komisi & realisasi: dikunci.
      if coalesce(lead_stage_rank(old.stage), 0) >= lead_stage_rank('won') then
        new.items := old.items;
        new.product_code := old.product_code;
        new.units := old.units;
        new.value := old.value;
        new.referral_code := old.referral_code;
      end if;
    end if;
  end if;

  -- Baris produk -> ringkasan (produk pertama, total unit, total nilai).
  if coalesce(jsonb_typeof(new.items), '') <> 'array' then
    raise exception 'Daftar produk tidak valid.';
  end if;
  if jsonb_array_length(new.items) > 20 then
    raise exception 'Maksimal 20 produk per lead.';
  end if;
  if jsonb_array_length(new.items) > 0 then
    for v_it in select value from jsonb_array_elements(new.items) loop
      v_i := v_i + 1;
      v_code := nullif(trim(coalesce(v_it->>'product_code', '')), '');
      begin
        v_units := coalesce((v_it->>'units')::int, 1);
        v_value := coalesce((v_it->>'value')::bigint, 0);
      exception when others then
        raise exception 'Produk %: jumlah unit atau nilai tidak valid.', v_i;
      end;
      if v_units < 1 then raise exception 'Produk %: jumlah unit minimal 1.', v_i; end if;
      if v_value < 0 then raise exception 'Produk %: nilai tidak boleh negatif.', v_i; end if;
      if v_code is not null and not exists (select 1 from products where code = v_code) then
        raise exception 'Produk %: produk tidak dikenal.', v_i;
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_code', v_code, 'units', v_units, 'value', v_value));
    end loop;
    new.items := v_items;
    new.product_code := (select it->>'product_code' from jsonb_array_elements(v_items) it
                          where it->>'product_code' is not null limit 1);
    new.units := (select sum((it->>'units')::int) from jsonb_array_elements(v_items) it);
    new.value := (select sum((it->>'value')::bigint) from jsonb_array_elements(v_items) it);
  end if;

  if new.source = 'referral' and new.referral_code is null then
    raise exception 'Lead dari referral wajib diisi kode referralnya.';
  end if;
  if tg_op = 'UPDATE' and new.referral_code is not distinct from old.referral_code then
    new.referral_id := old.referral_id;
  else
    new.referral_id := null;
    if new.referral_code is not null then
      select id into new.referral_id from employees where referral_code = new.referral_code and is_active;
      if new.referral_id is null then
        raise exception 'Kode referral "%" tidak dikenal.', new.referral_code;
      end if;
    end if;
  end if;
  if new.product_code is not null and not exists (select 1 from products where code = new.product_code) then
    raise exception 'Produk tidak dikenal.';
  end if;
  if (tg_op = 'INSERT' or new.sales_id is distinct from old.sales_id)
     and not exists (select 1 from employees where id = new.sales_id and is_active) then
    raise exception 'PIC sales harus karyawan aktif.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Lead lama: satu baris produk dari isinya sekarang (ringkasan tidak berubah).
update sales_leads
   set items = jsonb_build_array(jsonb_build_object('product_code', product_code, 'units', units, 'value', value))
 where items = '[]'::jsonb;

-- ---------- B. Kebutuhan stok per produk (menggantikan versi 012) ----------
create or replace function stock_overview() returns table (item_id uuid, on_hand bigint, demand bigint)
language sql stable set search_path = public as $$
  select i.id,
         coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id), 0)::bigint,
         coalesce((select sum((it->>'units')::int)
                     from sales_leads l cross join lateral jsonb_array_elements(lead_items(l)) it
                    where i.product_code is not null and it->>'product_code' = i.product_code
                      and l.stage in ('quotation', 'quotation_approved', 'negotiation', 'contract', 'won', 'paid')), 0)::bigint
    from stock_items i
$$;

-- ---------- C. Klaim komisi yang memakai penjualan (satu baris per lead, menggantikan versi 012) ----------
create or replace function lead_commission_claims(p_ids uuid[])
returns table (lead_id uuid, request_id uuid, number text, status text, requester_name text)
language sql stable security definer set search_path = public as $$
  select distinct s.id, r.id, r.number, r.status, e.full_name
    from requests r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data->'lines') = 'array' then r.data->'lines' else '[]' end) l
    join sales_leads s on s.id::text = l->>'lead_id'
    join employees e on e.id = r.requester_id
   where (select me()) is not null and r.kind = 'commission' and r.status <> 'rejected' and s.id = any(p_ids)
$$;

-- ---------- D. Klaim komisi dihitung otomatis (menggantikan versi 012) ----------
-- Baris dengan lead_id diganti satu baris per produk lead (customer, no. SO, tanggal closing, produk, unit,
-- nilai, kode referral dari lead). Baris lain dari lead yang sama di klaim yang sama diabaikan.
create or replace function prepare_commission_claim() returns trigger
language plpgsql set search_path = public as $$
declare
  v_in    jsonb := '[]';
  v_seen  uuid[] := '{}';
  v_out   jsonb := '[]';
  v_line  jsonb;
  v_it    jsonb;
  v_i     int := 0;
  v_p     products;
  v_ref   employees;
  v_lead  sales_leads;
  v_owner uuid;
  v_is_lead boolean;
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

  -- Uraikan baris dari penjualan menjadi satu baris per produk lead.
  for v_line in select value from jsonb_array_elements(new.data->'lines') loop
    v_i := v_i + 1;
    if nullif(v_line->>'lead_id', '') is null then
      v_in := v_in || jsonb_build_array(v_line);
      continue;
    end if;
    select * into v_lead from sales_leads where id::text = v_line->>'lead_id';
    if v_lead.id is null then raise exception 'Baris %: penjualan tidak ditemukan.', v_i; end if;
    if v_lead.id = any(v_seen) then continue; end if;
    v_seen := v_seen || v_lead.id;
    if coalesce(lead_stage_rank(v_lead.stage), 0) < lead_stage_rank('won') then
      raise exception 'Baris %: penjualan % belum closing.', v_i, v_lead.number;
    end if;
    v_owner := coalesce(v_lead.referral_id, v_lead.sales_id);
    if new.requester_id is distinct from v_owner then
      raise exception 'Baris %: penjualan % hanya bisa diklaim oleh %.', v_i, v_lead.number,
        (select full_name from employees where id = v_owner);
    end if;
    if exists (select 1 from lead_commission_claims(array[v_lead.id]) c where c.request_id <> new.id) then
      raise exception 'Baris %: penjualan % sudah pernah diklaim.', v_i, v_lead.number;
    end if;
    for v_it in select value from jsonb_array_elements(lead_items(v_lead)) loop
      v_in := v_in || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead.id,
        'customer', v_lead.customer,
        'invoice', v_lead.so_number,
        'closing_date', v_lead.closed_on,
        'product_code', v_it->>'product_code',
        'units', v_it->'units',
        'sales_total', v_it->'value',
        'justification', coalesce(v_line->>'justification', ''),
        'referral_code', v_lead.referral_code));
    end loop;
  end loop;

  if jsonb_array_length(v_in) > 30 then
    raise exception 'Maksimal 30 baris penjualan per klaim.';
  end if;

  v_i := 0;
  for v_line in select value from jsonb_array_elements(v_in) loop
    v_i := v_i + 1;
    v_is_lead := nullif(v_line->>'lead_id', '') is not null;
    v_lead := null;
    if v_is_lead then
      select * into v_lead from sales_leads where id::text = v_line->>'lead_id';
    end if;

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
    if not v_is_lead and coalesce(v_line->>'justification', '') !~* '^https?://' then
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
      select * into v_ref from employees where referral_code = v_code and (is_active or v_is_lead);
      if not found then raise exception 'Baris %: kode referral "%" tidak dikenal.', v_i, v_code; end if;
    end if;

    v_hpp := v_units * v_p.hpp;
    v_prof := v_sales - v_hpp;
    v_comm := case when v_prof <= 0 then 0 else round(v_prof * v_p.commission_pct) end;
    v_total := v_total + v_comm;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'lead_id', v_lead.id,
      'lead_number', v_lead.number,
      'customer', trim(v_line->>'customer'),
      'invoice', trim(v_line->>'invoice'),
      'closing_date', v_date,
      'product_code', v_p.code,
      'units', v_units,
      'sales_total', v_sales,
      'justification', trim(coalesce(v_line->>'justification', '')),
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

-- ---------- E. Alur tahap penjualan (menggantikan versi 012) ----------
-- Perubahan: syarat closing = setiap produk punya produk & nilai; work order mengurangi stok per produk.
create or replace function change_lead_stage(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := me();
  v_lead  sales_leads;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_mgr   boolean := is_sales_manager();
  v_own   boolean;
  v_from  int;
  v_to    int;
  v_won   int := lead_stage_rank('won');
  v_ok    boolean := false;
  v_extra text;
  v_item  stock_items;
  v_it    jsonb;
  v_date  date;
  v_text  text;
  v_link  text := '/penjualan/' || p_id;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_lead from sales_leads where id = p_id for update;
  if not found then raise exception 'Lead tidak ditemukan.'; end if;
  v_own := v_lead.sales_id = v_me or v_mgr;
  v_from := lead_stage_rank(v_lead.stage);
  v_to := lead_stage_rank(p_to);

  if p_to = 'lost' then
    v_ok := v_own and v_from < lead_stage_rank('paid');
  elsif v_lead.stage = 'lost' then
    v_ok := v_mgr and p_to = 'lead';
  elsif p_to = 'quotation_approved' then
    v_ok := v_mgr and v_lead.stage = 'quotation';
  elsif v_to < v_won then
    v_ok := v_from < v_won and ((v_own and v_to > v_from) or (v_mgr and v_to <> v_from));
  elsif p_to = 'won' then
    v_ok := v_own and v_from < v_won;
  elsif p_to = 'paid' then
    v_ok := is_request_reviewer() and v_lead.stage = 'won';
  elsif p_to = 'work_order' then
    v_ok := (v_own or is_techops()) and v_lead.stage = 'paid';
  elsif p_to = 'installed' then
    v_ok := (v_own or is_techops()) and v_lead.stage = 'work_order';
  elsif p_to = 'feedback' then
    v_ok := v_own and v_lead.stage = 'installed';
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Tahap tidak bisa diubah dari "%" ke "%".', lead_stage_label(v_lead.stage), lead_stage_label(p_to);
  end if;

  if p_to = 'lost' and v_note is null then raise exception 'Tuliskan alasan lead gagal.'; end if;
  if v_lead.stage = 'lost' and v_note is null then raise exception 'Tuliskan alasan lead dibuka lagi.'; end if;
  if v_to < v_from and v_note is null then raise exception 'Tuliskan alasan tahap dimundurkan.'; end if;
  if p_to = 'feedback' and v_note is null then raise exception 'Tuliskan hasil follow-up kepuasan customer.'; end if;

  if p_to = 'won' then
    if exists (select 1 from jsonb_array_elements(lead_items(v_lead)) it
                where nullif(it->>'product_code', '') is null or coalesce((it->>'value')::bigint, 0) <= 0) then
      raise exception 'Lengkapi produk, jumlah unit, dan nilai setiap produk di data lead dulu (tombol Ubah data).';
    end if;
    begin
      v_date := (p_data->>'closed_on')::date;
    exception when others then v_date := null;
    end;
    v_text := nullif(trim(coalesce(p_data->>'so_number', '')), '');
    if v_date is null or v_date > v_today then raise exception 'Tanggal closing belum diisi atau di masa depan.'; end if;
    if v_text is null then raise exception 'No. Sales Order / invoice / kontrak wajib diisi.'; end if;
    update sales_leads set so_number = v_text, closed_on = v_date where id = p_id;
    v_extra := 'Sales Order ' || v_text || ' · closing ' || to_char(v_date, 'DD-MM-YYYY') || ' · Rp' ||
               replace(to_char(v_lead.value, 'FM999G999G999G999'), ',', '.');
  elsif p_to = 'paid' then
    begin
      v_date := (p_data->>'paid_on')::date;
    exception when others then v_date := null;
    end;
    if v_date is null or v_date > v_today then raise exception 'Tanggal pelunasan belum diisi atau di masa depan.'; end if;
    update sales_leads set paid_on = v_date, paid_by = v_me where id = p_id;
    v_extra := 'Lunas ' || to_char(v_date, 'DD-MM-YYYY');
  elsif p_to = 'work_order' then
    -- Stok keluar otomatis per produk.
    for v_it in select value from jsonb_array_elements(lead_items(v_lead)) loop
      select * into v_item from stock_items
       where product_code = v_it->>'product_code' and is_active order by created_at limit 1;
      if found then
        insert into stock_moves (item_id, kind, qty, moved_on, reference, lead_id, note, actor)
        values (v_item.id, 'out', -(v_it->>'units')::int, v_today, v_lead.number, p_id,
                'Work order instalasi ' || v_lead.customer, v_me);
        v_extra := concat_ws(E'\n', v_extra,
          'Stok keluar otomatis: ' || (v_it->>'units') || ' ' || v_item.unit || ' ' || v_item.name);
      else
        v_extra := concat_ws(E'\n', v_extra, 'Belum ada barang stok untuk ' ||
          coalesce((select name from products where code = v_it->>'product_code' order by valid_from desc limit 1), 'produk ini') ||
          '; stok tidak dikurangi otomatis.');
      end if;
    end loop;
  elsif p_to = 'installed' then
    begin
      v_date := (p_data->>'installed_on')::date;
    exception when others then v_date := null;
    end;
    if v_date is null or v_date > v_today then raise exception 'Tanggal instalasi belum diisi atau di masa depan.'; end if;
    update sales_leads set installed_on = v_date where id = p_id;
    v_extra := 'Instalasi & BAST ' || to_char(v_date, 'DD-MM-YYYY') || ' · follow-up kepuasan paling lambat ' ||
               to_char(v_date + 7, 'DD-MM-YYYY');
  elsif p_to = 'lost' then
    update sales_leads set lost_reason = v_note where id = p_id;
  elsif v_lead.stage = 'lost' then
    update sales_leads set lost_reason = null where id = p_id;
  end if;

  update sales_leads set stage = p_to, stage_since = now() where id = p_id;
  insert into sales_lead_events (lead_id, actor, action, from_stage, to_stage, note)
  values (p_id, v_me, 'stage', v_lead.stage, p_to, nullif(concat_ws(E'\n', v_extra, v_note), ''));

  if p_to = 'won' then
    perform notify_people(dept_people('FA') || dept_people('TO'), 'sales',
      v_lead.number || ' · Sales Order baru, perlu invoice: ' || v_lead.customer, v_link);
  elsif p_to = 'paid' then
    perform notify_people(array[v_lead.sales_id, v_lead.referral_id] || dept_people('TO'), 'sales',
      v_lead.number || ' · Lunas, siapkan work order instalasi: ' || v_lead.customer, v_link);
  elsif p_to = 'work_order' then
    perform notify_people(dept_people('TO'), 'sales', v_lead.number || ' · Work order instalasi: ' || v_lead.customer, v_link);
  elsif p_to = 'installed' then
    perform notify_people(array[v_lead.sales_id], 'sales',
      v_lead.number || ' · Terpasang, follow-up kepuasan H+7: ' || v_lead.customer, v_link);
  elsif p_to = 'quotation' and coalesce((p_data->>'need_cmo')::boolean, false) then
    perform notify_people(dept_people('BDS', true), 'sales',
      v_lead.number || ' · Perlu approval CMO (diskon/custom/nilai besar): ' || v_lead.customer, v_link);
  else
    perform notify_people(array[v_lead.sales_id], 'sales',
      v_lead.number || ' · ' || lead_stage_label(p_to) || ': ' || v_lead.customer, v_link);
  end if;
end $$;

-- ---------- F. Fungsi alur pengajuan (menggantikan versi 015) ----------
-- Satu-satunya perubahan: nomor lead belum lunas tidak diulang bila satu lead punya beberapa baris klaim.
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
    v_ok := v_reviewer and v_req.status = 'approved' and v_req.kind <> 'aqua_plan';
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
  -- Klaim komisi: diterima hanya bila penjualan sudah lunas. Baris dari modul Penjualan memakai status Lunas
  -- yang dicatat Finance di lead; baris manual wajib dicentang F&A.
  if v_req.kind = 'commission' and p_to = 'approved' then
    select string_agg(distinct s.number, ', ') into v_extra
      from jsonb_array_elements(v_req.data->'lines') l
      join sales_leads s on s.id::text = l->>'lead_id'
     where s.paid_on is null;
    if v_extra is not null then
      raise exception 'Penjualan % belum lunas. Finance menandai Lunas di halaman Penjualan dulu.', v_extra;
    end if;
    if exists (select 1 from jsonb_array_elements(v_req.data->'lines') l where nullif(l->>'lead_id', '') is null) then
      if not coalesce((p_data->>'sales_paid')::boolean, false) then
        raise exception 'Centang "Penjualan sudah lunas" sebelum menerima klaim komisi.';
      end if;
      v_extra := 'Penjualan dikonfirmasi lunas oleh F&A.';
    else
      v_extra := 'Penjualan lunas (tercatat di modul Penjualan).';
    end if;
    v_patch := jsonb_build_object('sales_paid', true, 'sales_paid_by', v_me, 'sales_paid_at', now());
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
     and ((v_req.kind = 'payment' and v_req.amount >= 5000000) or v_req.kind = 'aqua_plan') then
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
