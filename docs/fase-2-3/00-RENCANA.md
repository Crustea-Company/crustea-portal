# Fase 2-3: rencana kerja hemat token

Semua file sumber (PDF, Excel, SOP .md) sudah dirangkum di folder ini. **Sesi berikutnya cukup membaca
CLAUDE.md + satu file modul di sini** — tidak perlu membuka file sumber lagi.

## Urutan modul (satu sesi baru per baris)

| # | File spesifikasi | Isi | Butuh SQL baru |
|---|---|---|---|
| 1 | `01-mesin-pengajuan.md` + `02-reimburse.md` | Mesin pengajuan bersama (status, SLA, review F&A, riwayat, notifikasi) + Klaim Reimburse — **selesai 27 Okt 2026** | Ya (007) |
| 2 | `03-permintaan-pembayaran.md` | Form Permintaan Pembayaran (pakai mesin #1) — **selesai 27 Okt 2026** | Ya (008) |
| 3 | `04-perjalanan-dinas.md` | Form Penugasan Dinas + kalkulator biaya — **selesai 27 Okt 2026** | Ya (009) |
| 4 | `05-pengadaan.md` | Purchase Request → PO → GRN → bayar (pakai mesin #1) — **selesai 27 Okt 2026** | Ya (010) |
| 5 | `06-produk-komisi-referral.md` | Master produk, klaim komisi, kode referral — **selesai 27 Okt 2026** | Ya (011) |
| 6 | `07-penjualan-aset.md` | Sales pipeline, stok, aset — **selesai 27 Okt 2026** | Ya (012) |
| 7 | `08-monitoring-kpi-target.md` | Monitoring KPI (`kpi_items`) + target kuartal per divisi — **selesai 27 Okt 2026** | Ya (013) |
| 8 | `09-cuti-lembur.md` | Halaman "sedang dalam pengembangan" — **selesai 27 Okt 2026** | Tidak |

Modul 2-6 **bergantung pada #1** (mesin pengajuan). Modul 7-8 berdiri sendiri.

## Cara menghemat token

1. **Satu sesi baru per modul.** Percakapan panjang mengirim ulang seluruh riwayat setiap kali Anda
   mengetik. Sesi baru hanya membawa CLAUDE.md + 1 file spesifikasi (beberapa ribu kata, bukan ratusan ribu).
2. **Mesin pengajuan dipakai ulang.** Reimburse, permintaan pembayaran, pengadaan, dinas, dan komisi
   memakai tabel, status, SLA, halaman review, dan notifikasi yang sama. Form baru = daftar kolom, bukan
   sistem baru.
3. **Keputusan dijawab di depan** (bagian "Keputusan" di tiap file). Sesi tidak berhenti untuk bertanya.
4. **Satu SQL per modul**, ditinjau sekali, disimpan di `migrations/`.
5. **Uji ringan:** pemeriksaan kode otomatis + Anda mencoba di browser; tidak perlu pratinjau berulang.

## Kalimat pembuka untuk sesi baru (salin-tempel)

```
Baca CLAUDE.md dan docs/fase-2-3/00-RENCANA.md, lalu kerjakan modul #<nomor> sesuai
docs/fase-2-3/<file>.md. Ikuti keputusan yang tertulis di file itu tanpa bertanya ulang,
kecuali ada yang benar-benar tidak jelas. Tunjukkan SQL dulu sebelum saya jalankan.
Simpan ke git setelah selesai dan beri tahu cara mengujinya.
```

## Keputusan bersama (berlaku untuk semua modul)

- **Peninjau F&A** = karyawan aktif departemen `FA`. Head F&A dan admin juga boleh meninjau.
- **CEO** mendapat notifikasi untuk pengajuan bernilai ≥ Rp5.000.000 (CLAUDE.md).
- **Hari kerja** = Senin-Jumat. Libur nasional: tabel `holidays` (diisi admin) — dihitung bila ada.
- **SLA** = maksimal 2 hari kerja di setiap status sebelum status berikutnya. Lewat SLA → tanda merah
  "Lewat SLA" + notifikasi ke peninjau.
- **Bukti/lampiran** = unggah foto/PDF ke Supabase Storage (bucket privat, maks 5 MB/file, maks 10 file)
  **atau** tempel link (Google Drive, dll.). Foto dari kamera HP dikompres otomatis sebelum diunggah.
- **Nominal** disimpan dalam rupiah bulat (bigint), tampil dengan titik ribuan.
- Semua perubahan status tercatat (siapa, kapan, catatan) dan terlihat oleh pemohon.
