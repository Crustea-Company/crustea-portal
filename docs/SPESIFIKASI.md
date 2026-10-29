# Spesifikasi Crustea Portal

Ringkasan teknis aplikasi internal PT Eco Karya Teknologi (Crustea) di **internal.crustea.id**. Kondisi per 29 Okt 2026.

## 1. Gambaran singkat

| Hal | Isi |
|---|---|
| Fungsi | Menggantikan Google Sheets: tugas & sprint, log kerja harian (ATS), dashboard, pengajuan keuangan (reimburse, pembayaran, dinas, pengadaan, komisi), penjualan/stok/aset, KPI & target kuartal, Aquaculture project management, prosedur (SOP) |
| Pengguna | Karyawan aktif di tabel karyawan (saat ini 28 orang); peran: admin, CEO, kepala departemen, staf |
| Tampilan | Bahasa Indonesia, mobile-first, bisa dipasang di HP Android seperti aplikasi (PWA) |
| Bukan untuk | Absensi |

## 2. Teknologi

| Bagian | Teknologi |
|---|---|
| Aplikasi web | Next.js 15 (App Router) + React 19, bahasa TypeScript |
| Tampilan | Tailwind CSS 4; warna brand diatur di satu tempat (`src/app/globals.css`) |
| Database | Supabase (PostgreSQL), 36 tabel, region **Sydney (ap-southeast-2)** |
| Login | Supabase Auth, magic link lewat email (tanpa kata sandi), SMTP pengirim sendiri |
| Keamanan data | Row Level Security (RLS): hak akses dicek database untuk setiap baris data |
| Ekspor | File Excel (.xlsx) untuk log kerja |
| Lampiran | Hanya link (Google Drive dll.), tanpa unggah file, agar tetap di paket gratis Supabase |

## 3. Deploy

| Hal | Isi |
|---|---|
| Server | AWS ECS (container) di Jakarta, dikelola Vio (TechOps) |
| Paket | Docker image dari `Dockerfile` di repo (Node.js 22 Alpine), port **3001** |
| Di depan server | Cloudflare (HTTPS, domain internal.crustea.id) |
| Kunci saat build | Alamat Supabase + publishable key (aman terlihat publik) |
| Kunci rahasia saat berjalan | `SESSION_SECRET` (tanda tangan cookie sesi): hanya di server, tidak di Git |
| Cara update | Push ke GitHub → Vio build ulang image → deploy ulang. Perubahan database dijalankan terpisah lewat SQL Editor Supabase |

Panduan lengkap untuk TechOps: `docs/HANDOVER-VIO.md`.

## 4. Git & repositori

| Hal | Isi |
|---|---|
| Repo | GitHub `Crustea-Company/crustea-portal` |
| Cabang | Satu cabang utama `main`, langsung dipakai untuk deploy |
| Riwayat | ±60 commit sejak 26 Okt 2026, pesan commit berbahasa Indonesia |
| Rahasia | `.env.local` tidak pernah masuk Git (diabaikan `.gitignore`); daftar nama kunci di `.env.example` |
| Dokumen penting | `CLAUDE.md` (aturan proyek & bisnis), `docs/HANDOVER-VIO.md` (deploy), `docs/fase-2-3/` (spesifikasi tiap modul), dokumen ini |

## 5. Database & perubahan skema

- Struktur awal di `schema.sql`, lalu perubahan berurutan di `migrations/` (002–018). Semua sudah dijalankan.
- Setiap perubahan database ditulis sebagai file SQL, ditinjau, lalu dijalankan Athar di **Supabase → SQL Editor**. Tidak ada perubahan otomatis.
- Data awal (karyawan, tugas, log) diimpor sekali dari file CSV di `seed/`.
- Status pengajuan, tahap penjualan, tahap proyek Aquaculture, dan KPI hanya bisa diubah lewat fungsi database khusus, jadi alurnya tidak bisa dilompati.
- Ketercapaian ATS yang sudah dikunci (dasar remunerasi) tidak pernah dihitung ulang.

## 6. Keamanan & sesi login

- Hanya email karyawan aktif yang bisa masuk; selain itu muncul halaman "Akses ditolak".
- Setiap permintaan ke server diperiksa token login (JWT, kunci ES256); tanpa token sah = ditolak.
- Sesi habis bila **7 hari tidak dipakai** atau **30 hari sejak login**.
- Hak akses ditegakkan di database (RLS), bukan hanya di tampilan.

## 7. Kinerja (diukur 29 Okt 2026)

| Hal | Angka |
|---|---|
| Waktu muat halaman | ±1,1–2,0 detik (sebelum perbaikan kode terbaru di-deploy) |
| Satu permintaan ke database | ±0,22 detik, karena database di Sydney dan server di Jakarta |
| Perbaikan yang sudah dibuat | Cek login 1 permintaan, data diambil bersamaan, Tugas hanya memuat sprint yang dilihat, aturan akses dipercepat (SQL 017–018), kerangka halaman saat memuat |
| Peningkatan terbesar berikutnya | Pindah database Supabase ke **Singapura** (perkiraan halaman ±0,3–0,5 detik) |

## 8. Yang masih perlu diputuskan / dikerjakan

- **Region database:** pindah dari Sydney ke Singapura (proyek Supabase baru + pemindahan data; semua karyawan login ulang sekali).
- **Cadangan data:** paket gratis Supabase tanpa backup harian otomatis; jadwalkan cadangan berkala atau naik ke paket berbayar.
- **Cuti & lembur:** masih halaman "sedang dalam pengembangan".
- **Batas kirim email login:** pastikan batas di Supabase (Authentication → Rate Limits) cukup untuk semua karyawan.
