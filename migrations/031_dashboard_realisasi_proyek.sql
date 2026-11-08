-- 031: Dashboard realisasi proyek (Project Management > Dashboard realisasi).
-- Satu dashboard untuk semua proyek: anggaran (baris RAB) vs realisasi, laba rugi, jurnal transaksi, stok proyek,
-- dan akses hanya-baca untuk investor lewat kode khusus (tanpa login karyawan).
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run. Tidak mengubah data lain.
--
-- Hak akses:
-- - Semua karyawan melihat semua anggaran, jurnal, dan stok proyek (sama dengan data proyek).
-- - Pencatat (tambah/ubah/hapus anggaran, jurnal, stok): tim AQ, F&A, admin, CEO, dan PIC proyek itu.
-- - Kode investor dibuat/dicabut oleh tim AQ, admin, CEO, dan PIC proyek. Database hanya menyimpan sidik (hash) kode.
-- - Investor TIDAK membaca tabel. Server aplikasi memanggil investor_dashboard(kode) dengan kunci server;
--   fungsi itu hanya mengembalikan data proyek milik kode tersebut (tanpa catatan internal, bukti, dan nama pencatat).

create extension if not exists pgcrypto with schema extensions;

-- ---------- A. Pembantu hak akses ----------
create function can_edit_project_ledger(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_aqua_editor() or can_record_revenue()
                  or exists (select 1 from aqua_projects where id = p and pic_id = me()), false)
$$;

create function can_manage_project_access(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_aqua_editor() or exists (select 1 from aqua_projects where id = p and pic_id = me()), false)
$$;

-- Riwayat proyek: catatan perubahan anggaran/jurnal ('ledger') dan kode investor ('access').
alter table aqua_project_events drop constraint aqua_project_events_action_check;
alter table aqua_project_events add constraint aqua_project_events_action_check
  check (action in ('create', 'edit', 'stage', 'plan', 'note', 'report', 'income', 'ledger', 'access'));

-- ---------- B. Anggaran (baris RAB) ----------
-- kind: capex (investasi awal), expense (biaya), income (target pendapatan).
create table project_budget_lines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references aqua_projects on delete cascade,
  kind        text not null default 'expense' check (kind in ('capex', 'expense', 'income')),
  grp         text not null check (length(trim(grp)) > 0),          -- kelompok, mis. "Pengemasan", "Opex"
  item        text not null check (length(trim(item)) > 0),
  note        text,
  qty         numeric(14,3) not null default 1 check (qty >= 0),
  uom         text,
  price       numeric(16,2) not null default 0 check (price >= 0),
  amount      bigint generated always as (round(qty * price)::bigint) stored,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index on project_budget_lines (project_id, sort);

-- Perubahan anggaran tercatat di riwayat proyek (tambah banyak pos sekaligus = satu catatan).
create function log_project_budget_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into aqua_project_events (project_id, actor, action, note)
  select project_id, me(), 'ledger',
         case when count(*) = 1 then 'Anggaran: menambah "' || min(item) || '"' else 'Anggaran: menambah ' || count(*) || ' pos' end
    from new_rows group by project_id;
  return null;
end $$;

create trigger trg_project_budget_log_insert
after insert on project_budget_lines referencing new table as new_rows
for each statement execute function log_project_budget_insert();

create function log_project_budget_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    insert into aqua_project_events (project_id, actor, action, note, amount)
    values (new.project_id, me(), 'ledger', 'Anggaran: mengubah "' || new.item || '"'
            || case when new.amount <> old.amount then ' · Rp' || old.amount || ' → Rp' || new.amount else '' end, new.amount);
  elsif exists (select 1 from aqua_projects where id = old.project_id) then
    insert into aqua_project_events (project_id, actor, action, note, amount)
    values (old.project_id, me(), 'ledger', 'Anggaran: menghapus "' || old.item || '"', old.amount);
  end if;
  return null;
end $$;

create trigger trg_project_budget_log_change
after update or delete on project_budget_lines
for each row execute function log_project_budget_change();

-- ---------- C. Jurnal transaksi (realisasi) ----------
-- kind: income (pendapatan), expense (biaya operasional), capex (investasi awal/peralatan),
--       capital_in (modal masuk dari investor/perusahaan; bukan pendapatan).
create table project_transactions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references aqua_projects on delete cascade,
  tx_date        date not null,
  kind           text not null check (kind in ('income', 'expense', 'capex', 'capital_in')),
  category       text not null check (length(trim(category)) > 0),
  budget_line_id uuid references project_budget_lines on delete set null,   -- kosong = di luar anggaran
  description    text not null check (length(trim(description)) > 0),
  qty            numeric(14,3) check (qty > 0),
  uom            text,
  unit_price     numeric(16,2) check (unit_price >= 0),
  amount         bigint not null check (amount > 0),
  cycle          int check (cycle > 0),                                     -- budidaya: siklus ke-
  pond           text,                                                      -- budidaya: ID kolam
  kg_per_sack    numeric(10,3) check (kg_per_sack > 0),                     -- pakan: kg per sak
  fish_per_kg    numeric(10,3) check (fish_per_kg > 0),                     -- panen: ekor per kg
  status         text not null default 'paid' check (status in ('paid', 'unpaid')),
  proof          text,                                                      -- link bukti
  note           text,                                                      -- catatan internal
  created_by     uuid references employees default me(),
  created_at     timestamptz not null default now(),
  updated_by     uuid references employees,
  updated_at     timestamptz not null default now()
);
create index on project_transactions (project_id, tx_date);

create function prepare_project_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_line project_budget_lines;
begin
  if new.qty is not null and new.unit_price is not null then
    new.amount := round(new.qty * new.unit_price)::bigint;
  end if;
  if new.budget_line_id is not null then
    select * into v_line from project_budget_lines where id = new.budget_line_id;
    if not found or v_line.project_id <> new.project_id then
      raise exception 'Pos anggaran bukan milik proyek ini.';
    end if;
  end if;
  new.category := trim(new.category);
  new.description := trim(new.description);
  new.uom := nullif(trim(coalesce(new.uom, '')), '');
  new.pond := nullif(trim(coalesce(new.pond, '')), '');
  new.proof := nullif(trim(coalesce(new.proof, '')), '');
  new.note := nullif(trim(coalesce(new.note, '')), '');
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := me();
    new.updated_at := now();
  else
    new.created_by := coalesce(me(), new.created_by);
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger trg_project_transaction_prepare
before insert or update on project_transactions
for each row execute function prepare_project_transaction();

-- Setiap tambah/ubah/hapus transaksi tercatat di riwayat proyek.
create function log_project_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rp text;
begin
  if tg_op = 'INSERT' then
    insert into aqua_project_events (project_id, actor, action, note, amount)
    values (new.project_id, me(), 'ledger', 'Jurnal: menambah "' || new.description || '" (' || to_char(new.tx_date, 'DD-MM-YYYY') || ')', new.amount);
  elsif tg_op = 'UPDATE' then
    v_rp := case when new.amount <> old.amount then ' · Rp' || old.amount || ' → Rp' || new.amount else '' end;
    insert into aqua_project_events (project_id, actor, action, note, amount)
    values (new.project_id, me(), 'ledger', 'Jurnal: mengubah "' || new.description || '"' || v_rp, new.amount);
  elsif exists (select 1 from aqua_projects where id = old.project_id) then   -- bukan karena proyeknya dihapus
    insert into aqua_project_events (project_id, actor, action, note, amount)
    values (old.project_id, me(), 'ledger', 'Jurnal: menghapus "' || old.description || '" (' || to_char(old.tx_date, 'DD-MM-YYYY') || ')', old.amount);
  end if;
  return null;
end $$;

create trigger trg_project_transaction_log
after insert or update or delete on project_transactions
for each row execute function log_project_transaction();

-- ---------- D. Stok proyek ----------
-- kind: material (bahan baku, mis. kg per rasa) / product (produk jadi, mis. toples per varian).
create table project_stock_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references aqua_projects on delete cascade,
  kind        text not null check (kind in ('material', 'product')),
  name        text not null check (length(trim(name)) > 0),   -- mis. "Original"
  size        text,                                           -- mis. "50g"
  unit        text not null default 'unit',                   -- kg / toples
  plan_qty    numeric(14,3) not null default 0 check (plan_qty >= 0),
  sale_price  bigint not null default 0 check (sale_price >= 0),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index on project_stock_items (project_id, sort);

-- kind: in (bahan masuk), pack (packing: toples jadi + kg bahan terpakai), sold, sample, damaged, return,
--       adjust (opname; qty boleh minus). qty selain adjust selalu positif.
create table project_stock_moves (
  id               bigserial primary key,
  project_id       uuid not null references aqua_projects on delete cascade,
  item_id          uuid not null references project_stock_items on delete cascade,
  move_date        date not null,
  kind             text not null check (kind in ('in', 'pack', 'sold', 'sample', 'damaged', 'return', 'adjust')),
  qty              numeric(14,3) not null check (qty <> 0 and (kind = 'adjust' or qty > 0)),
  material_item_id uuid references project_stock_items on delete set null,  -- packing: bahan yang dipakai
  material_qty     numeric(14,3) check (material_qty > 0),
  channel          text,                                                    -- channel / pelanggan
  reference        text,                                                    -- no. ref / invoice
  transaction_id   uuid references project_transactions on delete set null, -- terjual: pemasukan di jurnal
  note             text,
  created_by       uuid references employees default me(),
  created_at       timestamptz not null default now()
);
create index on project_stock_moves (project_id, move_date);

create function prepare_project_stock_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item project_stock_items;
  v_mat  project_stock_items;
begin
  select * into v_item from project_stock_items where id = new.item_id;
  if not found or v_item.project_id <> new.project_id then raise exception 'Barang stok bukan milik proyek ini.'; end if;
  if new.kind = 'in' and v_item.kind <> 'material' then raise exception 'Bahan masuk hanya untuk bahan baku.'; end if;
  if new.kind in ('pack', 'sold', 'sample', 'damaged', 'return') and v_item.kind <> 'product' then
    raise exception 'Packing/terjual/sampel/rusak/retur hanya untuk produk jadi.';
  end if;
  if new.kind = 'pack' then
    if new.material_item_id is null or coalesce(new.material_qty, 0) <= 0 then
      raise exception 'Packing: pilih bahan baku dan isi kg yang terpakai.';
    end if;
    select * into v_mat from project_stock_items where id = new.material_item_id;
    if not found or v_mat.project_id <> new.project_id or v_mat.kind <> 'material' then
      raise exception 'Bahan baku packing tidak valid.';
    end if;
  else
    new.material_item_id := null;
    new.material_qty := null;
  end if;
  new.created_by := coalesce(me(), new.created_by);
  new.created_at := now();
  return new;
end $$;

create trigger trg_project_stock_move_prepare
before insert on project_stock_moves
for each row execute function prepare_project_stock_move();

-- ---------- E. Kode akses investor ----------
create table project_access_codes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references aqua_projects on delete cascade,
  label        text not null check (length(trim(label)) > 0),   -- nama investor / keterangan
  code_hash    text not null unique,                             -- sha256 kode (kode asli tidak disimpan)
  code_hint    text not null,                                    -- 4 karakter terakhir, untuk mengenali
  expires_on   date,
  revoked_at   timestamptz,
  revoked_by   uuid references employees,
  created_by   uuid references employees default me(),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  use_count    int not null default 0
);
create index on project_access_codes (project_id);

-- Percobaan kode (untuk membatasi tebak-tebakan). Tidak bisa dibaca lewat API.
create table investor_code_attempts (
  id         bigserial primary key,
  client     text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index on investor_code_attempts (client, created_at);

create function normalize_access_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create function hash_access_code(p text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(normalize_access_code(p), 'sha256'), 'hex')
$$;

-- Membuat kode baru (15 karakter, tanpa huruf/angka yang mirip: I, L, O, 0, 1). Kode asli hanya dikembalikan sekali.
create function create_project_access_code(p_project uuid, p_label text, p_expires date default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alpha  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 karakter
  v_code   text := '';
  v_bytes  bytea;
  v_b      int;
  v_i      int;
  v_label  text := nullif(trim(coalesce(p_label, '')), '');
  v_p      aqua_projects;
begin
  if not can_manage_project_access(p_project) then
    raise exception 'Kode investor dibuat oleh tim AQ, admin, CEO, atau PIC proyek.';
  end if;
  select * into v_p from aqua_projects where id = p_project;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if v_label is null then raise exception 'Isi nama investor / keterangan kode.'; end if;
  if p_expires is not null and p_expires < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal kedaluwarsa sudah lewat.';
  end if;
  while length(v_code) < 15 loop
    v_bytes := extensions.gen_random_bytes(32);
    for v_i in 0 .. 31 loop
      v_b := get_byte(v_bytes, v_i);
      if v_b < 248 and length(v_code) < 15 then           -- 248 = 31 x 8: tanpa bias
        v_code := v_code || substr(v_alpha, (v_b % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  insert into project_access_codes (project_id, label, code_hash, code_hint, expires_on)
  values (p_project, v_label, hash_access_code(v_code), right(v_code, 4), p_expires);
  insert into aqua_project_events (project_id, actor, action, note)
  values (p_project, me(), 'access', 'Membuat kode investor untuk ' || v_label || ' (…' || right(v_code, 4) || ')');
  return substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5) || '-' || substr(v_code, 11, 5);
end $$;

create function revoke_project_access_code(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c project_access_codes;
begin
  select * into v_c from project_access_codes where id = p_id;
  if not found then raise exception 'Kode tidak ditemukan.'; end if;
  if not can_manage_project_access(v_c.project_id) then
    raise exception 'Kode investor dicabut oleh tim AQ, admin, CEO, atau PIC proyek.';
  end if;
  if v_c.revoked_at is not null then return; end if;
  update project_access_codes set revoked_at = now(), revoked_by = me() where id = p_id;
  insert into aqua_project_events (project_id, actor, action, note)
  values (v_c.project_id, me(), 'access', 'Mencabut kode investor ' || v_c.label || ' (…' || v_c.code_hint || ')');
end $$;

-- Dashboard investor: hanya dipanggil server aplikasi (kunci server). p_client = alamat IP pengunjung.
-- Maks. 10 percobaan salah per 15 menit per alamat. Mengembalikan null bila kode salah/dicabut/kedaluwarsa.
create function investor_dashboard(p_code text, p_client text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client text := left(coalesce(nullif(trim(p_client), ''), 'tanpa-ip'), 100);
  v_c      project_access_codes;
  v_p      aqua_projects;
  v_plan   jsonb;
begin
  if (select count(*) from investor_code_attempts
       where client = v_client and not ok and created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Terlalu banyak percobaan kode. Coba lagi 15 menit lagi.';
  end if;
  delete from investor_code_attempts where created_at < now() - interval '1 day';

  select * into v_c from project_access_codes
   where code_hash = hash_access_code(p_code) and revoked_at is null
     and (expires_on is null or expires_on >= (now() at time zone 'Asia/Jakarta')::date);
  if not found or length(normalize_access_code(p_code)) <> 15 then
    insert into investor_code_attempts (client, ok) values (v_client, false);
    return null;
  end if;
  insert into investor_code_attempts (client, ok) values (v_client, true);
  update project_access_codes set last_used_at = now(), use_count = use_count + 1 where id = v_c.id;

  select * into v_p from aqua_projects where id = v_c.project_id;
  select data->'params' into v_plan from requests where id = v_p.plan_id;

  return jsonb_build_object(
    'label', v_c.label,
    'project', jsonb_build_object(
      'id', v_p.id, 'number', v_p.number, 'type', v_p.type, 'name', v_p.name, 'location', v_p.location,
      'stage', v_p.stage, 'category', v_p.category, 'contract_signed_on', v_p.contract_signed_on,
      'investor_capital', (select coalesce(sum((i->>'capital')::numeric), 0) from jsonb_array_elements(v_p.investors) i),
      'investor_count', jsonb_array_length(v_p.investors),
      'params', coalesce(v_plan, '{}'::jsonb)),
    'budget', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'kind', b.kind, 'grp', b.grp, 'item', b.item, 'note', b.note, 'qty', b.qty, 'uom', b.uom,
        'price', b.price, 'amount', b.amount, 'sort', b.sort) order by b.sort, b.created_at)
      from project_budget_lines b where b.project_id = v_p.id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'tx_date', t.tx_date, 'kind', t.kind, 'category', t.category, 'budget_line_id', t.budget_line_id,
        'description', t.description, 'qty', t.qty, 'uom', t.uom, 'unit_price', t.unit_price, 'amount', t.amount,
        'cycle', t.cycle, 'pond', t.pond, 'kg_per_sack', t.kg_per_sack, 'fish_per_kg', t.fish_per_kg,
        'status', t.status) order by t.tx_date, t.created_at)
      from project_transactions t where t.project_id = v_p.id), '[]'::jsonb),
    'stock_items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'name', s.name, 'size', s.size, 'unit', s.unit, 'plan_qty', s.plan_qty,
        'sale_price', s.sale_price, 'sort', s.sort) order by s.sort, s.name)
      from project_stock_items s where s.project_id = v_p.id), '[]'::jsonb),
    'stock_moves', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'item_id', m.item_id, 'move_date', m.move_date, 'kind', m.kind, 'qty', m.qty,
        'material_item_id', m.material_item_id, 'material_qty', m.material_qty) order by m.move_date, m.id)
      from project_stock_moves m where m.project_id = v_p.id), '[]'::jsonb),
    'updated_at', now()
  );
end $$;

revoke execute on function investor_dashboard(text, text) from public, anon, authenticated;
grant execute on function investor_dashboard(text, text) to service_role;
revoke execute on function create_project_access_code(uuid, text, date) from public, anon;
revoke execute on function revoke_project_access_code(uuid) from public, anon;

-- ---------- F. Aturan akses (RLS) ----------
alter table project_budget_lines   enable row level security;
alter table project_transactions   enable row level security;
alter table project_stock_items    enable row level security;
alter table project_stock_moves    enable row level security;
alter table project_access_codes   enable row level security;
alter table investor_code_attempts enable row level security;   -- tanpa policy: tidak bisa dibaca lewat API

create policy read_project_budget on project_budget_lines for select using ((select me()) is not null);
create policy write_project_budget on project_budget_lines for all
  using (can_edit_project_ledger(project_id)) with check (can_edit_project_ledger(project_id));

create policy read_project_tx on project_transactions for select using ((select me()) is not null);
create policy write_project_tx on project_transactions for all
  using (can_edit_project_ledger(project_id)) with check (can_edit_project_ledger(project_id));

create policy read_project_stock_items on project_stock_items for select using ((select me()) is not null);
create policy write_project_stock_items on project_stock_items for all
  using (can_edit_project_ledger(project_id)) with check (can_edit_project_ledger(project_id));

create policy read_project_stock_moves on project_stock_moves for select using ((select me()) is not null);
create policy insert_project_stock_moves on project_stock_moves for insert with check (can_edit_project_ledger(project_id));
create policy delete_project_stock_moves on project_stock_moves for delete using (can_edit_project_ledger(project_id));

-- Daftar kode (tanpa kode asli) hanya terlihat pengelola akses proyek. Tulis hanya lewat fungsi di atas.
create policy read_project_access_codes on project_access_codes for select using (can_manage_project_access(project_id));
