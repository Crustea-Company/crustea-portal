# Handover Crustea Portal untuk Vio (TechOps)

Disusun 27 Okt 2026. Pemilik produk: Athar (Head of Corporate Affairs, admin aplikasi, bukan programmer).
Aturan bisnis lengkap ada di `CLAUDE.md`. Rencana Fase 2-3 ada di `docs/fase-2-3/00-RENCANA.md`.

## 1. Ringkasan

Aplikasi web internal pengganti Google Sheets: tugas & sprint, log kerja harian (ATS), dashboard, admin
karyawan/periode, notifikasi, prosedur, dan (Fase 2) pengajuan keuangan. Saat ini hanya berjalan di
laptop Athar (`npm run dev`). **Tujuan handover: deploy ke server agar bisa dipakai semua karyawan.**

## 2. Stack

| Bagian | Isi |
|---|---|
| Frontend + server | Next.js 15 (App Router, TypeScript), React 19, Tailwind CSS 4, PWA (manifest + service worker) |
| Database & login | Supabase (Postgres + Auth + Storage), region Singapore |
| Login | Magic link email. Hanya email di tabel `employees` dengan `is_active = true` yang bisa masuk; lainnya ke `/akses-ditolak` |
| Keamanan data | Row Level Security di semua tabel; logika sensitif di fungsi SQL `security definer` (lihat `schema.sql`, `migrations/`) |
| Lainnya | `exceljs` (unduh log kerja ke Excel), `react-markdown` (halaman Prosedur) |

Tidak ada backend terpisah: halaman server + server action Next.js memanggil Supabase dengan sesi pengguna
(kunci publishable), jadi semua hak akses ditegakkan oleh RLS.

## 3. Variabel lingkungan (`.env.local`, tidak masuk git)

| Nama | Dipakai | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | aplikasi | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | aplikasi | kunci publik (aman di browser, dibatasi RLS) |
| `SUPABASE_SECRET_KEY` | hanya skrip `scripts/*.mjs` | **jangan** dipasang di server produksi kecuali perlu menjalankan skrip |

Minta nilainya langsung ke Athar (jangan lewat chat/GitHub).

## 4. Database

- Urutan menjalankan SQL: `schema.sql` → `migrations/002` … `007`. **Semua sudah dijalankan** di Supabase
  produksi (007 = mesin pengajuan, 27 Okt 2026). Migrasi baru ditulis berurutan di `migrations/` dan
  dijalankan Athar lewat SQL Editor setelah disetujui.
- Data awal: `seed/*.csv`, diimpor sekali dengan `scripts/import-seed.mjs` (sudah dilakukan).
- Storage: bucket privat `request-files` (lampiran pengajuan, maks 5 MB/file), policy di migrasi 007.
- Fungsi penting: `me()`, `my_role()`, `period_of`, `weekly_hours`, tutup/buka periode + snapshot,
  `sync_my_notifications` (dipanggil aplikasi tiap menit dari lonceng), `change_request_status`,
  `workday_add` (SLA 2 hari kerja, tabel `holidays`).
- **Aturan kritis:** snapshot periode yang sudah dikunci (`period_snapshots`) tidak boleh dihitung ulang
  (dasar remunerasi). Jangan menjalankan perubahan data massal tanpa persetujuan Athar.

## 5. Langkah deploy (yang perlu Vio kerjakan)

1. Clone repo, `npm install`, `npm run build` harus sukses. Cek juga `npx tsc --noEmit` dan `npx eslint src`.
2. Hosting Next.js: Vercel paling mudah (region Singapore `sin1`), atau server sendiri dengan
   `npm run build && npm run start` (Node 20+) di belakang reverse proxy **HTTPS** (wajib untuk PWA, kamera,
   dan login).
3. Pasang dua variabel `NEXT_PUBLIC_*` di hosting.
4. Supabase → Authentication → URL Configuration:
   - **Site URL** = domain produksi (mis. `https://portal.crustea.id`).
   - **Redirect URLs**: tambah `https://<domain>/auth/callback` (biarkan `http://localhost:3000/**` untuk pengembangan).
5. Supabase → Authentication → SMTP: pasang SMTP sendiri (email kantor / Resend / dll.). SMTP bawaan
   Supabase dibatasi beberapa email per jam, tidak cukup untuk semua karyawan.
6. Hapus/ubah `allowedDevOrigins` di `next.config.ts` (hanya untuk uji dari HP di Wi-Fi laptop).
7. Uji: login magic link, buka Tugas, catat Log Kerja, ajukan reimburse dengan unggah foto dari HP,
   lalu "Tambahkan ke layar utama" di Chrome Android (PWA).
8. Atur cadangan database (Supabase plan berbayar = backup harian; plan gratis = jadwalkan `pg_dump`).

## 6. Struktur kode singkat

```
src/app/(app)/        halaman yang butuh login: dashboard, tugas, log-kerja, admin, prosedur,
                      pengajuan (reimburse + review F&A), cuti-lembur (placeholder)
src/app/login, auth/  magic link, callback, logout;  src/middleware.ts = penyegaran sesi
src/lib/              auth, format (tanggal/angka Indonesia), ats, tasks, requests, upload, supabase/
src/components/       AppShell (sidebar + judul), NavLinks (menu), NotificationBell, requests/*
scripts/              generate-icons, import-seed, isi-prosedur (butuh SUPABASE_SECRET_KEY)
docs/fase-2-3/        spesifikasi modul berikutnya (satu file per modul)
```

Konvensi: teks UI bahasa Indonesia; warna hanya kelas `brand-*` (`src/app/globals.css`); format tanggal &
angka dari `src/lib/format.ts`; mobile-first.

## 7. Status & pekerjaan berikutnya

- Fase 1 selesai. Fase 2 modul #1 (mesin pengajuan + reimburse) selesai; perlu diuji Athar & F&A di HP.
- Belum ada: halaman admin untuk mengisi `holidays` (sementara isi lewat Table Editor Supabase);
  notifikasi push ke HP (sekarang hanya lonceng di aplikasi, dicek tiap 60 detik).
- Modul berikutnya (urutan di `00-RENCANA.md`): permintaan pembayaran, perjalanan dinas, pengadaan,
  produk/komisi/referral, penjualan/stok/aset, monitoring KPI & target kuartal.
- Peringatan lint kecil yang sudah lama: variabel tak terpakai di `src/app/(app)/log-kerja/page.tsx`.

## 8. Kontak

- Athar: pemilik produk, admin aplikasi, pemegang akses Supabase.
- Keputusan bisnis & persetujuan SQL: Athar. Kebijakan F&A: departemen FA.
