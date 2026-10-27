# Modul 4: Permohonan Pengadaan Barang & Jasa (kind = `procurement`)

Sumber: SOP "Pengadaan Barang & Jasa". Tujuan: setiap pembelian berdasarkan perbandingan vendor,
disetujui sesuai wewenang, dan dibayar setelah barang diterima sesuai PO. Lingkup: semua departemen,
PR sampai pembayaran vendor dan pencatatan aset/stok.

## Langkah → status di aplikasi

| No | Langkah (SOP) | Siapa | Status aplikasi | Batas waktu |
|---|---|---|---|---|
| 1 | Isi PR (kebutuhan, spesifikasi, cek anggaran) | Staf pemohon | `submitted` | — |
| 2 | Review & setujui PR | Head dept pemohon | `head_approved` | ≤ 1×24 jam |
| 3-4 | Cari ≥3 vendor (prioritas Approved Vendor List), bandingkan harga/spesifikasi/lead time/garansi, rekomendasi | TechOps (TO) | `vendor_compared` | PR→PO ≤ 5 hari kerja |
| 5 | Cek kelengkapan, saldo anggaran (Accumulate.id), duplikasi PR/PO | Finance staf | `fa_verified` | Matriks approval |
| 6 | Pilih vendor + metode; ≥ Rp5 jt diteruskan ke CEO | Head F&A | `fa_approved` | Matriks approval |
| 7 | Approval final (hanya ≥ Rp5 jt) | CEO | `ceo_approved` | ≤ 2×24 jam |
| 8 | Terbitkan PO (minta kontrak ke Legal/CA bila perlu) | Finance staf | `po_issued` | PR→PO ≤ 5 hari kerja |
| 9 | Terima barang, cek jumlah/spesifikasi/kondisi (jasa: UAT); GRN atau retur | TechOps + pemohon | `received` / `returned` | Retur ≤ 1×24 jam |
| 10 | Triple matching PO–GRN–invoice; approval bayar | Finance + Head F&A | `payment_approved` | SOP pembayaran |
| 11 | Bayar vendor, arsip (Drive: Finance/Procurement/[Tahun]/[Divisi]/[No. PR]) | Finance staf | `paid` | Sesuai term PO |
| 12 | Registrasi aset atau catat stok (Daftar Inventaris Aset) | Finance / TechOps | `closed` (+ buat aset/stok) | ≤ 5 hari kerja setelah BAST |

## Kolom PR

Judul kebutuhan · Departemen · Spesifikasi · Jumlah & satuan · Estimasi harga (Rp) · Sudah dianggarkan? ·
Tanggal dibutuhkan · Lampiran.

## Perbandingan vendor (oleh TO)

Minimal 3 baris: nama vendor · ada di Approved Vendor List? · harga · spesifikasi · lead time · garansi ·
kelebihan · kekurangan · rekomendasi (pilih satu).

## Keputusan

- Batas waktu tiap langkah memakai SLA mesin bersama, kecuali yang tertulis di tabel.
- Langkah 12 membuat entri di modul Aset/Stok (#6) bila sudah ada; sebelum itu cukup dicatat.
