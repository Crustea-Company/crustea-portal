-- 010: Permohonan pengadaan barang & jasa (kind = 'procurement', nomor PR-..., PO-...)
-- Lihat docs/fase-2-3/05-pengadaan.md. Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run.
-- Tidak menghapus data. Alur reimburse, permintaan pembayaran, dan dinas tidak berubah.
--
-- Alur khusus pengadaan:
--   pemohon          : draft / needs_revision -> submitted ("Menunggu head")
--   head dept pemohon: submitted -> head_approved           (CEO/admin bila pemohon head / dept tanpa head)
--   TechOps (TO)     : head_approved -> vendor_compared     (isi >= 3 vendor + rekomendasi)
--   Finance (FA)     : vendor_compared -> fa_verified       (kelengkapan, anggaran, duplikasi)
--   Head F&A         : fa_verified -> fa_approved           (pilih vendor + metode; >= Rp5 jt -> ceo_review)
--   CEO              : ceo_review -> ceo_approved
--   Finance          : fa_approved / ceo_approved -> po_issued (nomor PO otomatis)
--   TO / pemohon     : po_issued -> received (GRN/BAST/UAT) atau returned (retur); returned -> received
--   Head F&A         : received -> payment_approved         (triple matching PO-GRN-invoice)
--   Finance          : payment_approved -> paid             (tanggal bayar wajib)
--   Finance / TO     : paid -> completed ("Selesai": aset/stok dicatat, catatan wajib)
--   Perlu perbaikan / Ditolak: oleh pihak yang memegang tahap sampai sebelum PO terbit (wajib catatan).

-- ---------- A. Status & jenis lampiran baru ----------
alter table requests drop constraint requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('draft', 'submitted', 'in_review', 'ceo_review', 'assigner_approved', 'st_issued',
                    'head_approved', 'vendor_compared', 'fa_verified', 'fa_approved', 'ceo_approved',
                    'po_issued', 'received', 'returned', 'payment_approved',
                    'approved', 'paid', 'completed', 'needs_revision', 'rejected'));

-- document = dokumen pengadaan (PO, GRN/BAST, invoice) berupa link.
alter table request_files drop constraint request_files_purpose_check;
alter table request_files add constraint request_files_purpose_check
  check (purpose in ('proof', 'transfer', 'report', 'document'));

create or replace function request_status_label(s text) returns text
language sql immutable as $$
  select case s
    when 'draft'             then 'Draf'
    when 'submitted'         then 'Belum di-review'
    when 'in_review'         then 'Sedang di-review'
    when 'ceo_review'        then 'Menunggu CEO'
    when 'assigner_approved' then 'Disetujui penugas'
    when 'st_issued'         then 'Surat tugas terbit'
    when 'head_approved'     then 'Disetujui head'
    when 'vendor_compared'   then 'Vendor dibandingkan'
    when 'fa_verified'       then 'Diverifikasi Finance'
    when 'fa_approved'       then 'Disetujui Head F&A'
    when 'ceo_approved'      then 'Disetujui CEO'
    when 'po_issued'         then 'PO terbit'
    when 'received'          then 'Barang/jasa diterima'
    when 'returned'          then 'Diretur'
    when 'payment_approved'  then 'Pembayaran disetujui'
    when 'approved'          then 'Diterima'
    when 'paid'              then 'Ditransfer'
    when 'completed'         then 'Selesai'
    when 'needs_revision'    then 'Perlu perbaikan'
    when 'rejected'          then 'Ditolak'
    else s end
$$;

create or replace function request_status_label(s text, k text) returns text
language sql immutable as $$
  select case
    when k = 'travel' and s = 'submitted' then 'Diajukan'
    when k = 'travel' and s = 'approved'  then 'Diverifikasi Finance'
    when k = 'travel' and s = 'paid'      then 'Uang muka dicairkan'
    when k = 'procurement' and s = 'submitted' then 'Menunggu head'
    when k = 'procurement' and s = 'paid'      then 'Dibayar ke vendor'
    else request_status_label(s) end
$$;

-- ---------- B. Peran pengadaan ----------
create function is_techops() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_dept() = 'TO' or my_role() = 'admin', false)
$$;

create function is_fa_head() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((my_dept() = 'FA' and my_role() = 'head') or my_role() = 'admin', false)
$$;

-- Penyetuju langkah 2: head departemen pemohon; CEO dan admin sebagai cadangan.
create function is_procurement_head(p_dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((my_role() = 'head' and my_dept() = p_dept) or my_role() in ('ceo', 'admin'), false)
$$;

-- ---------- C. SLA pengadaan ----------
-- Head: 1x24 jam. Langkah 3-8 (sampai PO terbit): 2 hari kerja per status, tetapi tidak melewati
-- 5 hari kerja sejak PR diajukan. CEO: 2x24 jam. Menunggu vendor (PO terbit / retur): tanpa SLA.
-- Registrasi aset/stok: 5 hari kerja.
create or replace function sla_due(r requests) returns timestamptz
language sql stable as $$
  select case
    when r.kind = 'procurement' then case
      when r.status = 'submitted' then r.status_since + interval '24 hours'
      when r.status = 'ceo_review' then r.status_since + interval '48 hours'
      when r.status in ('head_approved', 'vendor_compared', 'fa_verified', 'fa_approved', 'ceo_approved')
        then least(workday_add(r.status_since, 2), workday_add(coalesce(r.submitted_at, r.status_since), 5))
      when r.status in ('received', 'payment_approved') then workday_add(r.status_since, 2)
      when r.status = 'paid' then workday_add(r.status_since, 5)
    end
    when r.status in ('submitted', 'in_review', 'ceo_review', 'assigner_approved', 'st_issued')
      or (r.status = 'approved' and (r.kind <> 'travel' or coalesce((r.data->>'advance')::boolean, false)))
    then workday_add(r.status_since, 2) end
$$;

-- ---------- D. Keamanan (RLS) ----------
-- Head departemen pemohon dan TechOps juga melihat pengajuan pengadaan.
drop policy read_requests on requests;
create policy read_requests on requests for select using (
  requester_id = me() or is_request_reviewer() or my_role() = 'ceo'
  or assigner_id = me() or (kind = 'travel' and is_travel_hr())
  or (kind = 'procurement' and (is_techops() or (my_role() = 'head' and my_dept() = dept_code)))
);

drop policy insert_request_files on request_files;
create policy insert_request_files on request_files for insert with check (
  uploaded_by = me()
  and (kind = 'link' or path like me()::text || '/%')
  and (
    (purpose = 'proof' and exists (
      select 1 from requests r
       where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
    or (purpose = 'transfer' and is_request_reviewer() and exists (
      select 1 from requests r
       where r.id = request_id
         and (r.status in ('approved', 'paid') or (r.kind = 'procurement' and r.status = 'payment_approved'))))
    or (purpose = 'report' and exists (
      select 1 from requests r
       where r.id = request_id and r.requester_id = me() and r.kind = 'travel' and r.status in ('approved', 'paid')))
    or (purpose = 'document' and exists (
      select 1 from requests r
       where r.id = request_id and r.kind = 'procurement'
         and r.status in ('fa_approved', 'ceo_approved', 'po_issued', 'received', 'returned', 'payment_approved', 'paid')
         and (is_request_reviewer() or is_techops() or r.requester_id = me())))
  )
);
drop policy delete_request_files on request_files;
create policy delete_request_files on request_files for delete using (
  (purpose = 'proof' and exists (
    select 1 from requests r
     where r.id = request_id and r.requester_id = me() and r.status in ('draft', 'needs_revision')))
  or (purpose = 'transfer' and uploaded_by = me() and is_request_reviewer())
  or (purpose = 'report' and uploaded_by = me() and exists (
    select 1 from requests r where r.id = request_id and r.status in ('approved', 'paid')))
  or (purpose = 'document' and uploaded_by = me())
);

-- ---------- E. Fungsi alur pengajuan (menggantikan versi 009) ----------
-- Parameter baru p_data: isian tahap pengadaan (perbandingan vendor oleh TO, pilihan vendor oleh Head F&A).
drop function change_request_status(uuid, text, text, date);

create function change_request_status(p_id uuid, p_to text, p_note text default null, p_paid_on date default null,
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

-- Catatan tanpa mengubah status. Pengadaan: head dept pemohon dan TechOps juga boleh memberi catatan.
create or replace function add_request_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := me();
  v_req  requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_me is null then raise exception 'Akses ditolak.'; end if;
  if v_note is null then raise exception 'Catatan belum diisi.'; end if;
  select * into v_req from requests where id = p_id;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if not (v_req.requester_id = v_me or is_request_reviewer()
          or (v_req.kind = 'travel' and (v_req.assigner_id = v_me or is_travel_hr()))
          or (v_req.kind = 'procurement' and (is_techops() or is_procurement_head(v_req.dept_code)))) then
    raise exception 'Anda tidak berhak memberi catatan pada pengajuan ini.';
  end if;

  insert into request_events (request_id, actor, action, note) values (p_id, v_me, 'note', v_note);

  if v_req.requester_id = v_me then
    if v_req.status = 'draft' then
      null;
    elsif v_req.kind = 'travel' and v_req.status = 'submitted' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select v_req.assigner_id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
       where v_req.assigner_id <> v_me;
    elsif v_req.kind = 'travel' and v_req.status = 'assigner_approved' then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'CA' and e.id <> v_me;
    elsif v_req.kind = 'procurement' and v_req.status in ('submitted', 'head_approved', 'po_issued', 'returned') then
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.id <> v_me
         and case when v_req.status = 'submitted' then e.app_role = 'head' and e.dept_code = v_req.dept_code
                  else e.dept_code = 'TO' end;
    else
      insert into notifications (employee_id, kind, request_id, title, actor_id)
      select e.id, 'request', p_id, v_req.number || ' · Catatan baru dari pemohon: ' || v_req.title, v_me
        from employees e
       where e.is_active and e.dept_code = 'FA' and e.id <> v_me;
    end if;
  else
    insert into notifications (employee_id, kind, request_id, title, actor_id)
    values (v_req.requester_id, 'request', p_id, v_req.number || ' · Catatan baru: ' || v_req.title, v_me);
  end if;
end $$;

-- ---------- F. Notifikasi "Lewat SLA" ----------
create or replace function sync_my_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := me();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_total int := 0;
  v_n     int;
begin
  if v_me is null then return 0; end if;

  insert into notifications (employee_id, kind, task_id, title, dedupe_key)
  select v_me, 'reminder', r.task_id, t.title,
         'reminder:' || r.id || ':' || extract(epoch from r.remind_at)::bigint
    from task_reminders r join tasks t on t.id = r.task_id
   where r.employee_id = v_me and r.remind_at <= now()
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into notifications (employee_id, kind, task_id, title, dedupe_key)
  select v_me, 'deadline', t.id, t.title,
         'deadline:' || t.id || ':' || t.deadline || ':' || (t.deadline - v_today)
    from tasks t
    join task_people tp on tp.task_id = t.id and tp.employee_id = v_me and tp.role = 'pic'
   where t.status <> 'done' and t.deadline - v_today between 1 and 3
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Pengajuan yang lewat SLA, sekali per status, untuk pihak yang sedang memegang tahap itu.
  insert into notifications (employee_id, kind, request_id, title, dedupe_key)
  select v_me, 'sla', r.id,
         r.number || ' · ' || request_status_label(r.status, r.kind) || ': ' || r.title,
         'sla:' || r.id || ':' || r.status || ':' || extract(epoch from r.status_since)::bigint
    from requests r
   where r.requester_id <> v_me
     and sla_due(r) < now()
     and (
       (is_request_reviewer() and ((r.kind in ('reimburse', 'payment', 'commission') and r.status in ('submitted', 'in_review', 'approved'))
                                   or (r.kind = 'travel' and r.status in ('st_issued', 'approved'))
                                   or (r.kind = 'procurement' and r.status in ('vendor_compared', 'fa_approved', 'ceo_approved',
                                                                               'payment_approved', 'paid'))))
       or (my_role() = 'ceo' and r.status = 'ceo_review')
       or (r.kind = 'travel' and r.status = 'submitted' and r.assigner_id = v_me)
       or (r.kind = 'travel' and r.status = 'assigner_approved' and is_travel_hr())
       or (r.kind = 'procurement' and r.status = 'submitted' and my_role() = 'head' and my_dept() = r.dept_code)
       or (r.kind = 'procurement' and r.status = 'head_approved' and my_dept() = 'TO')
       or (r.kind = 'procurement' and r.status in ('fa_verified', 'received') and my_dept() = 'FA' and my_role() = 'head')
     )
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Pemohon dinas: batas FPTD & laporan misi sudah lewat.
  insert into notifications (employee_id, kind, request_id, title, dedupe_key)
  select v_me, 'sla', r.id, r.number || ' · Batas FPTD & laporan misi lewat: ' || r.title, 'fptd:' || r.id
    from requests r
   where r.requester_id = v_me and r.kind = 'travel' and r.status in ('approved', 'paid')
     and (r.data->>'report_due')::date < v_today
     and not exists (select 1 from request_files f where f.request_id = r.id and f.purpose = 'report')
  on conflict (employee_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end $$;

-- Muat ulang daftar tabel & fungsi di API Supabase.
notify pgrst, 'reload schema';
