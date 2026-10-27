# Modul 6: Stock, supply & demand teknologi (penjualan + aset)

Sumber: SOP "Penjualan Teknologi" dan SOP "Manajemen Aset". Produk & komisi: modul #5.

## A. Penjualan teknologi (aerator, EBII, Smart Energy, solar) — lead sampai purna jual

| No | Langkah | Siapa | Tahap pipeline | Batas waktu |
|---|---|---|---|---|
| 1 | Catat lead (dari DM, referral, event, kunjungan) | Sales (BDS) | `lead` | ≤ 1×24 jam setelah lead masuk |
| 2 | Kontak awal, jelaskan solusi, jadwalkan site visit | Sales | `contacted` | — |
| 3 | Site visit & survey (kondisi tambak, listrik, sinyal, kebutuhan) → site visit report | Sales | `site_visit` | ≤ 2 hari kerja setelah visit |
| 4 | Cek stok & lead time | Sales → TO | `stock_checked` | ≤ 1 hari kerja |
| 5 | Quotation (produk, harga, waktu instalasi, garansi 6 bulan, T&C) | Sales | `quotation` | — |
| 6 | Diskon / quotation custom / nilai besar → approval CMO | CMO (BDS) | `quotation_approved` | ≤ 1 hari kerja |
| 7 | Kirim quotation, follow-up, negosiasi | Sales | `negotiation` | follow-up ≤ 2×24 jam |
| 8 | Kontrak bila perlu (Form Permohonan Kontrak → CA) | Sales | `contract` | — |
| 9 | Closing: Sales Order (ke FA, TO) | Sales | `won` | ≤ 1 hari kerja setelah deal |
| 10 | Invoice & konfirmasi pelunasan | Finance | `paid` | — |
| 11 | Work Order instalasi setelah lunas | Sales → TO | `work_order` | ≤ 1 hari kerja setelah lunas |
| 12 | Instalasi & BAST | TechOps (teknisi) | `installed` | instalasi 1 hari |
| 13 | Follow-up kepuasan (customer feedback) | Sales | `feedback` | H+7 setelah BAST |
| 14 | Keluhan → Log Keluhan (ke TO) | Sales | tiket keluhan | ≤ 1×24 jam |
| 15 | Laporan sales: prospek, visit, deal, target vs aktual, kendala | Sales → MGT | laporan harian/mingguan/bulanan | — |

Lead menyimpan: sumber (DM/referral/event/kunjungan), **kode referral** (modul #5), customer, lokasi, produk & unit, nilai, PIC sales.
Tahap `lost` untuk lead gagal (wajib alasan). Sales Order + status lunas = dasar realisasi penjualan (modul #7).

## B. Stok (supply & demand)

Tabel `stock_items` (per produk/komponen) + `stock_moves` (masuk dari GRN pengadaan #4, keluar dari Work Order
instalasi, penyesuaian opname). Tampilan: stok tersedia vs kebutuhan pipeline (lead di tahap quotation→won).

## C. Manajemen aset — registrasi sampai penghapusan

| No | Langkah | Siapa | Status aset | Batas waktu |
|---|---|---|---|---|
| 1 | Serah terima aset baru (BAST) | TechOps | `received` | — |
| 2 | Registrasi (kode unik, lokasi, nilai) + label | Finance | `registered` | ≤ 5 hari kerja setelah BAST |
| 3 | Aset di lokasi klien/program: BAST penempatan ditandatangani penerima | Teknisi TO | `placed` | saat instalasi |
| 4 | Pemeliharaan terjadwal (maintenance log) | TechOps | — | preventif 100% |
| 5 | Lapor kerusakan/kehilangan | Pengguna / TO | `damaged` / `lost` | ≤ 1 hari kerja setelah ditemukan |
| 6 | Penyusutan & stock opname | Finance + TO | — | bulanan; selisih < 2% |
| 7 | Usulan penghapusan (BA Penghapusan) | Pengguna aset | `disposal_proposed` | — |
| 8 | Setujui penghapusan & keluarkan dari pembukuan | CEO + Head F&A | `disposed` | — |

Lingkup aset: aset tetap & perangkat teknologi (EBII, Smart Energy, aerator, solar panel, perkakas).

## Keputusan

- Kerjakan berurutan: A (pipeline) → B (stok) → C (aset). Bila terlalu besar, pecah jadi 2-3 sesi.
