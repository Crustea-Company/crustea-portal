# Crustea Portal

Aplikasi web internal PT Eco Karya Teknologi (Crustea) untuk menggantikan Google Sheets: to-do & sprint, log kerja harian (ATS), dan nantinya KPI, form keuangan, dan cuti. Bukan untuk absensi.

## Tentang pemilik proyek

Pemilik proyek (Athar, Head of Corporate Affairs) **bukan programmer**. Karena itu:
- Jelaskan setiap langkah dengan bahasa Indonesia sederhana, tanpa istilah teknis yang tidak perlu.
- Kerjakan satu fitur kecil per langkah, lalu beri tahu cara mengujinya di browser.
- Kalau Athar harus melakukan sesuatu sendiri (klik di dashboard, menyalin kunci), tulis langkahnya bernomor dan sangat spesifik.
- Selalu minta konfirmasi sebelum menghapus file, menghapus data, atau mengubah skema database.
- Jangan pernah menulis kunci rahasia ke dalam kode atau ke GitHub. Semua kunci ada di `.env.local`, dan `.env.local` harus ada di `.gitignore`.

## Stack

- Next.js (App Router, TypeScript), Tailwind CSS, bisa di-install sebagai PWA di Android.
- Supabase: database Postgres, login, dan Row Level Security (RLS). Region Singapore.
- Login: magic link email (Supabase Auth). Hanya email yang ada di tabel `employees` dengan `is_active = true` yang boleh memakai aplikasi; email lain ditampilkan halaman "Akses ditolak".
- Saat ini dikembangkan di laptop (localhost). Deployment ke server akan dibantu Vio (TechOps) setelah Fase 1 selesai.
- Skema database: `schema.sql`, lalu perubahan berikutnya berurutan di folder `migrations/` (dijalankan Athar lewat SQL Editor Supabase setelah disetujui). Data awal: folder `seed/` (file CSV, jangan diedit manual).

## Aturan bisnis (wajib diikuti)

### Karyawan & peran
- Departemen: MGT, CA, FA, BDS, DM, AQ, TO.
- Peran aplikasi: `admin` (Athar), `ceo` (Nafi'ah), `head` (kepala departemen), `staff`.
- Status kerja: PKWTT, PKWT, INTERN.
- `ats_required = false` untuk CEO, CTO, dan Head of Corporate Affairs. Mereka tidak tampil di laporan ketercapaian ATS.

### ATS (log kerja harian)
- Karyawan mencatat: tanggal, aktivitas, menit, bukti (link/teks).
- Jam mingguan: PKWTT 40 jam, PKWT 20 jam, Intern 20 jam (fungsi `weekly_hours`).
- Ekspektasi bulanan = jam mingguan x 4.
- Minggu dihitung Senin-Minggu. "Sisa jam minggu ini" = jam mingguan dikurangi jam yang sudah dicatat minggu itu.
- Periode bulanan: tanggal 29 bulan sebelumnya sampai tanggal 28. Tanggal 29-31 masuk periode bulan berikutnya (fungsi `period_of`, diisi otomatis oleh trigger). Kuartal ATS mengikuti periode ini.
- Ketercapaian = total jam periode / ekspektasi bulanan.
- **Tutup periode:** admin mengunci periode; sistem menyimpan snapshot ketercapaian per karyawan di `period_snapshots`. Nilai yang sudah dikunci **tidak boleh dihitung ulang**, karena dipakai sebagai dasar remunerasi. Log yang ditambahkan setelah periode dikunci otomatis bertanda `is_correction = true` dan tidak mengubah snapshot.
- Snapshot Juli-September 2026 adalah data impor (`source = 'import'`) dan harus ditampilkan apa adanya.
- **Koreksi admin:** hanya admin yang boleh mengubah/menghapus log di periode yang sudah ditutup (atau log milik orang lain), wajib alasan, dan setiap perubahan tercatat di `audit_log` (data lama, data baru, alasan, siapa, kapan). Snapshot tidak ikut berubah.
- **Buka ulang periode:** admin boleh membuka kunci periode (wajib alasan, tercatat di `audit_log`). Saat dikunci ulang, snapshot yang sudah ada **tetap dipakai, tidak dihitung ulang**; snapshot baru hanya dibuat untuk karyawan yang belum punya.

### To-do & sprint
- Semua karyawan bisa melihat semua tugas (transparansi lintas departemen).
- Status: not_started, on_going, pending, done. Tampilkan dalam bahasa Indonesia: Belum Mulai, Berjalan, Pending, Selesai.
- Setiap tugas punya satu atau lebih PIC dan support (`task_people`).
- PIC boleh mengubah status tugasnya. Head boleh mengubah semua tugas departemennya. Admin dan CEO boleh mengubah semua tugas.
- Delegasi = menambahkan orang sebagai PIC (PIC lama tetap) + notifikasi. Catatan tugas terlihat semua karyawan. Pengingat bersifat pribadi.
- Setiap tambah/ubah/hapus tugas dan PIC/support tercatat otomatis di `task_history` (halaman Tugas > Riwayat).

### Fase 2-3 (disetujui Athar 27 Okt 2026, dikerjakan per modul)
- Rencana, urutan, dan spesifikasi lengkap tiap modul ada di `docs/fase-2-3/` (mulai dari `00-RENCANA.md`). **Baca file modul yang dikerjakan; jangan membuka ulang file sumber PDF/Excel.**
- Modul: mesin pengajuan bersama + reimburse, permintaan pembayaran, perjalanan dinas, pengadaan, produk/komisi/referral, penjualan/stok/aset, monitoring KPI & target kuartal. Cuti & lembur: halaman "sedang dalam pengembangan" saja.
- Form keuangan direview Finance & Accounting; SLA maksimal 2 hari kerja per status; pemohon melihat status. CEO menerima notifikasi untuk nilai >= Rp5.000.000. Cuti direview HR (Corporate Affairs).
- Halaman **Prosedur** (`procedures`, migrasi 006): isi diubah admin dari aplikasi; kode SOP di tugas tertaut ke prosedur.
- **Mesin pengajuan** (migrasi 007, sudah dijalankan): tabel `requests` (+ `request_events`, `request_files`, `holidays`), bucket privat `request-files`. Status hanya lewat RPC `change_request_status`; catatan lewat `add_request_note`; SLA = kolom hitung `sla_due`. Kode bersama: `src/lib/requests.ts`, `src/lib/upload.ts`, `src/components/requests/`, server action di `src/app/(app)/pengajuan/actions.ts`. Form baru (pembayaran, pengadaan, dinas, komisi) memakai ini; isi khusus form disimpan di `requests.data`. Bukti/lampiran **hanya link** (keputusan Athar 27 Okt 2026: tetap di paket gratis Supabase); tombol unggah file dimatikan di `FileOrLinkInput`.
- **Pengadaan** (migrasi 010, sudah dijalankan): kind `procurement`, alur head dept → TechOps (≥3 vendor) → Finance → Head F&A (≥ Rp5 jt: CEO) → PO (`data.po_number`) → diterima/retur → approval bayar → dibayar → selesai. Isian tahap lewat parameter `p_data` di `change_request_status`; form di `src/app/(app)/pengajuan/pengadaan/`, panel TO/Head F&A di `pengajuan/[id]/ProcurementPanels.tsx`.
- **Produk, komisi, referral** (migrasi 011, sudah dijalankan): tabel `products` (versi harga per `code`, berlaku mulai/sampai, diubah admin/F&A di `/produk`), `employees.referral_code` (CRU-NAMA, otomatis; tampil di `/profil`). Klaim komisi kind `commission` (`/pengajuan/komisi/baru`), baris penjualan di `data.lines`; HPP, % komisi, profit, komisi, dan `amount` dihitung trigger `prepare_commission_claim`. Diterima hanya bila F&A mencentang lunas (`p_data.sales_paid`). Kode bersama: `src/lib/commission.ts`.
- **Penjualan, stok, aset** (migrasi 012, sudah dijalankan): `sales_leads` (+ `sales_lead_events`; tahap hanya lewat RPC `change_lead_stage`, catatan/keluhan `add_lead_note`), `stock_items` + `stock_moves` (`stock_overview()` = tersedia vs kebutuhan pipeline; work order mengurangi stok otomatis), `assets` + `asset_events` (`change_asset_status`, `add_asset_log`; hapus aset butuh CEO + Head F&A). Halaman `/penjualan`, `/stok`, `/aset`. Klaim komisi bisa mengambil baris dari lead (`data.lines[].lead_id`, pengklaim = pemilik kode referral atau PIC sales); syarat lunas baris itu = `sales_leads.paid_on` (dicatat Finance). Notifikasi baru memakai kolom `notifications.link`. Kode bersama: `src/lib/sales.ts`, `src/lib/sales-data.ts`.
- **Monitoring KPI & target kuartal** (migrasi 013, sudah dijalankan): `/kpi` (KPI per departemen → objective → item; centang selesai/catatan hanya lewat RPC `update_kpi_item`: PIC orang, anggota dept bila PIC = departemen, head dept, admin, CEO). `/kpi/target`: `quarter_targets` → `target_sources` (bobot % x total = target alokasi, `alloc_label`, `from_sales`) → `target_strategies` (proyeksi). Kuartal kalender. Realisasi = hanya yang lunas, pada bulan lunasnya: `sales_leads.paid_on` ke sumber `from_sales`, plus `revenues` berstatus `paid` (dicatat F&A/admin/CEO) dicocokkan lewat label alokasi; sisanya "Alokasi lain / belum dipilih". Target diubah admin/CEO. Kode bersama: `src/lib/kpi.ts`.

## Fitur Fase 1

1. Login magic link + halaman "Akses ditolak".
2. Halaman **Tugas**: daftar dan kanban per departemen; filter sprint, PIC, status, departemen; ubah status; tandai tugas terlambat (deadline lewat dan belum selesai).
3. Halaman **Log Kerja**: form input cepat; daftar log saya; kartu "sisa jam minggu ini" dan "ketercapaian periode berjalan"; riwayat snapshot per periode.
4. Halaman **Dashboard**: jumlah tugas terlambat dan jatuh tempo minggu ini per departemen; ketercapaian ATS per karyawan (sesuai hak akses).
5. Halaman **Admin**: kelola karyawan (tambah, nonaktifkan, ubah peran/status); tutup periode.

## Gaya tampilan

- Bahasa Indonesia di seluruh tampilan.
- Mobile-first: harus nyaman dipakai di HP Android.
- Format tanggal Indonesia (mis. 26 Okt 2026), angka dengan titik ribuan.
- Sederhana dan bersih; warna utama mengikuti identitas Crustea (biru/teal).
- Warna utama hanya diatur di satu tempat: `--color-brand-*` di `src/app/globals.css` (+ `BRAND_HEX` di `src/lib/brand.ts`). Pakai kelas `brand-*`, jangan menulis warna teal/biru langsung. Warna logo: `logo-lime`, `logo-leaf`.
- Logo: `public/brand/crustea-logo.png`; ikon dibuat ulang dengan `node scripts/generate-icons.mjs`.
