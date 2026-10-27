# Handover Crustea Portal untuk Vio (TechOps)

Disusun 27 Okt 2026, diperbarui setelah semua modul Fase 2-3 selesai. Pemilik produk: Athar (Head of Corporate Affairs, admin aplikasi, bukan programmer).
Aturan bisnis lengkap ada di `CLAUDE.md`. Rencana Fase 2-3 ada di `docs/fase-2-3/00-RENCANA.md`.

## 1. Ringkasan

Aplikasi web internal pengganti Google Sheets: tugas & sprint, log kerja harian (ATS), dashboard, admin
karyawan/periode, notifikasi, prosedur, pengajuan keuangan (reimburse, pembayaran, dinas, pengadaan,
komisi), penjualan/stok/aset, serta monitoring KPI & target kuartal. Saat ini hanya berjalan di
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

- Urutan menjalankan SQL: `schema.sql` → `migrations/002` … `013`. **Semua sudah dijalankan** di Supabase
  (dicek 27 Okt 2026: semua tabel/kolom ada, dan semua fungsi yang dipanggil aplikasi cocok nama &
  parameternya). Isi tiap migrasi: 002 koreksi admin & buka periode · 003 pending/catatan/delegasi/notifikasi ·
  004 perbaikan kode tugas · 005 riwayat karyawan · 006 prosedur · 007 mesin pengajuan + reimburse ·
  008 permintaan pembayaran · 009 perjalanan dinas · 010 pengadaan · 011 produk/komisi/referral ·
  012 penjualan/stok/aset · 013 KPI & target kuartal. Migrasi baru ditulis berurutan di `migrations/` dan
  dijalankan Athar lewat SQL Editor setelah disetujui.
- Data awal: `seed/*.csv`, diimpor sekali dengan `scripts/import-seed.mjs` (sudah dilakukan).
- Lampiran pengajuan: **hanya link** (keputusan Athar, agar tetap di paket gratis). Bucket privat
  `request-files` (migrasi 007) ada tapi tombol unggah dimatikan di `FileOrLinkInput`.
- Fungsi penting: `me()`, `my_role()`, `period_of`, `weekly_hours`, tutup/buka periode + snapshot,
  `sync_my_notifications` (dipanggil aplikasi tiap menit dari lonceng), `change_request_status`
  (semua alur pengajuan), `workday_add` (SLA 2 hari kerja, tabel `holidays`), `change_lead_stage`,
  `change_asset_status`, `stock_overview`, `update_kpi_item`.
- **Aturan kritis:** snapshot periode yang sudah dikunci (`period_snapshots`) tidak boleh dihitung ulang
  (dasar remunerasi). Jangan menjalankan perubahan data massal tanpa persetujuan Athar.

## 5. Langkah deploy (yang perlu Vio kerjakan)

1. Clone repo, `npm install`, `npm run build` harus sukses. Cek juga `npx tsc --noEmit` dan `npx eslint src`.
2. Hosting Next.js: Vercel paling mudah (region Singapore `sin1`), atau server sendiri dengan
   `npm run build && npm run start` (Node 20+) di belakang reverse proxy **HTTPS** (wajib untuk PWA, kamera,
   dan login).
3. Pasang dua variabel `NEXT_PUBLIC_*` di hosting.
4. Supabase → Authentication → URL Configuration:
   - **Site URL** = `https://internal.crustea.id` (alamat utama saja, tanpa `/login`).
   - **Redirect URLs**: tambah `https://internal.crustea.id/**` (biarkan `http://localhost:3000/**` untuk pengembangan).
   - **Penting:** Site URL saat ini berisi `http://192.168.1.185:3000` (alamat Wi-Fi laptop Athar untuk uji dari HP;
     Supabase menolak alamat IP di Redirect URLs, jadi harus lewat Site URL). Wajib diganti ke domain produksi.
     Entri `http://192.168.1.185:3000/...` di Redirect URLs boleh dihapus.
5. Supabase → Authentication → SMTP: **sudah dipasang Athar** (pengirim sendiri, terverifikasi). Cek ulang
   batas "Rate limit for sending emails" di Authentication → Rate Limits cukup untuk semua karyawan.
6. Hapus/ubah `allowedDevOrigins` di `next.config.ts` (hanya untuk uji dari HP di Wi-Fi laptop).
7. Uji: login magic link, buka Tugas, catat Log Kerja (dari Dashboard), ajukan reimburse dengan link bukti,
   tinjau di Review F&A, lalu "Install app" di Chrome Android (PWA, harus terbuka layar penuh di https).
8. Atur cadangan database (Supabase plan berbayar = backup harian; plan gratis = jadwalkan `pg_dump`).

## 6. Struktur kode singkat

```
src/app/(app)/        halaman yang butuh login: dashboard, tugas, log-kerja, admin, prosedur, profil,
                      pengajuan (reimburse, pembayaran, dinas, pengadaan, komisi, review F&A),
                      penjualan, stok, aset, produk, kpi (+ target), cuti-lembur (placeholder)
src/app/login, auth/  magic link, callback, logout;  src/middleware.ts = penyegaran sesi
src/lib/              auth, format (tanggal/angka Indonesia), ats, tasks, requests, upload, travel,
                      commission, sales, kpi, request-origin, supabase/
src/components/       AppShell (sidebar + judul), NavLinks (menu), NotificationBell, requests/*
scripts/              generate-icons, import-seed, isi-prosedur, perbarui-link-prosedur
                      (tiga terakhir butuh SUPABASE_SECRET_KEY; sudah dijalankan, tidak perlu diulang)
docs/fase-2-3/        spesifikasi tiap modul Fase 2-3 (semua sudah dikerjakan)
Jalankan Crustea Portal.bat   hanya untuk pengembangan di laptop (npm run dev)
```

Konvensi: teks UI bahasa Indonesia; warna hanya kelas `brand-*` (`src/app/globals.css`); format tanggal &
angka dari `src/lib/format.ts`; mobile-first.

## 7. Status & pekerjaan berikutnya

- Fase 1 selesai. Semua modul Fase 2-3 di `00-RENCANA.md` selesai (27 Okt 2026); cuti & lembur masih
  halaman "sedang dalam pengembangan". Perlu uji pemakaian nyata oleh F&A, BDS, TO, dan head.
- Pemeriksaan pra-deploy (27 Okt 2026): `npx tsc --noEmit`, `npx next lint`, dan `npm run build` bersih;
  build produksi dijalankan dan halaman utama merespons benar.
- Belum ada: halaman admin untuk mengisi `holidays` (sementara isi lewat Table Editor Supabase);
  notifikasi push ke HP (sekarang hanya lonceng di aplikasi, dicek tiap 60 detik).
- Untuk review keamanan: aturan RLS `task_people` masih mengizinkan semua anggota departemen mengubah
  PIC/support tugas departemennya (lebih longgar dari aturan "PIC/head" di CLAUDE.md); Next.js 15 punya
  satu peringatan audit (postcss bawaan) yang baru hilang di Next.js 16; `npm audit` juga menandai `uuid@8`
  bawaan `exceljs` (moderate, hanya berlaku untuk uuid v3/v5/v6 dengan buffer, tidak dipakai exceljs;
  `audit fix --force` justru menurunkan exceljs, jadi jangan dijalankan).

## 8. Kontak

- Athar: pemilik produk, admin aplikasi, pemegang akses Supabase.
- Keputusan bisnis & persetujuan SQL: Athar. Kebijakan F&A: departemen FA.
