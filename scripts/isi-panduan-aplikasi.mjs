// Mengisi/memperbarui SOP "panduan aplikasi" (kode APP-xx) di halaman Prosedur.
// node --env-file=.env.local scripts/isi-panduan-aplikasi.mjs
// Butuh SUPABASE_SECRET_KEY. Dicocokkan berdasarkan kode SOP; prosedur dengan judul di `replaces`
// (mis. "To-do list" lama) diganti isinya supaya tidak dobel. Boleh dijalankan ulang.
// Pola setiap SOP: link ke menu > Tujuan > Siapa > Langkah > Aturan penting > Kalau ada masalah > Kata kunci.

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

### Membaca kartu ringkasan

- **Sisa jam minggu ini** = jam mingguan Anda dikurangi jam yang sudah dicatat minggu ini (Senin–Minggu). Bila sudah terpenuhi, kartu menampilkan **Target tercapai**.
- **Ketercapaian periode berjalan** = total jam periode ini ÷ ekspektasi bulanan, lengkap dengan garis progres.

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

### Mengelola tugas

1. **Ubah status** lewat pilihan status di kartu: **Belum Mulai → Berjalan → Pending → Selesai**.
2. **Pending**: saat status diubah ke Pending, panel **Pengingat** terbuka. Isi **Ingatkan saya pada** (tanggal & jam) lalu **Simpan pengingat**. Pengingat bersifat **pribadi**: hanya Anda yang menerimanya (di lonceng notifikasi).
3. **Catatan**: tekan **Catatan**, tulis, lalu **Tambahkan catatan**. Catatan terlihat oleh semua karyawan.
4. **Delegasikan**: tekan **Delegasikan**, pilih orang di **Delegasikan kepada**. Orang itu ditambahkan sebagai PIC (PIC lama tetap) dan mendapat notifikasi.
5. **Ubah**: mengganti judul, deadline, PIC/support, dll., lalu **Simpan perubahan**. **Hapus** hanya untuk head (departemennya) dan admin.
6. **Pilih banyak**: centang beberapa tugas sekaligus untuk mengubah status, sprint, prioritas, deadline, atau menambah PIC, lalu **Terapkan ke … tugas**.

### Mencari dan mengurutkan

- **Filter**: departemen, sprint, PIC (*Saya sebagai PIC* untuk tugas Anda), status, rentang deadline, **Hanya yang terlambat**, **Hanya prioritas**.
- **Urutkan**: Deadline, Prioritas, Judul A-Z, atau **Terbaru dibuat**; pilih arahnya di sebelahnya.
- **Tampilan**: Daftar, Grid, Kanban, atau Per PIC.
- Bawaan halaman memuat sprint berjalan + mendatang; pilih sprint lain di filter **Sprint** bila perlu.

### Aturan penting

- Tugas yang **lewat deadline dan belum Selesai** otomatis bertanda **Terlambat**.
- PIC menerima notifikasi deadline **H-3, H-2, dan H-1**.
- Setiap tambah/ubah/hapus tugas serta PIC/support tercatat di **[Riwayat](/tugas/riwayat)**.
- Kode **SOP** di kartu tugas bisa diklik untuk membuka prosedurnya.

### Kalau ada masalah

- **Tombol Ubah/Delegasikan tidak muncul**: Anda bukan PIC tugas itu. Minta PIC atau head departemen untuk mengubahnya, atau minta didelegasikan.
- **Tugas tidak terlihat**: periksa filter (terutama **Sprint** dan **Status**), atau pilih *Semua sprint*.
- **Tidak bisa menambah tugas di departemen lain**: hanya admin/CEO yang bisa; minta head departemen tersebut.

Kata kunci: to-do, todo list, tugas, sprint, kanban, PIC, support, delegasi, pengingat, pending, terlambat, deadline, catatan tugas, riwayat tugas`,
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
