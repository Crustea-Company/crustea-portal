# Modul 1a: Mesin pengajuan bersama

Dipakai oleh: reimburse, permintaan pembayaran, pengadaan, perjalanan dinas, klaim komisi.

## Tabel (rancangan untuk migrasi 007)

- `requests`: `id`, `kind` (`reimburse` | `payment` | `procurement` | `travel` | `commission`),
  `number` (otomatis, mis. `RB-2026-0001`, `PP-…`, `PR-…`, `PD-…`, `KK-…`), `requester_id`,
  `dept_code`, `title`, `amount` (bigint, rupiah), `status`, `status_since` (timestamptz),
  `data` (jsonb: isi form khusus per jenis), `created_at`, `updated_at`.
- `request_events`: riwayat — `request_id`, `actor`, `action` (`submit`, `status`, `note`, `edit`),
  `from_status`, `to_status`, `note`, `at`.
- `request_files`: `request_id`, `kind` (`file` | `link`), `path`/`url`, `name`, `uploaded_by`.
- `holidays`: `date`, `name` (libur nasional; admin yang mengisi).
- Storage bucket `request-files` (privat).

## Status umum

`draft` → `submitted` (Belum di-review) → `in_review` (Sedang di-review) → `approved` (Diterima)
→ `paid` (Ditransfer). Cabang: `needs_revision` (Perlu perbaikan — pemohon mengubah lalu kirim ulang),
`rejected` (Ditolak, wajib alasan). Jenis tertentu boleh menambah langkah (lihat file modulnya).

## Aturan akses (RLS)

- Pemohon: lihat & ubah miliknya saat `draft`/`needs_revision`; lihat status & riwayat selalu.
- Peninjau (dept FA, head FA, admin): lihat semua, ubah status, beri catatan.
- CEO: lihat semua (untuk ≥ Rp5 jt dapat notifikasi).
- Perubahan status hanya lewat fungsi database `change_request_status(id, to, note)` yang
  memeriksa urutan status + peran, mengisi `status_since`, menulis `request_events`, dan membuat notifikasi.

## SLA

- `sla_due = workday_add(status_since, 2)` (fungsi SQL: lewati Sabtu/Minggu & `holidays`).
- Lewat SLA → label merah di daftar; notifikasi `sla` ke peninjau (pakai `sync_my_notifications`).

## Halaman

- **Pengajuan saya** (`/pengajuan`): daftar semua pengajuan milik saya + status + SLA + riwayat.
- **Review F&A** (`/pengajuan/review`): antrian per status, filter jenis, tombol
  "Mulai review", "Terima", "Perlu perbaikan", "Tolak", "Tandai ditransfer", kolom catatan.
- Komponen bersama: `RequestStatusBadge`, `RequestTimeline`, `FileOrLinkInput`, `RupiahInput`.
- Notifikasi (lonceng) jenis baru: `request` (status berubah / catatan baru / pengajuan baru untuk peninjau / lewat SLA).
