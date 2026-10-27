-- 012: Penjualan teknologi (lead -> purna jual), stok (supply & demand), manajemen aset.
-- Lihat docs/fase-2-3/07-penjualan-aset.md. Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Alur reimburse, permintaan pembayaran, dinas, dan pengadaan tidak berubah.
--
-- Klaim komisi (migrasi 011) sekarang boleh mengambil baris dari penjualan (data.lines[].lead_id):
-- isi baris diambil dari lead, pengklaim = pemilik kode referral (atau PIC sales bila tanpa referral),
-- satu penjualan hanya bisa diklaim sekali, dan syarat "lunas" baris itu = status Lunas yang dicatat
-- Finance di modul Penjualan. Baris tanpa lead tetap dicentang manual oleh F&A seperti sebelumnya.

-- ---------- A. Notifikasi: jenis baru (penjualan, aset) + tautan halaman ----------
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'delegation', 'deadline', 'request', 'sla', 'sales', 'asset'));
alter table notifications add column link text;

-- Hanya dipakai fungsi lain di database (tidak bisa dipanggil langsung dari aplikasi).
create function notify_people(p_ids uuid[], p_kind text, p_title text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (employee_id, kind, title, link, actor_id)
  select distinct x, p_kind, p_title, p_link, me()
    from unnest(p_ids) x
   where x is not null and x is distinct from me()
$$;
revoke execute on function notify_people(uuid[], text, text, text) from public, anon, authenticated;

-- Karyawan aktif satu departemen (opsional: head saja).
create function dept_people(p_dept text, p_heads_only boolean default false) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from employees
   where is_active and dept_code = p_dept and (not p_heads_only or app_role = 'head')
$$;

-- Pengelola penjualan: head BDS (CMO), CEO, admin.
create function is_sales_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((my_role() = 'head' and my_dept() = 'BDS') or my_role() in ('ceo', 'admin'), false)
$$;

-- ---------- B. Penjualan: lead sampai purna jual ----------
create function lead_stage_rank(s text) returns int
language sql immutable as $$
  select array_position(array['lead', 'contacted', 'site_visit', 'stock_checked', 'quotation', 'quotation_approved',
                              'negotiation', 'contract', 'won', 'paid', 'work_order', 'installed', 'feedback'], s)
$$;

create function lead_stage_label(s text) returns text
language sql immutable as $$
  select case s
    when 'lead'               then 'Lead masuk'
    when 'contacted'          then 'Kontak awal'
    when 'site_visit'         then 'Site visit'
    when 'stock_checked'      then 'Stok dicek'
    when 'quotation'          then 'Quotation'
    when 'quotation_approved' then 'Disetujui CMO'
    when 'negotiation'        then 'Negosiasi'
    when 'contract'           then 'Kontrak'
    when 'won'                then 'Closing (Sales Order)'
    when 'paid'               then 'Lunas'
    when 'work_order'         then 'Work order'
    when 'installed'          then 'Terpasang (BAST)'
    when 'feedback'           then 'Feedback customer'
    when 'lost'               then 'Gagal'
    else s end
$$;

create table sales_leads (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,                                         -- LD-2026-001
  lead_date     date not null default (now() at time zone 'Asia/Jakarta')::date,
  source        text not null check (source in ('dm', 'referral', 'event', 'visit', 'other')),
  referral_code text,
  referral_id   uuid references employees,
  customer      text not null check (length(trim(customer)) > 0),
  contact       text,                                                -- no. HP / kontak customer
  location      text,
  product_code  text,                                                -- products.code
  units         int not null default 1 check (units >= 1),
  value         bigint not null default 0 check (value >= 0),        -- nilai penjualan (Rp, excl. VAT)
  sales_id      uuid not null references employees default me(),     -- PIC sales
  notes         text,
  stage         text not null default 'lead' check (stage in ('lead', 'contacted', 'site_visit', 'stock_checked',
                  'quotation', 'quotation_approved', 'negotiation', 'contract', 'won', 'paid', 'work_order',
                  'installed', 'feedback', 'lost')),
  stage_since   timestamptz not null default now(),
  lost_reason   text,
  so_number     text,                                                -- No. Sales Order / invoice / kontrak
  closed_on     date,
  paid_on       date,
  paid_by       uuid references employees,
  installed_on  date,
  created_by    uuid references employees default me(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on sales_leads (stage);
create index on sales_leads (sales_id);
create index on sales_leads (referral_id);

create table sales_lead_events (
  id          bigserial primary key,
  lead_id     uuid not null references sales_leads on delete cascade,
  actor       uuid references employees,
  action      text not null check (action in ('create', 'stage', 'note', 'complaint')),
  from_stage  text,
  to_stage    text,
  note        text,
  created_at  timestamptz not null default now()
);
create index on sales_lead_events (lead_id, created_at);

-- Nomor otomatis, kode referral, dan perlindungan kolom alur (tahap, closing, lunas hanya lewat fungsi).
-- Bukan security definer: current_user dipakai untuk membedakan aplikasi dari fungsi alur.
create function prepare_sales_lead() returns trigger
language plpgsql set search_path = public as $$
declare
  v_year text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_api  boolean := current_user in ('authenticated', 'anon');
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
        new.product_code := old.product_code;
        new.units := old.units;
        new.value := old.value;
        new.referral_code := old.referral_code;
      end if;
    end if;
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

create trigger trg_sales_lead_prepare
before insert or update on sales_leads
for each row execute function prepare_sales_lead();

create function after_sales_lead_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into sales_lead_events (lead_id, actor, action, to_stage) values (new.id, me(), 'create', new.stage);
  if new.referral_id is not null then
    perform notify_people(array[new.referral_id], 'sales',
      new.number || ' · Lead baru dengan kode referral Anda: ' || new.customer, '/penjualan/' || new.id);
  end if;
  perform notify_people(array[new.sales_id], 'sales',
    new.number || ' · Anda menjadi PIC sales lead: ' || new.customer, '/penjualan/' || new.id);
  return new;
end $$;

create trigger trg_sales_lead_created
after insert on sales_leads
for each row execute function after_sales_lead_insert();

alter table sales_leads       enable row level security;
alter table sales_lead_events enable row level security;

-- Semua karyawan melihat pipeline (transparansi). Siapa pun boleh mencatat lead (mis. dari referral).
create policy read_sales_leads on sales_leads for select using (me() is not null);
create policy insert_sales_leads on sales_leads for insert with check (me() is not null);
-- Data lead diubah PIC sales, pencatat, head BDS, CEO, admin. Tahap hanya lewat change_lead_stage.
create policy update_sales_leads on sales_leads for update
  using (sales_id = me() or created_by = me() or is_sales_manager())
  with check (me() is not null);
create policy read_sales_lead_events on sales_lead_events for select using (me() is not null);

-- ---------- C. Stok (supply & demand) ----------
create table stock_items (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z0-9-]+$'),
  name         text not null check (length(trim(name)) > 0),
  product_code text,                                   -- penghubung ke produk (kebutuhan pipeline & work order)
  unit         text not null default 'unit',
  min_qty      int not null default 0 check (min_qty >= 0),
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Satu produk hanya terhubung ke satu barang stok aktif.
create unique index on stock_items (product_code) where product_code is not null and is_active;

-- qty positif = masuk, negatif = keluar. Koreksi lewat penyesuaian (opname), bukan menghapus.
create table stock_moves (
  id         bigserial primary key,
  item_id    uuid not null references stock_items on delete cascade,
  kind       text not null check (kind in ('in', 'out', 'adjust')),   -- masuk / keluar / penyesuaian opname
  qty        int not null check (qty <> 0 and (kind <> 'in' or qty > 0) and (kind <> 'out' or qty < 0)),
  moved_on   date not null default (now() at time zone 'Asia/Jakarta')::date,
  reference  text,                                                     -- No. PR/PO/GRN, No. lead, dll.
  lead_id    uuid references sales_leads,
  note       text,
  actor      uuid references employees default me(),
  created_at timestamptz not null default now()
);
create index on stock_moves (item_id, moved_on);

create function prepare_stock_item() returns trigger
language plpgsql set search_path = public as $$
begin
  new.code := upper(trim(new.code));
  new.product_code := nullif(trim(coalesce(new.product_code, '')), '');
  if new.product_code is not null and not exists (select 1 from products where code = new.product_code) then
    raise exception 'Produk tidak dikenal.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_stock_item_prepare
before insert or update on stock_items
for each row execute function prepare_stock_item();

create function prepare_stock_move() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.actor := me();
    new.lead_id := null;
  end if;
  if new.moved_on > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal mutasi stok tidak boleh di masa depan.';
  end if;
  if new.kind = 'adjust' and nullif(trim(coalesce(new.note, '')), '') is null then
    raise exception 'Tuliskan alasan penyesuaian (hasil stock opname).';
  end if;
  return new;
end $$;

create trigger trg_stock_move_prepare
before insert on stock_moves
for each row execute function prepare_stock_move();

alter table stock_items enable row level security;
alter table stock_moves enable row level security;
create policy read_stock_items on stock_items for select using (me() is not null);
create policy write_stock_items on stock_items for all
  using (is_techops() or is_request_reviewer()) with check (is_techops() or is_request_reviewer());
create policy read_stock_moves on stock_moves for select using (me() is not null);
create policy insert_stock_moves on stock_moves for insert with check (is_techops() or is_request_reviewer());

-- Stok tersedia vs kebutuhan pipeline (lead di tahap quotation sampai lunas, belum work order).
create function stock_overview() returns table (item_id uuid, on_hand bigint, demand bigint)
language sql stable set search_path = public as $$
  select i.id,
         coalesce((select sum(m.qty) from stock_moves m where m.item_id = i.id), 0)::bigint,
         coalesce((select sum(l.units) from sales_leads l
                    where i.product_code is not null and l.product_code = i.product_code
                      and l.stage in ('quotation', 'quotation_approved', 'negotiation', 'contract', 'won', 'paid')), 0)::bigint
    from stock_items i
$$;

-- ---------- D. Alur tahap penjualan ----------
-- Urutan: lead -> kontak -> site visit -> stok dicek -> quotation -> (disetujui CMO) -> negosiasi -> (kontrak)
--         -> closing/SO -> lunas (Finance) -> work order (stok keluar otomatis) -> terpasang -> feedback.
-- Sebelum closing, PIC sales boleh melompat maju; head BDS/CEO/admin boleh memundurkan (wajib alasan).
-- "Gagal" wajib alasan dan hanya sebelum lunas; head BDS/CEO/admin boleh membuka lagi.
create function change_lead_stage(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
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
    if v_lead.product_code is null or v_lead.value <= 0 then
      raise exception 'Lengkapi produk, jumlah unit, dan nilai penjualan di data lead dulu (tombol Ubah data).';
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
    select * into v_item from stock_items
     where product_code = v_lead.product_code and is_active order by created_at limit 1;
    if found then
      insert into stock_moves (item_id, kind, qty, moved_on, reference, lead_id, note, actor)
      values (v_item.id, 'out', -v_lead.units, v_today, v_lead.number, p_id, 'Work order instalasi ' || v_lead.customer, v_me);
      v_extra := 'Stok keluar otomatis: ' || v_lead.units || ' ' || v_item.unit || ' ' || v_item.name;
    else
      v_extra := 'Belum ada barang stok untuk produk ini; stok tidak dikurangi otomatis.';
    end if;
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

-- Catatan / keluhan customer pada lead. Keluhan diteruskan ke TechOps.
create function add_lead_note(p_id uuid, p_note text, p_complaint boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lead sales_leads;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if me() is null then raise exception 'Akses ditolak.'; end if;
  if v_note is null then raise exception 'Catatan kosong.'; end if;
  select * into v_lead from sales_leads where id = p_id;
  if not found then raise exception 'Lead tidak ditemukan.'; end if;
  insert into sales_lead_events (lead_id, actor, action, note)
  values (p_id, me(), case when p_complaint then 'complaint' else 'note' end, v_note);
  if p_complaint then
    perform notify_people(array[v_lead.sales_id] || dept_people('TO'), 'sales',
      v_lead.number || ' · Keluhan customer: ' || v_lead.customer, '/penjualan/' || p_id);
  else
    perform notify_people(array[v_lead.sales_id], 'sales',
      v_lead.number || ' · Catatan baru: ' || v_lead.customer, '/penjualan/' || p_id);
  end if;
end $$;

-- Klaim komisi yang memakai penjualan tertentu (selain yang ditolak). Dipakai halaman lead & form klaim.
create function lead_commission_claims(p_ids uuid[])
returns table (lead_id uuid, request_id uuid, number text, status text, requester_name text)
language sql stable security definer set search_path = public as $$
  select s.id, r.id, r.number, r.status, e.full_name
    from requests r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data->'lines') = 'array' then r.data->'lines' else '[]' end) l
    join sales_leads s on s.id::text = l->>'lead_id'
    join employees e on e.id = r.requester_id
   where me() is not null and r.kind = 'commission' and r.status <> 'rejected' and s.id = any(p_ids)
$$;

-- ---------- E. Manajemen aset ----------
create table assets (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,                                   -- AST-2026-001, diberi saat registrasi
  name               text not null check (length(trim(name)) > 0),
  category           text not null check (category in ('ebii', 'smart_energy', 'aerator', 'solar', 'tools', 'other')),
  status             text not null default 'received' check (status in ('received', 'registered', 'placed', 'damaged',
                       'lost', 'disposal_proposed', 'disposed')),
  status_since       timestamptz not null default now(),
  received_on        date not null default (now() at time zone 'Asia/Jakarta')::date,  -- tanggal BAST / perolehan
  location           text,
  holder             text,                                          -- penerima / penanggung jawab
  value              bigint check (value >= 0),                     -- nilai perolehan (Rp)
  useful_life_months int check (useful_life_months > 0),            -- umur manfaat untuk penyusutan
  reference          text,                                          -- No. PO/GRN/BAST atau link
  lead_id            uuid references sales_leads,                   -- penempatan di lokasi klien
  notes              text,
  registered_on      date,
  prev_status        text,                                          -- status sebelum diusulkan dihapus
  disposal_ceo_by    uuid references employees,
  disposal_ceo_at    timestamptz,
  disposal_fa_by     uuid references employees,
  disposal_fa_at     timestamptz,
  created_by         uuid references employees default me(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on assets (status);

create table asset_events (
  id          bigserial primary key,
  asset_id    uuid not null references assets on delete cascade,
  actor       uuid references employees,
  action      text not null check (action in ('create', 'status', 'maintenance', 'opname', 'note')),
  from_status text,
  to_status   text,
  note        text,
  done_on     date,
  created_at  timestamptz not null default now()
);
create index on asset_events (asset_id, created_at);

-- Kolom alur (status, kode, persetujuan penghapusan) hanya diubah lewat change_asset_status.
create function prepare_asset() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.status := 'received';
      new.status_since := now();
      new.code := null;
      new.registered_on := null;
      new.prev_status := null;
      new.disposal_ceo_by := null;
      new.disposal_ceo_at := null;
      new.disposal_fa_by := null;
      new.disposal_fa_at := null;
      new.created_by := me();
    else
      new.status := old.status;
      new.status_since := old.status_since;
      new.code := old.code;
      new.registered_on := old.registered_on;
      new.prev_status := old.prev_status;
      new.disposal_ceo_by := old.disposal_ceo_by;
      new.disposal_ceo_at := old.disposal_ceo_at;
      new.disposal_fa_by := old.disposal_fa_by;
      new.disposal_fa_at := old.disposal_fa_at;
      new.created_by := old.created_by;
    end if;
  end if;
  if new.received_on > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal serah terima tidak boleh di masa depan.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_asset_prepare
before insert or update on assets
for each row execute function prepare_asset();

create function after_asset_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into asset_events (asset_id, actor, action, to_status) values (new.id, me(), 'create', new.status);
  perform notify_people(dept_people('FA'), 'asset', 'Aset baru perlu registrasi (maks. 5 hari kerja): ' || new.name,
                        '/aset/' || new.id);
  return new;
end $$;

create trigger trg_asset_created
after insert on assets
for each row execute function after_asset_insert();

alter table assets       enable row level security;
alter table asset_events enable row level security;
create policy read_assets on assets for select using (me() is not null);
create policy insert_assets on assets for insert with check (is_techops() or is_request_reviewer());
create policy update_assets on assets for update
  using (is_techops() or is_request_reviewer()) with check (is_techops() or is_request_reviewer());
create policy read_asset_events on asset_events for select using (me() is not null);

-- Alur status aset:
--   diterima (TO) -> terdaftar (Finance: kode, lokasi, nilai) -> ditempatkan (TO: penerima, lokasi)
--   rusak / hilang: dilaporkan siapa saja (wajib keterangan); TO mengembalikan ke terdaftar setelah beres
--   usul hapus (siapa saja, wajib alasan) -> dihapus setelah CEO DAN Head F&A menyetujui; salah satu boleh menolak.
create function change_asset_status(p_id uuid, p_to text, p_note text default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := me();
  v_a     assets;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_to    boolean := is_techops();
  v_fin   boolean := is_request_reviewer();
  v_ceo   boolean := my_role() in ('ceo', 'admin');
  v_fa    boolean := is_fa_head();
  v_ok    boolean := false;
  v_new   text := p_to;
  v_year  text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY');
  v_code  text;
  v_extra text;
  v_value bigint;
  v_life  int;
  v_loc   text;
  v_holder text;
  v_lead  uuid;
  v_link  text := '/aset/' || p_id;
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  select * into v_a from assets where id = p_id for update;
  if not found then raise exception 'Aset tidak ditemukan.'; end if;

  v_ok := case p_to
    when 'registered'        then (v_fin and v_a.status = 'received') or (v_to and v_a.status in ('placed', 'damaged', 'lost'))
    when 'placed'            then v_to and v_a.status in ('registered', 'damaged')
    when 'damaged'           then v_a.status in ('registered', 'placed')
    when 'lost'              then v_a.status in ('registered', 'placed', 'damaged')
    when 'disposal_proposed' then v_a.status in ('registered', 'placed', 'damaged', 'lost')
    when 'disposed'          then (v_ceo or v_fa) and v_a.status = 'disposal_proposed'
    when 'disposal_rejected' then (v_ceo or v_fa) and v_a.status = 'disposal_proposed'
    else false end;
  if not coalesce(v_ok, false) then
    raise exception 'Status aset tidak bisa diubah ke "%".', p_to;
  end if;
  if (p_to in ('damaged', 'lost', 'disposal_proposed', 'disposal_rejected')
      or (p_to = 'registered' and v_a.status <> 'received')) and v_note is null then
    raise exception 'Keterangan/alasan wajib diisi.';
  end if;

  if p_to = 'registered' and v_a.status = 'received' then
    begin
      v_value := (p_data->>'value')::bigint;
      v_life := nullif(p_data->>'useful_life_months', '')::int;
    exception when others then
      raise exception 'Nilai aset atau umur manfaat tidak valid.';
    end;
    v_loc := nullif(trim(coalesce(p_data->>'location', '')), '');
    if v_value is null or v_value < 0 then raise exception 'Nilai perolehan aset wajib diisi.'; end if;
    if v_loc is null then raise exception 'Lokasi aset wajib diisi.'; end if;
    if v_life is not null and v_life <= 0 then raise exception 'Umur manfaat harus lebih dari 0 bulan.'; end if;
    perform pg_advisory_xact_lock(hashtext('asset-code:' || v_year));
    select 'AST-' || v_year || '-' || lpad((coalesce(max(split_part(code, '-', 3)::int), 0) + 1)::text, 3, '0')
      into v_code
      from assets where code like 'AST-' || v_year || '-%';
    update assets
       set code = v_code, value = v_value, useful_life_months = v_life, location = v_loc,
           registered_on = (now() at time zone 'Asia/Jakarta')::date
     where id = p_id;
    v_extra := 'Kode aset ' || v_code || ' · lokasi ' || v_loc || ' · Rp' ||
               replace(to_char(v_value, 'FM999G999G999G999'), ',', '.');
  elsif p_to = 'placed' then
    v_holder := nullif(trim(coalesce(p_data->>'holder', '')), '');
    v_loc := nullif(trim(coalesce(p_data->>'location', '')), '');
    if v_holder is null or v_loc is null then raise exception 'Isi penerima dan lokasi penempatan.'; end if;
    begin
      v_lead := nullif(p_data->>'lead_id', '')::uuid;
    exception when others then v_lead := null;
    end;
    update assets
       set holder = v_holder, location = v_loc, lead_id = coalesce(v_lead, lead_id),
           reference = coalesce(nullif(trim(coalesce(p_data->>'reference', '')), ''), reference)
     where id = p_id;
    v_extra := 'Ditempatkan di ' || v_loc || ' · penerima ' || v_holder;
  elsif p_to = 'disposal_proposed' then
    update assets
       set prev_status = v_a.status, disposal_ceo_by = null, disposal_ceo_at = null,
           disposal_fa_by = null, disposal_fa_at = null
     where id = p_id;
  elsif p_to = 'disposal_rejected' then
    v_new := coalesce(v_a.prev_status, 'registered');
    v_extra := 'Usulan penghapusan ditolak.';
    update assets
       set disposal_ceo_by = null, disposal_ceo_at = null, disposal_fa_by = null, disposal_fa_at = null
     where id = p_id;
  elsif p_to = 'disposed' then
    -- Persetujuan CEO dan Head F&A dicatat terpisah; aset dihapus setelah keduanya setuju.
    if my_role() = 'ceo' or (my_role() = 'admin' and v_a.disposal_ceo_by is null) then
      if v_a.disposal_ceo_by is not null then raise exception 'CEO sudah menyetujui penghapusan ini.'; end if;
      update assets set disposal_ceo_by = v_me, disposal_ceo_at = now() where id = p_id;
      v_extra := 'Penghapusan disetujui CEO.';
    else
      if v_a.disposal_fa_by is not null then raise exception 'Head F&A sudah menyetujui penghapusan ini.'; end if;
      update assets set disposal_fa_by = v_me, disposal_fa_at = now() where id = p_id;
      v_extra := 'Penghapusan disetujui Head F&A.';
    end if;
    select * into v_a from assets where id = p_id;
    if v_a.disposal_ceo_by is null or v_a.disposal_fa_by is null then
      v_new := 'disposal_proposed';
    else
      v_extra := v_extra || ' Aset dikeluarkan dari pembukuan.';
    end if;
  end if;

  if v_new <> v_a.status then
    update assets set status = v_new, status_since = now() where id = p_id;
  end if;
  insert into asset_events (asset_id, actor, action, from_status, to_status, note)
  values (p_id, v_me, 'status', v_a.status, v_new, nullif(concat_ws(E'\n', v_extra, v_note), ''));

  if p_to in ('damaged', 'lost') then
    perform notify_people(dept_people('TO'), 'asset',
      coalesce(v_a.code, 'Aset') || ' · Dilaporkan ' || case p_to when 'damaged' then 'rusak' else 'hilang' end ||
      ': ' || v_a.name, v_link);
  elsif p_to = 'disposal_proposed' then
    perform notify_people(dept_people('FA', true) ||
                          array(select id from employees where is_active and app_role = 'ceo'), 'asset',
      coalesce(v_a.code, 'Aset') || ' · Usulan penghapusan perlu persetujuan: ' || v_a.name, v_link);
  elsif v_new = 'disposed' then
    perform notify_people(dept_people('FA') || array[v_a.created_by], 'asset',
      coalesce(v_a.code, 'Aset') || ' · Aset dihapus dari pembukuan: ' || v_a.name, v_link);
  end if;
end $$;

-- Log pemeliharaan & stock opname (TechOps / Finance) atau catatan (siapa saja).
create function add_asset_log(p_id uuid, p_action text, p_note text, p_done_on date default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_date date := coalesce(p_done_on, (now() at time zone 'Asia/Jakarta')::date);
begin
  if me() is null then raise exception 'Akses ditolak.'; end if;
  if p_action not in ('maintenance', 'opname', 'note') then raise exception 'Jenis catatan tidak dikenal.'; end if;
  if p_action <> 'note' and not (is_techops() or is_request_reviewer()) then
    raise exception 'Hanya TechOps / Finance yang mencatat pemeliharaan dan stock opname.';
  end if;
  if v_note is null then raise exception 'Keterangan wajib diisi.'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan.'; end if;
  if not exists (select 1 from assets where id = p_id) then raise exception 'Aset tidak ditemukan.'; end if;
  insert into asset_events (asset_id, actor, action, note, done_on)
  values (p_id, me(), p_action, v_note, case when p_action = 'note' then null else v_date end);
end $$;

-- ---------- F. Klaim komisi dari penjualan (menggantikan versi 011) ----------
-- Baris dengan lead_id: customer, no. SO, tanggal closing, produk, unit, nilai, dan kode referral diambil dari lead.
-- Lead harus sudah closing, belum pernah diklaim, dan diklaim oleh pemilik kode referral (atau PIC sales bila
-- tanpa referral). Justifikasi boleh kosong untuk baris dari lead.
create or replace function prepare_commission_claim() returns trigger
language plpgsql set search_path = public as $$
declare
  v_out   jsonb := '[]';
  v_line  jsonb;
  v_i     int := 0;
  v_p     products;
  v_ref   employees;
  v_lead  sales_leads;
  v_owner uuid;
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

    v_lead := null;
    if nullif(v_line->>'lead_id', '') is not null then
      select * into v_lead from sales_leads where id::text = v_line->>'lead_id';
      if v_lead.id is null then raise exception 'Baris %: penjualan tidak ditemukan.', v_i; end if;
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
      if exists (select 1 from jsonb_array_elements(v_out) o where o->>'lead_id' = v_lead.id::text) then
        raise exception 'Baris %: penjualan % dimasukkan dua kali.', v_i, v_lead.number;
      end if;
      v_line := v_line || jsonb_build_object(
        'customer', v_lead.customer,
        'invoice', v_lead.so_number,
        'closing_date', v_lead.closed_on,
        'product_code', v_lead.product_code,
        'units', v_lead.units,
        'sales_total', v_lead.value,
        'referral_code', v_lead.referral_code);
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
    if v_lead.id is null and coalesce(v_line->>'justification', '') !~* '^https?://' then
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
      select * into v_ref from employees where referral_code = v_code and (is_active or v_lead.id is not null);
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

-- ---------- G. Fungsi alur pengajuan (menggantikan versi 011) ----------
-- Satu-satunya perubahan: syarat "lunas" klaim komisi. Baris dari penjualan harus berstatus Lunas di modul
-- Penjualan; baris manual tetap wajib dicentang F&A (p_data.sales_paid).

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
  -- Klaim komisi: diterima hanya bila penjualan sudah lunas. Baris dari modul Penjualan memakai status Lunas
  -- yang dicatat Finance di lead; baris manual wajib dicentang F&A.
  if v_req.kind = 'commission' and p_to = 'approved' then
    select string_agg(s.number, ', ') into v_extra
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
