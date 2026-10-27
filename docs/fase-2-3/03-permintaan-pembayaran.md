# Modul 2: Permintaan Pembayaran (kind = `payment`)

Sumber: Google Form "Form Permohonan Pembayaran" (SOP Departemen F&A). Sama seperti reimburse: direview
F&A, pemohon melihat progres, SLA maksimal 2 hari kerja per status.

## Kolom form

| Kolom | Wajib | Catatan |
|---|---|---|
| Email, nama, departemen | otomatis | dari akun login |
| Prioritas pembayaran | ya | Segera (urgent / jatuh tempo hari ini) · Normal (sesuai jadwal pembayaran) · Tunda / terjadwal |
| Tanggal pembayaran | ya | tanggal |
| Metode pembayaran | ya | QRIS · Virtual Account · Bank Transfer · Lainnya (isi) |
| Jumlah (Rp) | ya | contoh 100000 |
| Vendor / nama penerima + wilayah | ya | contoh "PT Cahya Jaya Abadi Bandung" |
| Nomor rekening / VA / QRIS | ya | teks |
| Tujuan pembayaran | ya | teks panjang |
| Invoice atau dokumen pendukung | ya | unggah / link |
| Terkait kontrak? | ya | centang: "Sesuai kontrak yang sudah ada dengan vendor" dan/atau "Pembayaran sekali" |

## Status

Mesin bersama: Belum di-review → Sedang di-review → Diterima → Ditransfer (+ Perlu perbaikan / Ditolak).
Prioritas "Segera" tampil paling atas di antrian F&A dan berlabel merah.

## Keputusan

- ≥ Rp5 jt: **butuh persetujuan CEO** setelah F&A menerima (status tambahan `ceo_review` "Menunggu CEO")
  — sesuai Matriks Approval di SOP Pengadaan. Di bawah Rp5 jt langsung ke Diterima.
