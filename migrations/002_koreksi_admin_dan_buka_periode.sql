-- =====================================================================
-- 002 - Koreksi log oleh admin di periode tertutup + buka ulang periode
-- Jalankan sekali di Supabase: SQL Editor > New query > tempel > Run
-- Tidak mengubah atau menghapus data yang sudah ada.
-- =====================================================================

-- ---------- A. Kolom alasan di audit_log ----------
alter table audit_log add column reason text;

-- ---------- B. Aturan akses (RLS) work_logs ----------
-- Aturan lama TETAP: karyawan hanya bisa mengubah/menghapus log miliknya
-- di periode yang belum ditutup (update_own_logs, delete_own_logs).
-- Tambahan: admin boleh mengubah/menghapus log milik siapa pun.
create policy admin_update_logs on work_logs for update
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy admin_delete_logs on work_logs for delete
  using (my_role() = 'admin');

-- ---------- C. Penjaga + pencatat audit ----------
create function is_period_locked(p date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from periods where period_month = p and locked_at is not null)
$$;

-- Setiap perubahan/penghapusan log yang menyentuh periode tertutup:
--   wajib ada alasan (diisi oleh fungsi admin di bagian D), dan dicatat ke audit_log
--   (data lama, data baru, alasan, siapa, kapan).
-- Perubahan admin atas log milik orang lain di periode terbuka juga dicatat.
-- period_snapshots TIDAK disentuh sama sekali.
create function audit_work_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(current_setting('app.change_reason', true), '');
  v_locked boolean;
begin
  v_locked := is_period_locked(old.period_month)
              or (tg_op = 'UPDATE' and is_period_locked(new.period_month));

  if v_locked and v_reason is null then
    raise exception 'Perubahan log di periode yang sudah ditutup wajib disertai alasan.';
  end if;

  if v_locked or old.employee_id is distinct from me() then
    insert into audit_log (table_name, row_id, action, old_data, new_data, actor, reason)
    values ('work_logs', old.id::text, lower(tg_op), to_jsonb(old),
            case when tg_op = 'UPDATE' then to_jsonb(new) end, me(), v_reason);
  end if;

  return null;
end $$;

create trigger trg_work_log_audit
after update or delete on work_logs
for each row execute function audit_work_log_change();

-- ---------- D. Fungsi admin: ubah / hapus log dengan alasan ----------
create function admin_update_work_log(
  p_id uuid, p_log_date date, p_activity text, p_minutes int, p_proof text, p_reason text
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang boleh melakukan ini.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi.';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  update work_logs
     set log_date = p_log_date, activity = p_activity, minutes = p_minutes, proof = p_proof
   where id = p_id;
  if not found then raise exception 'Log tidak ditemukan.'; end if;
  perform set_config('app.change_reason', '', true);
end $$;

create function admin_delete_work_log(p_id uuid, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang boleh melakukan ini.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi.';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  delete from work_logs where id = p_id;
  if not found then raise exception 'Log tidak ditemukan.'; end if;
  perform set_config('app.change_reason', '', true);
end $$;

-- ---------- E. Buka ulang periode (admin, wajib alasan, tercatat di audit_log) ----------
-- Snapshot periode tersebut TIDAK dihapus atau diubah saat dibuka.
create function reopen_period(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old periods;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang boleh melakukan ini.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi.';
  end if;

  select * into v_old from periods where period_month = p_month and locked_at is not null for update;
  if not found then raise exception 'Periode tidak ditemukan atau belum ditutup.'; end if;

  update periods set locked_at = null, locked_by = null where period_month = p_month;

  insert into audit_log (table_name, row_id, action, old_data, new_data, actor, reason)
  values ('periods', p_month::text, 'reopen', to_jsonb(v_old),
          (select to_jsonb(p) from periods p where p.period_month = p_month), me(), trim(p_reason));
end $$;

-- ---------- F. Tutup periode (pertama kali) dan kunci ulang ----------
-- Snapshot dibuat HANYA untuk karyawan aktif wajib ATS yang belum punya snapshot di periode itu.
-- Snapshot yang sudah ada (termasuk data impor Jul-Sep 2026) TIDAK PERNAH dihitung ulang.
-- Jadi saat periode yang pernah dibuka dikunci ulang, snapshot lama tetap dipakai.
-- Log bertanda koreksi tidak ikut dihitung.
create function close_period(p_month date, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_end      date := (p_month + interval '27 days')::date;   -- tanggal 28
  v_new      int;
  v_existing int;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Hanya admin yang boleh melakukan ini.';
  end if;
  if extract(day from p_month) <> 1 then
    raise exception 'Periode tidak valid.';
  end if;
  if v_end >= (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Periode ini belum berakhir (berakhir %).', to_char(v_end, 'DD-MM-YYYY');
  end if;
  if is_period_locked(p_month) then
    raise exception 'Periode ini sudah ditutup.';
  end if;

  insert into periods (period_month) values (p_month) on conflict do nothing;
  select count(*) into v_existing from period_snapshots where period_month = p_month;

  insert into period_snapshots
    (employee_id, period_month, emp_status, total_hours, expected_hours, achievement, source)
  select e.id, p_month, e.emp_status,
         round(coalesce(sum(w.minutes), 0) / 60.0, 2),
         weekly_hours(e.emp_status) * 4,
         round(coalesce(sum(w.minutes), 0) / 60.0 / (weekly_hours(e.emp_status) * 4), 6),
         'app'
    from employees e
    left join work_logs w
      on w.employee_id = e.id and w.period_month = p_month and not w.is_correction
   where e.is_active and e.ats_required
   group by e.id, e.emp_status
  on conflict (employee_id, period_month) do nothing;
  get diagnostics v_new = row_count;

  update periods set locked_at = now(), locked_by = me() where period_month = p_month;

  insert into audit_log (table_name, row_id, action, old_data, new_data, actor, reason)
  values ('periods', p_month::text,
          case when v_existing > 0 then 'relock' else 'lock' end,
          null,
          jsonb_build_object('snapshot_baru', v_new, 'snapshot_lama_dipertahankan', v_existing),
          me(), nullif(trim(coalesce(p_reason, '')), ''));

  return v_new;
end $$;
