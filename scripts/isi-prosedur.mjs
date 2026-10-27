// Mengisi isi awal halaman Prosedur (sekali jalan).
// node --env-file=.env.local scripts/isi-prosedur.mjs "<folder SOP .md>"
// Butuh SUPABASE_SECRET_KEY. Prosedur dicocokkan berdasarkan judul; yang belum ada ditambahkan.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const sopDir = process.argv[2];
const readSop = (name) =>
  fs
    .readFileSync(path.join(sopDir, name), "utf8")
    .replace(/^##\s*\*\*(.+?)\*\*\s*$/m, "") // judul sudah tampil di halaman
    .replace(/\\([&\-+])/g, "$1")
    .trim();

const DEV = "> Formulir di aplikasi **sedang dikembangkan**. Sementara itu, ikuti langkah di bawah.";

const PROCEDURES = [
  {
    title: "Monitoring KPI",
    sort: 1,
    body: `${DEV}

**Tujuan:** memantau ketercapaian KPI setiap departemen per kuartal.

**Lingkup:** semua departemen: MGT, CA, FA, BDS, DM, AQ, TO.

**Cara kerja:**

1. Setiap KPI punya kode objektif (mis. \`BDS-A.1\`), objektif, item, PIC (orang atau departemen), dan target (nilai, satuan, periode/minggu).
2. PIC memperbarui status item (selesai/belum) dan catatan realisasi.
3. Head departemen memantau progres departemennya; admin dan CEO memantau semua departemen.
4. Progres = jumlah item selesai ÷ total item, per objektif dan per departemen.`,
  },
  {
    title: "Monitoring target kuartal",
    sort: 2,
    body: `${DEV}

**Tujuan:** memantau target pendapatan kuartal per divisi dan realisasinya.

**Target Q4 2026 (Oktober–Desember): Rp4.000.000.000**

| Sumber | Divisi PIC | Bobot | Target alokasi (Rp) | Proyeksi strategi (Rp) |
|---|---|---|---|---|
| Penjualan Teknologi | Bisdev | 55% | 2.200.000.000 | 2.299.000.000 |
| Aquagrowth Project | Aquaculture | 20% | 800.000.000 | 8.300.000.000 |
| Trading Ikan dan Udang | Aquaculture | 8% | 320.000.000 | 650.000.000 |
| Open Project | Teknologi & Bisdev | 15% | 600.000.000 | 600.000.000 |
| Grant / Sumber Lain | Bisdev | 2% | 80.000.000 | 500.000.000 |
| Krasty Food | Bisdev | — | — | 50.000.000 |

**Realisasi** dihitung dari pendapatan berstatus **PAID** per bulan (Oktober, November, Desember) dan per label alokasi.
Yang dipantau: realisasi ÷ target, sisa target, dan pendapatan yang belum dirinci ke strategi.`,
  },
  {
    title: "To-do list",
    sort: 3,
    body: `Semua tugas dikelola di halaman **[Tugas](/tugas)**. Semua karyawan bisa melihat semua tugas.

1. **Tambah tugas** dengan tombol bulat **+** (halaman Tugas) atau tombol **Tambah tugas** di Dashboard. Wajib minimal satu PIC.
2. **Status:** Belum Mulai → Berjalan → Pending → Selesai. PIC mengubah status tugasnya; head mengubah tugas departemennya; admin dan CEO semua tugas.
3. **Pending:** atur **Pengingat** (tanggal & jam); notifikasi muncul di lonceng.
4. **Delegasikan** untuk menambah PIC (PIC lama tetap); orang yang dipilih mendapat notifikasi.
5. **Catatan** di setiap tugas terlihat oleh semua karyawan.
6. Deadline **H-3, H-2, H-1** muncul otomatis di notifikasi PIC; tugas lewat deadline bertanda **Terlambat**.
7. Setiap perubahan tercatat di **[Riwayat tugas](/tugas/riwayat)**.`,
  },
  {
    title: "Klaim reimburse, komisi, cuti, lembur",
    sort: 4,
    body: `## Reimburse

${DEV}

1. Isi form: tanggal transaksi (tanggal pembelian, bukan tanggal pengisian), uraian, kategori, jumlah (Rp), dan bukti nota (foto/PDF atau link).
2. Isi **mission report** singkat: Kegiatan · Deskripsi kegiatan · Hasil kegiatan · Evaluasi dan rekomendasi.
   *Jika tidak ada, berikan alasannya, misal, one-time purchase seperti pembelian meterai.*
3. Finance & Accounting meninjau: memberi catatan atau langsung menerima.
4. Status yang bisa Anda pantau: **Belum di-review → Sedang di-review → Diterima → Ditransfer**. Setiap status maksimal **2 hari kerja**.

Kategori: Administrasi Bank, Bahan Baku, Vendor & Subkon, Human Resource, Konsumsi, Transportasi, Iklan & Promosi, Fasilitas Kantor, Informasi & Software, Pengembangan, atau lainnya.

## Komisi

${DEV}

1. Isi klaim per penjualan: customer, no. invoice/PO/kontrak, tanggal closing, produk, jumlah unit, total penjualan, bukti lead, dan **kode referral**.
2. Sistem menghitung: HPP penjualan = unit × HPP/unit · Profit = total penjualan − HPP penjualan · **Komisi = profit × % komisi produk**.
3. Persentase komisi & HPP mengikuti master produk yang berlaku pada tanggal closing. Ditinjau Finance & Accounting dengan status yang sama seperti reimburse.

## Cuti & lembur

Formulir **[Cuti & Lembur](/cuti-lembur)** sedang dalam pengembangan. Sementara itu, ajukan lewat Corporate Affairs.`,
  },
  {
    title: "Permohonan pengadaan",
    sort: 5,
    body: `${DEV}\n\n${readSop("Pengadaan Barang & Jasa.md")}`,
  },
  {
    title: "Stock, supply, & demand teknologi",
    sort: 6,
    body: `${DEV}

${readSop("SOP Penjualan Teknologi.md")}

### Kode referral & komisi

Setiap karyawan punya **kode referral** pribadi. Cantumkan kode itu saat mencatat lead (langkah 1); setelah penjualan lunas, kode yang sama dipakai untuk **klaim komisi** (lihat prosedur *Klaim reimburse, komisi, cuti, lembur*).

### Aset

Pencatatan dan perawatan perangkat mengikuti prosedur **Manajemen aset**.`,
  },
  {
    title: "Permintaan pembayaran",
    sort: 7,
    body: `${DEV}

**Tujuan:** agar proses pembayaran berjalan lancar sesuai SOP Departemen Finance & Accounting.

1. Isi form: prioritas (**Segera** – urgent/jatuh tempo hari ini · **Normal** – sesuai jadwal · **Tunda/terjadwal**), tanggal pembayaran, metode (QRIS, Virtual Account, Bank Transfer, lainnya), jumlah (Rp), vendor/nama penerima + wilayah, nomor rekening, tujuan pembayaran, invoice/dokumen pendukung, dan apakah terkait kontrak yang sudah berjalan atau pembayaran sekali.
2. Finance & Accounting meninjau dan memproses. Nilai **≥ Rp5.000.000** butuh persetujuan CEO.
3. Status yang bisa Anda pantau: **Belum di-review → Sedang di-review → Diterima → Ditransfer**. Setiap status maksimal **2 hari kerja**.`,
  },
  {
    title: "Penugasan perjalanan dinas",
    sort: 8,
    body: `${DEV}

**Form Penugasan Dinas (FORM-HR-02)** — tarif sesuai SOP Uang Dinas 227/19/CRUSTEA/XII/2025.

| Golongan jabatan | Uang harian/hari | Hotel/malam (maks) | Transport lokal/hari (maks) | Representasi/kegiatan (maks) |
|---|---|---|---|---|
| Direktur | 450.000 | 900.000 | 150.000 | 700.000 |
| Head/Manager | 300.000 | 700.000 | 120.000 | 500.000 |
| Supervisor/Leader | 300.000 | 700.000 | 120.000 | — |
| Staff Full Time | 200.000 | 500.000 | 120.000 | — |
| Staff Part-time | 150.000 | 300.000 | 100.000 | — |
| Karyawan Magang | 100.000 | 200.000 | 100.000 | — |

**Aturan:**

- Penugasan diajukan minimal **3 hari kerja** sebelum berangkat (jika tidak, lampirkan alasan darurat).
- Zona: **Lokal** ≤ 30 km (tanpa uang harian: transport Rp30.000–100.000 dan makan Rp50.000–100.000 sesuai nota) · **Dalam provinsi** ≤ 150 km (uang harian 70–100%) · **Luar provinsi** > 150 km (100%).
- Total uang harian = tarif × faktor zona × jumlah hari · Hotel = plafon × (jumlah hari − 1) malam · Transport lokal = plafon × jumlah hari · Kendaraan pribadi = Rp3.000/km.
- **Total estimasi** = uang harian + hotel + transport lokal + tiket + kendaraan pribadi + representasi.
- FPTD & laporan misi diserahkan paling lambat **3 hari kerja** setelah kembali.

**Proses:** disetujui penugas → Surat Tugas (HR) → diverifikasi Finance → uang muka dicairkan (bila diminta).`,
  },
  {
    title: "Manajemen aset",
    sort: 9,
    body: `${DEV}\n\n${readSop("SOP Manajemen Aset.md")}`,
  },
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const { data: existing, error } = await supabase.from("procedures").select("id, title");
if (error) throw error;

for (const p of PROCEDURES) {
  const found = existing.find((e) => e.title.toLowerCase() === p.title.toLowerCase());
  const row = { title: p.title, sort_order: p.sort, body: p.body };
  const res = found
    ? await supabase.from("procedures").update(row).eq("id", found.id).select("id")
    : await supabase.from("procedures").insert(row).select("id");
  if (res.error) throw res.error;
  console.log(found ? "diperbarui" : "ditambahkan", "-", p.title, `(${p.body.length} karakter)`);
}
