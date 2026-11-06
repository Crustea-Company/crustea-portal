// Mengisi/memperbarui SOP "panduan aplikasi" (kode APP-xx) di halaman Prosedur.
// node --env-file=.env.local scripts/isi-panduan-aplikasi.mjs
// Butuh SUPABASE_SECRET_KEY. Dicocokkan berdasarkan kode SOP; prosedur dengan judul di `replaces`
// (mis. "To-do list" lama) diganti isinya supaya tidak dobel. Boleh dijalankan ulang.
// Pola setiap SOP: link ke menu > Tujuan > Siapa > Langkah > Aturan penting > Kalau ada masalah > Kata kunci.
// Gambar: baris "![keterangan](/prosedur/gambar/<nama>)", file <nama>.png di panduan-gambar/ (lihat README di sana).

import { createClient } from "@supabase/supabase-js";

const PROCEDURES = [
  {
    code: "APP-01",
    title: "Panduan: Log Kerja (ATS)",
    sort: 101,
    body: `> Buka menu **[Log Kerja](/log-kerja)**. Berlaku untuk semua karyawan yang wajib ATS.

**Tujuan:** mencatat pekerjaan harian sebagai dasar ketercapaian jam kerja (ATS). Ketercapaian yang sudah dikunci dipakai sebagai dasar remunerasi.

**Siapa:** semua karyawan. CEO, CTO, dan Head of Corporate Affairs tidak wajib ATS (tetap boleh mencatat, tetapi tidak masuk laporan ketercapaian).

### Mencatat pekerjaan

1. Buka menu **Log Kerja**. Di bagian **Catat pekerjaan**, isi:
   - **Tanggal**: hari pekerjaan dilakukan (bawaan: hari ini; tidak boleh tanggal yang akan datang).
   - **Durasi**: jam dan menit (menit 0–59; total harus lebih dari 0).
   - **Aktivitas**: apa yang dikerjakan, singkat dan jelas. Contoh: *Rapat dengan BUMDES Amanah*.
   - **Bukti** (boleh kosong): link dokumen/foto (mis. Google Drive) atau keterangan singkat.
2. Tekan **Simpan log**. Log langsung muncul di daftar **Log saya**. Kolom aktivitas, durasi, dan bukti dikosongkan lagi; tanggal tetap, jadi Anda bisa langsung mencatat pekerjaan berikutnya di hari yang sama.
3. Satu hari boleh berisi beberapa log. Catat sebaiknya setiap hari, jangan ditumpuk di akhir periode.

![Kotak Catat pekerjaan](/prosedur/gambar/app01-catat)

### Membaca kartu ringkasan

- **Sisa jam minggu ini** = jam mingguan Anda dikurangi jam yang sudah dicatat minggu ini (Senin–Minggu). Bila sudah terpenuhi, kartu menampilkan **Target tercapai**.
- **Ketercapaian periode berjalan** = total jam periode ini ÷ ekspektasi bulanan, lengkap dengan garis progres.

![Kartu Sisa jam minggu ini dan Ketercapaian periode berjalan](/prosedur/gambar/app01-kartu)

| Status kerja | Jam mingguan | Ekspektasi bulanan (× 4) |
|---|---|---|
| PKWTT | 40 jam | 160 jam |
| PKWT | 20 jam | 80 jam |
| Intern | 20 jam | 80 jam |

### Mengubah, menghapus, melihat periode lain

1. Di **Log saya**, pilih **Periode** untuk melihat log periode lain.
2. Tekan **Ubah** pada sebuah log untuk memperbaiki isinya, lalu **Simpan perubahan**. Tekan **Hapus** untuk menghapusnya.
3. Tombol **Ubah**/**Hapus** hanya ada selama periodenya **belum ditutup**.
4. **Unduh Excel** (bagian bawah halaman) untuk mengunduh log per periode.
5. Bagian **Riwayat ketercapaian (periode ditutup)** menampilkan nilai yang sudah dikunci per periode.

### Aturan penting

- **Periode bulanan** berjalan dari **tanggal 29 bulan lalu sampai tanggal 28 bulan ini**. Log tanggal 29–31 masuk periode bulan berikutnya (otomatis).
- Setelah admin **menutup periode**, ketercapaian dikunci dan **tidak dihitung ulang**. Log yang ditambahkan untuk periode yang sudah ditutup diberi tanda **Koreksi** dan tidak mengubah nilai yang dikunci.
- Hanya admin yang boleh mengubah/menghapus log di periode yang sudah ditutup (atau log milik orang lain). Setiap perubahan admin wajib disertai alasan dan tercatat di riwayat perubahan.

### Kalau ada masalah

- **"Tanggal tidak boleh di masa depan"**: pilih tanggal hari ini atau sebelumnya.
- **"Durasi harus lebih dari 0"**: isi jam atau menit.
- **Salah isi di periode yang sudah ditutup**: hubungi admin (Corporate Affairs) dan sebutkan log mana serta alasannya.
- **"Sesi login berakhir"**: masuk lagi lewat link email, lalu ulangi.

Kata kunci: ATS, log harian, jam kerja, timesheet, catat pekerjaan, ketercapaian, periode, tutup periode, koreksi, unduh excel`,
  },
  {
    code: "APP-02",
    title: "Panduan: Menambahkan & mengelola Tugas",
    sort: 102,
    replaces: "To-do list",
    body: `> Buka menu **[Tugas](/tugas)**. Semua karyawan bisa melihat semua tugas (transparansi lintas departemen).

**Tujuan:** mencatat, membagi, dan memantau pekerjaan (to-do & sprint) per departemen sampai selesai.

**Siapa:** semua karyawan. Hak mengubah:

| Peran | Tambah tugas | Ubah status & isi | Hapus |
|---|---|---|---|
| Staff | Di departemen sendiri | Tugas yang ia menjadi PIC-nya | — |
| Head | Di departemen sendiri | Semua tugas departemennya | Tugas departemennya |
| CEO | Semua departemen | Semua tugas | — |
| Admin | Semua departemen | Semua tugas | Semua tugas |

### Menambahkan tugas

1. Di halaman **Tugas**, tekan tombol bulat **+** (*Tambah tugas*). Dari Dashboard bisa juga lewat tombol **Tambah tugas**.
2. Isi **Judul tugas**, **Departemen**, **Status**, **Tanggal mulai**, **Deadline**, dan **Sprint** (atau *Tanpa sprint*). Centang **Prioritas** bila mendesak.
3. Pilih **PIC (minimal satu)**: klik nama untuk memilih/melepas, lalu **Selesai memilih**. Tambahkan **Support** bila ada yang membantu.
4. Bila perlu, isi **Workstream**, **Output** (hasil yang diharapkan), dan **Keterangan**.
5. Tekan **Tambah tugas**. Kode tugas (mis. *CA-102*) dibuat otomatis.

![Form Tambah tugas](/prosedur/gambar/app02-tambah)

### Mengelola tugas

1. **Ubah status** lewat pilihan status di kartu: **Belum Mulai → Berjalan → Pending → Selesai**.
2. **Pending**: saat status diubah ke Pending, panel **Pengingat** terbuka. Isi **Ingatkan saya pada** (tanggal & jam) lalu **Simpan pengingat**. Pengingat bersifat **pribadi**: hanya Anda yang menerimanya (di lonceng notifikasi).
3. **Catatan**: tekan **Catatan**, tulis, lalu **Tambahkan catatan**. Catatan terlihat oleh semua karyawan, dan semua **PIC** tugas itu (selain penulisnya) mendapat notifikasi **Komentar** di lonceng.
4. **Delegasikan**: tekan **Delegasikan**, pilih orang di **Delegasikan kepada**. Orang itu ditambahkan sebagai PIC (PIC lama tetap) dan mendapat notifikasi.
5. **Ubah**: mengganti judul, deadline, PIC/support, dll., lalu **Simpan perubahan**. **Hapus** hanya untuk head (departemennya) dan admin.
6. **Pilih banyak**: centang beberapa tugas sekaligus untuk mengubah status, sprint, prioritas, deadline, atau menambah PIC, lalu **Terapkan ke … tugas**.

![Kartu tugas dengan tombol Catatan, Delegasikan, dan Ubah](/prosedur/gambar/app02-kartu)

### Mencari dan mengurutkan

- **Cari tugas**: ketik di kotak pencarian; daftar langsung tersaring (judul, kode, output, catatan, nama PIC/support). Huruf besar/kecil diabaikan, semua kata harus ada, kata yang cocok diberi warna.
- **Filter**: departemen, sprint, PIC (*Saya sebagai PIC* untuk tugas Anda), status, rentang deadline, **Hanya yang terlambat**, **Hanya prioritas**.
- **Urutkan**: Deadline, Prioritas, Judul A-Z, atau **Terbaru dibuat**; pilih arahnya di sebelahnya.
- **Tampilan**: Daftar, Grid, Kanban, atau Per PIC.
- Bawaan halaman memuat sprint berjalan + mendatang; pilih sprint lain di filter **Sprint** bila perlu.

![Baris filter dan pilihan Urutkan](/prosedur/gambar/app02-filter)

### Aturan penting

- Tugas yang **lewat deadline dan belum Selesai** otomatis bertanda **Terlambat**.
- PIC menerima notifikasi deadline **H-3, H-2, dan H-1**.
- Setiap tambah/ubah/hapus tugas serta PIC/support tercatat di **[Riwayat](/tugas/riwayat)**.
- Kode **SOP** di kartu tugas bisa diklik untuk membuka prosedurnya.

### Kalau ada masalah

- **Tombol Ubah/Delegasikan tidak muncul**: Anda bukan PIC tugas itu. Minta PIC atau head departemen untuk mengubahnya, atau minta didelegasikan.
- **Tugas tidak terlihat**: periksa filter (terutama **Sprint** dan **Status**), atau pilih *Semua sprint*.
- **Tidak bisa menambah tugas di departemen lain**: hanya admin/CEO yang bisa; minta head departemen tersebut.

Kata kunci: to-do, todo list, tugas, sprint, kanban, PIC, support, delegasi, pengingat, pending, terlambat, deadline, catatan tugas, komentar, notifikasi, riwayat tugas`,
  },

  // ---------- Bagian B: pengajuan & persetujuan ----------
  {
    code: "APP-03",
    title: "Panduan: Pengajuan (cara kerja umum)",
    sort: 103,
    body: `> Buka menu **[Pengajuan](/pengajuan)**. Berlaku untuk reimburse, permintaan pembayaran, pengadaan, perjalanan dinas, dan klaim komisi.

**Tujuan:** memahami cara mengajukan, memantau status, dan memperbaiki pengajuan, apa pun jenisnya.

**Siapa:** semua karyawan (pemohon). Peninjau lihat *Panduan: Review F&A & persetujuan CEO*.

### Membuat pengajuan

1. Buka **Pengajuan**. Di bagian atas ada tombol untuk setiap jenis: **+ Ajukan reimburse**, **+ Permintaan pembayaran**, **+ Pengadaan barang/jasa**, **+ Perjalanan dinas**, **+ Klaim komisi**.
2. Isi formnya (lihat panduan per jenis), lalu tekan tombol kirim di bagian bawah.
3. Nomor pengajuan dibuat otomatis, mis. *RB-…* (reimburse), *PP-…* (pembayaran), *PD-…* (dinas). Peninjau langsung mendapat notifikasi.

![Halaman Pengajuan](/prosedur/gambar/app03-daftar)

### Lampiran = link

Bukti nota, invoice, dan dokumen lain **hanya berupa link** (mis. Google Drive). Pastikan link bisa dibuka oleh Finance (atur berbagi: *siapa saja yang memiliki link*).

### Memantau status

- Halaman **Pengajuan** dibagi menjadi **Perlu tindakan Anda**, **Sedang berjalan**, dan **Selesai**.
- Klik sebuah pengajuan untuk melihat rincian, status, dan **riwayat** (siapa mengubah apa, kapan, dengan catatan apa).
- Status umum: **Belum di-review → Sedang di-review → Diterima → Ditransfer**. Jenis tertentu punya langkah tambahan (mis. *Menunggu CEO*, *Surat tugas terbit*, *PO terbit*).
- Setiap perubahan status dan catatan baru muncul di **lonceng notifikasi**.

### Batas waktu (SLA)

- Setiap status maksimal **2 hari kerja** (Sabtu, Minggu, dan hari libur tidak dihitung). Batasnya tampil sebagai **Batas SLA** di rincian.
- Bila terlewati, pengajuan bertanda **Lewat SLA** dan peninjau mendapat pengingat.

### Catatan, perbaikan, dan penolakan

1. Di halaman rincian, tulis di kolom catatan (*Tulis catatan untuk F&A*) lalu **Kirim catatan** untuk bertanya atau menambah informasi.
2. Bila status **Perlu perbaikan**: baca catatan peninjau, tekan **Perbaiki & kirim ulang**, ubah isinya, lalu **Simpan & kirim ulang**.
3. Bila status **Ditolak**: alasan penolakan ada di riwayat. Ajukan baru bila memang perlu.
4. Selama berstatus *Belum di-review* atau sesudahnya, isi pengajuan tidak bisa diubah sendiri. Kirim catatan bila ada yang salah.

![Rincian pengajuan: status, Batas SLA, riwayat, dan kolom catatan](/prosedur/gambar/app03-rincian)

### Aturan penting

- Satu pengajuan = satu transaksi/kebutuhan.
- Anda tidak bisa menyetujui pengajuan milik Anda sendiri.
- Nilai **≥ Rp5.000.000**: CEO menerima notifikasi; untuk permintaan pembayaran dan pengadaan, CEO juga harus menyetujui.

### Kalau ada masalah

- **Lewat SLA tanpa kabar**: kirim catatan di pengajuan tersebut, atau hubungi Finance & Accounting.
- **Salah jenis form**: kirim catatan ke F&A agar ditolak, lalu ajukan lagi dengan form yang benar.

Kata kunci: pengajuan, status, SLA, 2 hari kerja, perlu perbaikan, ditolak, catatan, notifikasi, nomor pengajuan, lampiran, link`,
  },
  {
    code: "APP-04",
    title: "Panduan: Klaim reimburse",
    sort: 104,
    body: `> Ajukan lewat **[Pengajuan > + Ajukan reimburse](/pengajuan/reimburse/baru)**. Cara kerja umum: *Panduan: Pengajuan (cara kerja umum)*.

**Tujuan:** mengganti uang pribadi yang Anda pakai untuk keperluan perusahaan.

**Siapa:** semua karyawan, nominal berapa pun. Ditinjau Finance & Accounting (F&A).

### Langkah

1. Buka **Pengajuan**, tekan **+ Ajukan reimburse**.
2. Isi form:
   - **Tanggal transaksi**: tanggal pembelian/pembayaran, **bukan** tanggal mengisi form.
   - **Uraian transaksi**: satu kalimat ringkas. Contoh: *Transport & konsumsi pameran ISEF 2026, 17–19 Okt*.
   - **Detail transaksi** (boleh kosong): rincian per item, satu baris per item.
   - **Kategori transaksi** (boleh lebih dari satu), mis. Biaya Transportasi, Biaya Konsumsi. Pilih **Lainnya** lalu tulis sendiri bila tidak ada yang cocok.
   - **Jumlah (Rp)**: total yang diminta, angka saja.
   - **Bukti nota**: tempel link foto/PDF nota (mis. Google Drive). Boleh beberapa link.
   - **Mission report**: isi **Kegiatan**, **Deskripsi kegiatan**, **Hasil kegiatan**, **Evaluasi dan rekomendasi**. Bila tidak ada, centang **Tidak ada mission report** dan isi **Alasan** (mis. *one-time purchase, pembelian meterai*).
3. Tekan **Kirim pengajuan**.
4. Pantau statusnya: **Belum di-review → Sedang di-review → Diterima → Ditransfer**. Saat ditransfer, F&A mencatat tanggal transfer (dan bisa melampirkan bukti transfer).

![Form reimburse](/prosedur/gambar/app04-form)

![Bagian Mission report](/prosedur/gambar/app04-mission)

### Aturan penting

- Satu pengajuan = satu transaksi. Beberapa nota untuk satu transaksi = beberapa link bukti.
- Nilai ≥ Rp5.000.000: CEO mendapat notifikasi (tidak perlu persetujuan CEO).
- Setiap status maksimal 2 hari kerja.

### Kalau ada masalah

- **"Pilih minimal satu kategori transaksi"**: centang setidaknya satu kategori.
- **"Tempel link bukti nota"**: bukti wajib diisi berupa link.
- **Perlu perbaikan**: buka pengajuan, tekan **Perbaiki & kirim ulang**, lalu **Simpan & kirim ulang**.

Kata kunci: reimburse, reimbursement, ganti uang, nota, kuitansi, bukti pembayaran, mission report, transfer`,
  },
  {
    code: "APP-05",
    title: "Panduan: Permintaan pembayaran",
    sort: 105,
    body: `> Ajukan lewat **[Pengajuan > + Permintaan pembayaran](/pengajuan/pembayaran/baru)**. Cara kerja umum: *Panduan: Pengajuan (cara kerja umum)*.

**Tujuan:** meminta F&A membayar langsung ke vendor/pihak lain (bukan mengganti uang pribadi; untuk itu pakai reimburse).

**Siapa:** semua karyawan. Ditinjau F&A; nilai ≥ Rp5.000.000 juga disetujui CEO.

### Langkah

1. Buka **Pengajuan**, tekan **+ Permintaan pembayaran**.
2. Isi form:
   - **Prioritas pembayaran**: *Segera* (urgent / jatuh tempo hari ini), *Normal* (sesuai jadwal), atau *Tunda / terjadwal*.
   - **Tanggal pembayaran** yang diminta.
   - **Metode pembayaran**: QRIS, Virtual Account, Bank Transfer, atau Lainnya (tulis sendiri).
   - **Jumlah (Rp)**.
   - **Vendor / nama penerima dan wilayah**. Contoh: *PT Cahya Jaya Abadi Bandung*.
   - **Nomor rekening / VA / QRIS**, sertakan nama bank dan nama pemilik rekening.
   - **Tujuan pembayaran**. Contoh: *Pelunasan invoice pakan udang batch Oktober*.
   - **Invoice atau dokumen pendukung**: link.
   - **Terkait kontrak**: *Sesuai kontrak yang sudah ada dengan vendor* dan/atau *Pembayaran sekali*.
3. Tekan **Kirim permintaan**.

![Form permintaan pembayaran](/prosedur/gambar/app05-form)

### Alur status

1. **Belum di-review → Sedang di-review** (F&A).
2. F&A menekan **Terima**:
   - di bawah Rp5 juta → **Diterima**;
   - **≥ Rp5 juta → Menunggu CEO**, lalu CEO menekan **Setujui (CEO)** → **Diterima**.
3. F&A membayar dan menekan **Tandai ditransfer** (dengan tanggal transfer) → **Ditransfer**.

### Aturan penting

- Prioritas **Segera** tampil paling atas di antrian F&A dan berlabel merah. Pakai hanya bila benar-benar jatuh tempo.
- Setiap status maksimal 2 hari kerja.

### Kalau ada masalah

- **"Centang minimal satu pilihan"**: isi bagian *Terkait kontrak*.
- **Menunggu CEO terlalu lama**: kirim catatan di pengajuan, atau hubungi F&A.

Kata kunci: permintaan pembayaran, bayar vendor, invoice, transfer, rekening, virtual account, QRIS, segera, urgent, persetujuan CEO`,
  },
  {
    code: "APP-06",
    title: "Panduan: Perjalanan dinas",
    sort: 106,
    body: `> Ajukan lewat **[Pengajuan > + Perjalanan dinas](/pengajuan/dinas/baru)**. Tarif & aturan lengkap: prosedur *Penugasan perjalanan dinas*.

**Tujuan:** mengajukan penugasan dinas, mendapat surat tugas, uang muka (bila perlu), dan menyelesaikan laporannya.

**Siapa:** pemohon (karyawan yang berangkat), penugas (head/pimpinan yang menugaskan), Corporate Affairs (surat tugas), Finance (verifikasi & uang muka).

### Langkah pemohon

1. Buka **Pengajuan**, tekan **+ Perjalanan dinas**. Ajukan **minimal 3 hari kerja** sebelum berangkat.
2. Isi form:
   - **Ditugaskan oleh**: pilih penugas (head/pimpinan yang menugaskan).
   - **Tujuan / lokasi** dan **Target tugas**.
   - **Tanggal berangkat** dan **Tanggal kembali**.
   - **Jarak dari kantor (km)**: menentukan zona (Lokal ≤ 30 km, Dalam provinsi ≤ 150 km, Luar provinsi).
   - **Tiket pesawat/kereta/bus (estimasi)**, **Kendaraan pribadi (km pulang-pergi)**, **Estimasi representasi** (hanya golongan tertentu).
   - **Uang muka diminta?** Ya/Tidak.
3. Periksa kotak **Perhitungan estimasi** (zona, jumlah hari, uang harian, hotel, transport, total). Angkanya dihitung otomatis dari golongan jabatan Anda.
4. Bila kurang dari 3 hari kerja sebelum berangkat, tulis **alasan darurat**.
5. Tekan **Kirim penugasan**.
6. Setelah kembali, buka pengajuan dan tempel link FPTD & laporan misi di bagian **FPTD & laporan misi**, lalu tekan **Kirim FPTD & laporan misi**. Batasnya **3 hari kerja** setelah kembali (tertulis di rincian).

![Form perjalanan dinas](/prosedur/gambar/app06-form)

![Kotak Perhitungan estimasi](/prosedur/gambar/app06-hitung)

### Alur status

1. **Diajukan** → penugas menekan **Setujui penugasan** → **Disetujui penugas**.
2. Corporate Affairs menekan **Terbitkan surat tugas** → **Surat tugas terbit** (nomor *ST-…* otomatis).
3. Finance menekan **Verifikasi Finance** → **Diverifikasi Finance**.
4. Bila uang muka diminta: Finance menekan **Tandai uang muka dicairkan** (dengan tanggal) → **Uang muka dicairkan**.
5. Setelah FPTD & laporan misi masuk, Finance menekan **Tandai selesai** → **Selesai**.

### Langkah penugas / Corporate Affairs / Finance

- Penugasan yang menunggu Anda muncul di **Pengajuan > Perlu tindakan Anda** dan di lonceng notifikasi.
- Buka pengajuannya, periksa isinya, lalu tekan tombol tahap Anda. **Perlu perbaikan** dan **Tolak** wajib disertai catatan.

### Aturan penting

- Golongan jabatan diatur admin (Admin > Karyawan); tarif per golongan di Admin > Tarif dinas.
- Representasi tidak boleh melebihi plafon golongan.
- FPTD & laporan misi yang lewat batas bertanda **Terlambat**.

### Kalau ada masalah

- **"Representasi melebihi plafon golongan Anda"** / **"Golongan Anda tidak mendapat biaya representasi"**: kurangi atau kosongkan representasi.
- **Golongan/tarif tidak sesuai**: hubungi admin (Corporate Affairs).
- **"Tanggal kembali tidak boleh sebelum tanggal berangkat"**: periksa tanggal.

Kata kunci: dinas, perjalanan dinas, surat tugas, ST, uang muka, uang harian, hotel, FPTD, laporan misi, penugas, golongan`,
  },
  {
    code: "APP-07",
    title: "Panduan: Pengadaan barang & jasa",
    sort: 107,
    body: `> Ajukan lewat **[Pengajuan > + Pengadaan barang/jasa](/pengajuan/pengadaan/baru)**. Aturan lengkap: prosedur *Permohonan pengadaan*.

**Tujuan:** setiap pembelian dibandingkan vendornya, disetujui sesuai wewenang, dan dibayar setelah barang/jasa diterima sesuai PO.

**Siapa:** pemohon, head departemen pemohon, TechOps (TO), Finance, Head F&A, CEO (nilai ≥ Rp5 juta).

### Langkah pemohon

1. Buka **Pengajuan**, tekan **+ Pengadaan barang/jasa**.
2. Isi **Judul kebutuhan** (mis. *Laptop untuk staf Digital Marketing*), **Spesifikasi** (merek/tipe, ukuran, kapasitas, atau lingkup jasa), **Jumlah** + **Satuan**, **Estimasi harga total (Rp)**, **Sudah dianggarkan?**, **Tanggal dibutuhkan**, dan lampiran (link, boleh kosong).
3. Tekan **Kirim permohonan**. Head departemen Anda meninjau maksimal 1×24 jam.
4. Saat barang/jasa datang (status **PO terbit**), cek jumlah, spesifikasi, dan kondisi, lalu tekan **Diterima sesuai (GRN/BAST)**, atau **Retur ke vendor** (wajib catatan) bila tidak sesuai.

![Form pengadaan](/prosedur/gambar/app07-form)

### Alur status & siapa yang menekan

| Tahap | Siapa | Tombol | Status sesudahnya |
|---|---|---|---|
| 1 | Head dept pemohon | **Setujui PR** | Disetujui head |
| 2 | TechOps | isi ≥ 3 vendor, pilih rekomendasi, **Kirim perbandingan ke Finance** | Vendor dibandingkan |
| 3 | Finance | **Verifikasi Finance** (cek kelengkapan, anggaran, duplikasi) | Diverifikasi Finance |
| 4 | Head F&A | pilih vendor & metode, **Setujui vendor & metode** | Disetujui Head F&A (≥ Rp5 jt: Menunggu CEO) |
| 5 | CEO (≥ Rp5 jt) | **Setujui (CEO)** | Disetujui CEO |
| 6 | Finance | **Terbitkan PO** (nomor *PO-…* otomatis) | PO terbit |
| 7 | TechOps / pemohon | **Diterima sesuai (GRN/BAST)** atau **Retur ke vendor** → **Pengganti diterima sesuai** | Barang/jasa diterima |
| 8 | Head F&A | **Setujui pembayaran (PO, GRN, invoice cocok)** | Pembayaran disetujui |
| 9 | Finance | **Tandai dibayar ke vendor** | Dibayar ke vendor |
| 10 | Finance / TechOps | **Selesai: aset/stok dicatat** (catatan wajib) | Selesai |

![Perbandingan vendor oleh TechOps](/prosedur/gambar/app07-vendor)

### Aturan penting

- Minimal **3 vendor** dibandingkan, utamakan vendor di Approved Vendor List.
- PR sampai PO maksimal 5 hari kerja; retur maksimal 1×24 jam.
- Setelah selesai, barang dicatat di **[Aset](/aset)** atau **[Stok](/stok)**.
- Di setiap tahap, peninjau bisa **Perlu perbaikan** atau **Tolak** (wajib catatan).

### Kalau ada masalah

- **Tidak tahu sedang di tahap siapa**: lihat status dan riwayat di rincian pengajuan.
- **Barang rusak/tidak sesuai**: tekan **Retur ke vendor** dan jelaskan di catatan.

Kata kunci: pengadaan, PR, purchase request, PO, purchase order, vendor, perbandingan vendor, GRN, BAST, retur, TechOps, pembelian barang`,
  },
  {
    code: "APP-08",
    title: "Panduan: Review F&A & persetujuan CEO",
    sort: 108,
    dept: "FA",
    body: `> Buka **[Pengajuan > Review F&A](/pengajuan/review)**. Tombol ini hanya tampil untuk F&A, admin, dan CEO.

**Tujuan:** meninjau semua pengajuan tepat waktu (SLA 2 hari kerja per status) dan memberi keputusan yang jelas.

**Siapa:** departemen Finance & Accounting dan admin (peninjau); CEO (persetujuan ≥ Rp5 juta; selain itu hanya melihat).

### Langkah peninjau F&A

1. Buka **Pengajuan**, tekan **Review F&A**. Pilih tab status (mis. **Belum di-review**) dan filter **Jenis:** bila perlu.
2. Antrian diurutkan dari yang paling lama menunggu; permintaan pembayaran **Segera** selalu paling atas. Perhatikan label **Lewat SLA**.
3. Buka sebuah pengajuan, periksa isi dan link lampirannya.
4. Pilih tindakan di panel **Tindakan peninjau**:
   - **Mulai review**: tandai sedang diperiksa (Sedang di-review).
   - **Terima**: pengajuan disetujui F&A. Permintaan pembayaran ≥ Rp5 juta otomatis masuk **Menunggu CEO**.
   - **Perlu perbaikan**: kembali ke pemohon (tulis apa yang harus diperbaiki).
   - **Tolak**: wajib alasan.
   - **Kirim catatan saja**: bertanya tanpa mengubah status.
5. Setelah uang dikirim, tekan **Tandai ditransfer** dan isi **Tanggal transfer** (bukti transfer boleh dilampirkan).

![Halaman Review F&A](/prosedur/gambar/app08-antrian)

![Panel Tindakan peninjau](/prosedur/gambar/app08-panel)

### Tahap khusus

- **Perjalanan dinas**: **Verifikasi Finance** setelah surat tugas terbit → **Tandai uang muka dicairkan** (bila diminta) → **Tandai selesai** setelah FPTD & laporan misi masuk.
- **Pengadaan**: **Verifikasi Finance** → **Terbitkan PO** → **Tandai dibayar ke vendor**. Head F&A memilih vendor (**Setujui vendor & metode**) dan **Setujui pembayaran (PO, GRN, invoice cocok)**.
- **Klaim komisi**: centang **Penjualan sudah lunas** (cek pembayaran customer) sebelum **Terima**.

### Langkah CEO

1. Pengajuan yang menunggu Anda ada di tab **Menunggu CEO** (dan di lonceng notifikasi).
2. Buka, periksa, lalu tekan **Setujui (CEO)**, **Perlu perbaikan**, atau **Tolak** (dua terakhir wajib catatan).

### Aturan penting

- Anda tidak bisa memutuskan pengajuan milik Anda sendiri.
- Setiap status maksimal **2 hari kerja**; semua tindakan dan catatan tercatat di riwayat dan terlihat pemohon.
- Tulis catatan yang jelas: pemohon membacanya untuk memperbaiki pengajuan.

### Kalau ada masalah

- **"Tulis catatan/alasan dulu di kolom catatan"**: isi kolom catatan sebelum Perlu perbaikan/Tolak/Retur.
- **Tombol tindakan tidak muncul**: pengajuan sedang di tahap orang lain (lihat status), atau itu pengajuan Anda sendiri.

Kata kunci: review, review F&A, peninjau, finance, approval, persetujuan, CEO, menunggu CEO, terima, tolak, perlu perbaikan, tandai ditransfer, SLA, antrian`,
  },

  // ---------- Bagian C: penjualan & aset, aquaculture, komisi ----------
  {
    code: "APP-09",
    title: "Panduan: Pipeline penjualan (lead sampai purna jual)",
    sort: 109,
    body: `> Buka menu **Penjualan & Aset > [Pipeline penjualan](/penjualan)**. Aturan lengkap: prosedur *Stock, supply, & demand teknologi*.

**Tujuan:** mencatat setiap lead penjualan teknologi (aerator, EBII, Smart Energy, panel surya) dan memantaunya sampai lunas, terpasang, dan mendapat feedback.

**Siapa:** semua karyawan boleh mencatat lead (mis. dari referral). Sales (BDS) mengelola tahapnya; head BDS (CMO) menyetujui quotation; Finance menandai lunas; TechOps memasang.

### Mencatat lead

1. Tekan **+ Catat lead** (atau menu **Catat lead**). Catat paling lambat **1×24 jam** setelah lead masuk.
2. Isi **Tanggal lead masuk**, **Sumber lead** (Digital marketing, Referral, Event, Kunjungan, Lainnya), **Kode referral** (format *CRU-NAMA*, boleh kosong), **Nama customer**, kontak (no. HP/WA), lokasi (tambak/kota), **Produk yang diminati**, **Jumlah unit**, perkiraan nilai (Rp, excl. VAT), **PIC sales**, dan catatan kebutuhan.
3. Tekan **Simpan lead**. Nomor lead dibuat otomatis.

![Form Catat lead](/prosedur/gambar/app09-lead)

### Menggerakkan tahap

Buka lead, lalu gunakan panel **Ubah tahap**: pilih **Pindah ke tahap** lalu **Simpan tahap**.

| Tahap | Siapa | Catatan |
|---|---|---|
| Lead masuk → Kontak awal → Site visit → Stok dicek → Quotation | PIC sales | Site visit report ≤ 2 hari kerja; cek stok ke TechOps ≤ 1 hari kerja |
| Disetujui CMO | Head BDS | Bila ada diskon, quotation custom, atau nilai besar: **Setujui quotation (CMO)** |
| Negosiasi → Kontrak | PIC sales | Follow-up ≤ 2×24 jam; kontrak lewat Corporate Affairs bila perlu |
| Closing (Sales Order) | PIC sales | **Closing: buat Sales Order**: isi no. SO/invoice/kontrak + tanggal closing, lalu **Tandai closing** |
| Lunas | Finance | **Tandai lunas** + tanggal pelunasan |
| Work order | PIC sales / TechOps | **Terbitkan work order instalasi** (stok keluar otomatis) |
| Terpasang (BAST) | PIC sales / TechOps | **Tandai terpasang** + tanggal instalasi & BAST |
| Feedback customer | PIC sales | Tulis hasil follow-up H+7 di catatan, lalu **Simpan feedback customer** |

![Panel Ubah tahap di halaman lead](/prosedur/gambar/app09-tahap)

### Catatan & keluhan

- Tulis di kolom **Catatan** lalu **Kirim catatan**.
- Untuk keluhan customer, centang **Ini keluhan customer** lalu **Catat keluhan**. Keluhan diteruskan ke TechOps (tangani ≤ 1×24 jam).

### Aturan penting

- Pastikan produk, unit, dan nilai sudah final sebelum closing: setelah closing data terkunci.
- **Tandai gagal** wajib alasan dan hanya bisa sebelum lunas. Head BDS/CEO/admin bisa **Buka lagi lead ini** atau memundurkan tahap (wajib alasan).
- Penjualan lunas masuk realisasi **Target kuartal** dan bisa diklaim komisinya (lihat *Panduan: Klaim komisi*).

### Kalau ada masalah

- **"Kode tidak dikenal"**: periksa kode referral di halaman **Profil** pemiliknya, atau kosongkan.
- **"Tahap tidak bisa diubah …"**: tahap itu bukan wewenang Anda (mis. Lunas hanya Finance) atau urutannya belum sampai.

Kata kunci: penjualan, sales, lead, pipeline, quotation, CMO, closing, sales order, SO, lunas, work order, instalasi, BAST, feedback, keluhan, referral`,
  },
  {
    code: "APP-10",
    title: "Panduan: Stok & Aset",
    sort: 110,
    body: `> Buka menu **Penjualan & Aset > [Stok](/stok)** dan **[Aset](/aset)**. Aturan lengkap: prosedur *Manajemen aset*.

**Tujuan:** tahu stok yang tersedia dibanding kebutuhan penjualan, dan mencatat setiap aset dari serah terima sampai penghapusan.

**Siapa:** semua karyawan bisa melihat. Stok dikelola TechOps, Finance, dan admin. Aset: TechOps (serah terima, penempatan, pemeliharaan), Finance (registrasi), siapa saja (lapor rusak/hilang, usul hapus), CEO + Head F&A (setujui penghapusan).

### Stok

1. Halaman **Stok** menampilkan per barang: **Tersedia**, **Kebutuhan** (dari lead di tahap quotation sampai lunas), dan **Selisih**. Stok di bawah batas minimal diberi tanda.
2. Barang baru: tekan **+ Barang stok**, isi nama barang/komponen, kode, produk terkait, **Satuan**, **Stok minimal**, lalu **Simpan**.
3. Mencatat barang masuk/keluar: di **Catat mutasi stok**, pilih **Barang**, **Jenis** (Masuk, Keluar, Penyesuaian (opname)), jumlah, **Tanggal**, dan **Catatan** (no. PR/PO/GRN, no. lead), lalu **Simpan mutasi stok**.
4. Work order instalasi di Penjualan mengurangi stok **otomatis**; jangan dicatat dua kali.
5. Koreksi dilakukan lewat **Penyesuaian (opname)**, bukan menghapus mutasi.

![Halaman Stok](/prosedur/gambar/app10-stok)

### Aset

1. **Serah terima (TechOps):** tekan **+ Serah terima aset**, isi **Nama aset**, **Kategori**, **Tanggal serah terima (BAST)**, **Lokasi**, nilai perolehan, umur manfaat (bulan), referensi (No. PO/GRN/link BAST), lalu **Simpan serah terima**. Status: *Diterima (belum terdaftar)*.
2. **Registrasi (Finance, ≤ 5 hari kerja setelah BAST):** buka aset, isi bagian **Registrasi aset**, tekan **Registrasi & beri kode**. Kode unik dibuat otomatis. Status: *Terdaftar*.
3. **Penempatan (TechOps):** isi **Penerima** dan **Lokasi penempatan**, tekan **Tandai ditempatkan**. Untuk menarik kembali: **Tarik kembali ke gudang**.
4. **Pemeliharaan & stock opname:** catat di riwayat aset dengan **Jenis catatan** *Pemeliharaan* atau *Stock opname*, lalu **Simpan**.
5. **Rusak/hilang (siapa saja, ≤ 1 hari kerja):** tulis keterangan, tekan **Lapor rusak** atau **Lapor hilang**. Setelah diperbaiki, TechOps menekan **Sudah beres, kembali terdaftar**.
6. **Penghapusan:** tulis alasan, tekan **Usulkan penghapusan**. Aset baru *Dihapus* setelah **CEO dan Head F&A** sama-sama menekan **Setujui penghapusan**; salah satu boleh **Tolak penghapusan**.

![Panel status di halaman aset](/prosedur/gambar/app10-aset)

### Aturan penting

- Lapor rusak/hilang, usul hapus, tolak, dan kembali terdaftar **wajib** keterangan di kolom catatan.
- Barang dari pengadaan yang sudah diterima dicatat ke Aset atau Stok (tahap terakhir pengadaan).

### Kalau ada masalah

- **"Tulis keterangan/alasan dulu di kolom catatan"**: isi keterangan sebelum menekan tombol.
- **Tidak bisa mencatat mutasi stok**: hanya TechOps, Finance, dan admin; minta mereka mencatatnya.

Kata kunci: stok, inventaris, gudang, mutasi stok, opname, supply demand, aset, BAST, registrasi aset, kode aset, penempatan, pemeliharaan, rusak, hilang, penghapusan aset`,
  },
  {
    code: "APP-11",
    title: "Panduan: Project Management (Aquaculture, Grant, CSR)",
    sort: 111,
    dept: "AQ",
    body: `> Buka menu **Project Management > [Project berjalan](/projects)**.

**Tujuan:** mengelola proyek Aquagrowth, Mini RAS, Workshop, dan Pelatihan dari identifikasi peluang, kelayakan finansial & RAB, kontrak, sampai eksekusi dan panen; dana masuknya otomatis menjadi realisasi target kuartal. Proyek **Grant** dan **CSR** memakai alur yang lebih sederhana (bagian 5).

**Siapa:** semua karyawan bisa melihat dan memberi catatan. Tim Aquaculture (AQ), admin, dan CEO mengubah data & tahap (Grant/CSR: PIC proyek juga boleh update status). F&A meninjau paket RAB; CEO menyetujui. Corporate Affairs membantu kontrak. F&A/admin/CEO mencatat dana masuk.

### 1. Catat peluang

1. Tekan **+ Catat peluang** (atau menu **Catat peluang proyek**).
2. Isi **Jenis proyek**, **Nama proyek**, **Lokasi**, calon mitra/investor/peserta, kontak, asal peluang, deskripsi (latar belakang, potensi, skala), perkiraan nilai (Rp), **Perkiraan mulai**, dan **PIC proyek**.
3. Tekan **Simpan peluang**. Nomor *AQ-…* dibuat otomatis. Tahap: *Identifikasi peluang*.
4. Lewat Excel: tekan **Unduh template Excel**, isi kolom *Isi*, lalu **Isi dari Excel**. Form terisi otomatis; periksa lalu simpan. File hanya dibaca di browser, tidak disimpan.

### 2. Kelayakan finansial & RAB

1. Di halaman proyek, tekan **Susun kelayakan & RAB**.
2. Isi data umum, info komoditas (bila budidaya), baris biaya **A. CAPEX**, **B. Working capital**, **C. OPEX**, proyeksi pendapatan, asumsi bagi hasil & BEP, timeline, dan **Ringkasan kelayakan & asumsi**. Bisa mulai dari **Isi dari contoh template (RAB Aquagrowth Serang)**.
3. Angka laba, margin, ROI, payback, dan BEP dihitung otomatis. Tekan **Simpan draf** kapan saja.
   Bisa juga lewat Excel: **Unduh template Excel** (sheet Umum, Capex, Modal kerja, Opex, Pendapatan, Jadwal), isi, lalu **Isi dari Excel**. Semua baris di form diganti isi file.
4. Bila siap, tekan **Kirim ke F&A**. Isi terkunci sampai ada permintaan perbaikan.
5. F&A/CEO yang membuka **Lihat RAB lengkap (semua baris)** melihat baris dalam tabel ringkas dan bisa menekan **Export ke Excel**.
6. Alur paket (nomor *RA-…*): **Review F&A → Menunggu CEO → Disetujui CEO**. Tahap proyek ikut bergerak otomatis. Bila **Perlu perbaikan**, buka lagi RAB, perbaiki, lalu **Kirim ulang ke F&A**.
7. Review lintas tim (Finance, TechOps, DM): beri catatan di paket atau di proyek (≤ 3 hari kerja).

### 3. Negosiasi, kontrak, eksekusi

Gunakan panel **Ubah tahap** di halaman proyek:

1. **Mulai presentasi & negosiasi** (setelah Disetujui CEO).
2. **Ajukan kontrak ke CA** → isi form kontrak, **Simpan form kontrak** (tahap *Proses kontrak*).
3. **Tandai kontrak ditandatangani** dengan **Tanggal tanda tangan**:
   - **Aquagrowth**: daftar investor (**+ Investor**: nama, modal, persentase; total persentase harus **100%**);
   - **Mini RAS, Workshop, Pelatihan**: cukup nomor kontrak.
4. **Mulai eksekusi**. Setiap akhir bulan kirim laporan: tulis ringkasan, pilih **Bulan**, tempel **Link laporan**, centang **Ini laporan bulanan (dikirim ke Management)**, lalu **Kirim laporan bulanan**.
5. Aquagrowth & Mini RAS: **Masuk tahap panen & penjualan hasil**.
6. **Tandai selesai** (tulis ringkasan hasil di catatan).

![Halaman proyek Aquaculture](/prosedur/gambar/app11-proyek)

### 4. Dana masuk (F&A / admin / CEO)

Begitu proyek masuk **Eksekusi & monitoring**, F&A otomatis mendapat notifikasi yang langsung membuka bagian **Dana masuk**. Setelah kontrak ditandatangani, catat setiap uang yang sudah masuk rekening di **Catat dana masuk**: **Nominal**, **Tanggal diterima**, keterangan, dan **Label alokasi target** (bawaan *Aquagrowth*; panen yang dijual lewat Busdev bisa *Trading Ikan*), lalu **Simpan dana masuk**. Dana ini langsung terhitung di **[Target kuartal](/kpi/target)**.

### 5. Grant, CSR & Proyek lain

1. Pilih jenis **Grant**, **CSR**, atau **Proyek lain** saat mencatat peluang. Tidak ada kelayakan finansial, RAB, atau kontrak. Proyek lain (Aquatour, Webinar, Smallholder, Event P4G, dll.) diberi **Kategori**.
2. Alur Grant/CSR: **Identifikasi peluang → Konsep & proposal → Proposal diajukan → Eksekusi & monitoring → Laporan & pertanggungjawaban → Selesai**. Proyek lain sama, tanpa *Proposal diajukan*.
3. Di panel **Update status**, tulis catatan (wajib; mis. keputusan, link dokumen), lalu tekan **Lanjut ke: …**. Bisa dilakukan tim AQ, admin, CEO, atau **PIC proyek**.
4. Laporan bulanan bisa dikirim mulai tahap Eksekusi.
5. Nomor proyek: Grant *GR-…*, CSR *CSR-…*, Proyek lain *PL-…* (jenis lain *AQ-…*). Dana masuk Grant/CSR dicatat mulai tahap Eksekusi.

### Aturan penting

- Batal, mundur tahap, buka lagi, dan selesai **wajib** catatan/alasan. Proyek tidak bisa dibatalkan saat paket sedang di F&A/CEO.
- Jenis proyek hanya bisa diganti di tahap *Identifikasi peluang* (dan sebelum ada paket RAB).
- Lampiran hanya berupa link. Pengadaan barang untuk proyek tetap lewat *Panduan: Pengadaan barang & jasa*.
- Centang KPI departemen tetap dilakukan manual di **Monitoring KPI**.

### Kalau ada masalah

- **Tombol tahap tidak muncul**: hanya tim AQ, admin, dan CEO (Grant/CSR: juga PIC proyek) yang bisa mengubah tahap.
- **Isi dari Excel gagal**: pakai file dari tombol **Unduh template Excel** dan simpan sebagai *.xlsx*.
- **Total persentase investor bukan 100%**: periksa kembali persentase setiap investor.

Kata kunci: project management, proyek, aquaculture, akuakultur, grant, hibah, CSR, proposal, excel, template, aquagrowth, mini RAS, workshop, pelatihan, peluang proyek, RAB, kelayakan finansial, investor, kontrak, laporan bulanan, panen, dana masuk, target kuartal`,
  },
  {
    code: "APP-12",
    title: "Panduan: Klaim komisi (cara klaim & cara hitung)",
    sort: 112,
    body: `> Ajukan lewat **[Pengajuan > + Klaim komisi](/pengajuan/komisi/baru)**. Master produk: **[Produk & Komisi](/produk)**. Kode referral Anda: **[Profil](/profil)**.

**Tujuan:** mengklaim komisi atas penjualan yang sudah **lunas**, dengan perhitungan yang sama untuk semua orang.

**Siapa:** pemilik kode referral pada penjualan tersebut, atau PIC sales bila penjualan tanpa kode referral. Ditinjau Finance & Accounting.

### Kode referral

- Setiap karyawan punya kode unik, mis. **CRU-NAMA**, di halaman **Profil** (bagian *Kode referral saya*).
- Bagikan kode ini dan pastikan dicantumkan saat lead dicatat di **Pipeline penjualan**. Kode inilah yang menentukan siapa yang berhak mengklaim.

### Langkah klaim

1. Buka **Pengajuan**, tekan **+ Klaim komisi**. (Dari halaman lead yang sudah closing juga ada tombol **Buat klaim komisi**.)
2. **Penjualan dari Pipeline penjualan** (disarankan): di bagian **Ambil dari modul Penjualan** muncul penjualan yang sudah closing dengan kode referral Anda (atau Anda PIC sales-nya). Tekan **+ Tambahkan**. Isinya terisi otomatis.
3. **Penjualan di luar modul Penjualan**: tekan **+ Tambah baris penjualan**, isi **Nama customer**, **No. Invoice / PO / Kontrak**, **Tanggal closing**, **Produk**, **Jumlah unit**, total penjualan (Rp, excl. VAT), justifikasi (link bukti leads), dan kode referral.
4. Satu klaim boleh berisi beberapa baris penjualan. Periksa **Total komisi (perkiraan)**, lalu tekan **Kirim klaim komisi**.
5. Pantau statusnya: **Belum di-review → Sedang di-review → Diterima → Ditransfer**.

![Form klaim komisi](/prosedur/gambar/app12-form)

### Cara hitung (per baris)

| Langkah | Rumus |
|---|---|
| HPP/unit dan % komisi | Dari master produk yang **berlaku pada tanggal closing** |
| HPP penjualan | Jumlah unit × HPP/unit |
| Profit | Total penjualan − HPP penjualan |
| **Komisi** | **Profit × % komisi** (bila profit ≤ 0, komisi = 0) |

Contoh: 2 unit Aerator Mini terjual Rp7.000.000, HPP/unit Rp2.750.000, komisi 5% (angka contoh; selalu cek master produk). HPP penjualan = 2 × 2.750.000 = Rp5.500.000 · Profit = 7.000.000 − 5.500.000 = Rp1.500.000 · Komisi = 1.500.000 × 5% = **Rp75.000**.

Angka di form adalah perkiraan; angka final dihitung sistem saat klaim disimpan.

### Aturan penting

- Komisi **diterima hanya bila penjualan sudah lunas**: untuk baris dari Pipeline penjualan, Finance sudah menandai *Lunas*; untuk baris manual, F&A mencentang **Penjualan sudah lunas** setelah mengecek pembayaran customer.
- Satu penjualan hanya bisa diklaim **sekali**.
- Harga jual di bawah harga minimal (melewati diskon maksimal) menurunkan profit, sehingga komisinya ikut turun.

### Kalau ada masalah

- **Penjualan tidak muncul di "Ambil dari modul Penjualan"**: lead belum closing, kode referral di lead bukan milik Anda, atau sudah pernah diklaim.
- **"Produk ini belum/tidak berlaku pada tanggal closing tersebut"**: periksa tanggal closing, atau hubungi F&A untuk master produk.
- **"Profit ≤ 0: komisi baris ini 0"**: harga jual tidak di atas HPP.

Kata kunci: komisi, klaim komisi, referral, kode referral, CRU, HPP, profit, persen komisi, master produk, lunas, insentif penjualan`,
  },
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const { data: existing, error } = await supabase.from("procedures").select("id, title, sop_code");
if (error) throw error;

for (const p of PROCEDURES) {
  const found =
    existing.find((e) => e.sop_code === p.code) ??
    (p.replaces && existing.find((e) => e.title.toLowerCase() === p.replaces.toLowerCase()));
  const row = { sop_code: p.code, title: p.title, dept_code: p.dept ?? null, sort_order: p.sort, body: p.body };
  const res = found
    ? await supabase.from("procedures").update(row).eq("id", found.id).select("id")
    : await supabase.from("procedures").insert(row).select("id");
  if (res.error) throw res.error;
  console.log(found ? `diperbarui (${found.title})` : "ditambahkan", "-", p.code, p.title, `(${p.body.length} karakter)`);
}
