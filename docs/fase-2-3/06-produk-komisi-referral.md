# Modul 5: Master produk, klaim komisi, kode referral (kind = `commission`)

Sumber: "Crustea Commission Claims 2026.xlsx" (sheet "Form Klaim" + "Master Data Product").

## Master produk (tabel `products`, admin/F&A mengubah; berlaku mulai/sampai)

| Produk | Tipe | Harga jual acuan (Rp, excl. VAT) | HPP/unit | % komisi | Diskon maks |
|---|---|---|---|---|---|
| Aerator Brush 3 Fasa | Satuan | 6.900.000 | 6.500.000 | 2,5% | 2,5% |
| Aerator Brush 1 Fasa | Satuan | 6.500.000 | 6.100.000 | 5% | 5% |
| Aerator Mini | Satuan | 3.500.000 | 2.750.000 | 5% | 7% |
| EBII System | Satuan | 29.120.000 | 26.000.000 | 2,5% | 2,5% |
| Smart Energy | Satuan | 2.000.000 | 1.750.000 | 6% | 6% |
| Panel Surya On-grid (belum jasa) | Satuan | 35.000.000 | 31.250.000 | 2,5% | 2,5% |
| Panel Surya Off-grid (belum jasa) | Satuan | 45.000.000 | 40.180.000 | 2,5% | 2,5% |
| Ecoaerator (aerator + panel surya) | Bundle | 41.832.000 | 37.350.000 | 2,5% | 2,5% |
| Full set technology (Ecoaerator + EBII + Smart Energy) | Bundle | 72.912.000 | 65.100.000 | 2,5% | 2,5% |

Semua berlaku mulai 22-10-2026. Kolom tambahan: komposisi bundle, harga promo brosur (informasi),
catatan (mis. Aerator Brush 1 Fasa: "Harga promo brosur lebih rendah dari HPP"; promo brosur
Aerator Brush 1 Fasa 5.200.000, Aerator Mini 3.000.000, Smart Energy 2.100.000).

Rumus turunan per produk: Profit/unit = harga − HPP · Gross margin = profit/harga ·
Komisi standar/unit = profit × % komisi · Harga minimal = harga × (1 − diskon maks) ·
Profit di harga minimal = harga minimal − HPP ·
Komisi/unit di harga minimal = jika profit ≤ 0 → 0, selain itu komisi standar × clamp(profit minimal / profit, 0..1).

## Form klaim komisi (satu klaim boleh beberapa baris penjualan)

Per baris: Nama pengklaim (otomatis) · Nama customer · No. Invoice/PO/Kontrak · Tanggal closing · Produk ·
Jumlah unit · Total nominal penjualan (Rp) · Justifikasi (link bukti leads) · **Kode referral**.
Otomatis: % komisi & HPP/unit (dari master, sesuai tanggal closing) · HPP penjualan = unit × HPP/unit ·
Profit = total penjualan − HPP penjualan · **Komisi = profit × % komisi** (jika profit ≤ 0 → 0 dan diberi tanda).

## Kode referral

- Setiap karyawan aktif punya kode unik (mis. `CRU-FARHAH`), bisa dilihat & disalin di profil.
- Lead/penjualan di modul Penjualan (#6) menyimpan kode referral → klaim komisi otomatis terisi
  pengklaimnya dan baris penjualannya; F&A melihat asal lead saat review.

## Status

Mesin bersama: Belum di-review → Sedang di-review → Diterima → Ditransfer (F&A); syarat diterima:
penjualan sudah lunas (dari modul #6 bila ada, atau dicentang F&A).
