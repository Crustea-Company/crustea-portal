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
  const row = { sop_code: p.code, title: p.title, sort_order: p.sort, body: p.body };
  const res = found
    ? await supabase.from("procedures").update(row).eq("id", found.id).select("id")
    : await supabase.from("procedures").insert(row).select("id");
  if (res.error) throw res.error;
  console.log(found ? `diperbarui (${found.title})` : "ditambahkan", "-", p.code, p.title, `(${p.body.length} karakter)`);
}
