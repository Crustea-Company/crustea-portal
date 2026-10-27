# Modul 3: Form Penugasan Perjalanan Dinas (kind = `travel`)

Sumber: "Form Perhitungan Penugasan Dinas.xlsx" (FORM-HR-02; tarif dari SOP Uang Dinas
227/19/CRUSTEA/XII/2025). Dipakai admin, manajemen, dan karyawan.

## Tarif per golongan jabatan (tabel `travel_rates`, bisa diubah admin)

| Golongan | Uang harian/hari | Hotel/malam (maks) | Transport lokal/hari (maks) | Representasi/kegiatan (maks) |
|---|---|---|---|---|
| Direktur | 450.000 | 900.000 | 150.000 | 700.000 |
| Head/Manager | 300.000 | 700.000 | 120.000 | 500.000 |
| Supervisor/Leader | 300.000 | 700.000 | 120.000 | — |
| Staff Full Time | 200.000 | 500.000 | 120.000 | — |
| Staff Part-time | 150.000 | 300.000 | 100.000 | — |
| Karyawan Magang | 100.000 | 200.000 | 100.000 | — |

## Parameter (tabel `travel_params`)

Tenggat penugasan minimal = 3 hari kerja · Batas FPTD & laporan misi setelah kembali = 3 hari kerja ·
Zona lokal ≤ 30 km · Dalam provinsi ≤ 150 km · Kendaraan pribadi = Rp3.000/km.

## Kolom isian (A. Penugasan)

No. penugasan (otomatis `PD-2026-###`) · Tanggal form · Ditugaskan oleh (nama & jabatan) · Nama karyawan ·
Golongan jabatan · Departemen · Tujuan/lokasi · Target tugas · Tanggal berangkat · Tanggal kembali ·
Hari kerja sebelum berangkat · Jarak dari kantor (km) · Faktor uang harian dalam provinsi (70-100%) ·
Tiket pesawat/kereta/bus (estimasi) · Kendaraan pribadi (km pulang-pergi) · Estimasi representasi ·
Uang muka diminta? (Ya/Tidak)

## Rumus (persis dari Excel)

- Jumlah hari = tanggal kembali − tanggal berangkat + 1 (di Excel diisi manual; contoh 29→31 Okt = 3)
- Memenuhi tenggat? = hari kerja sebelum berangkat ≥ 3 ? "Ya" : "Tidak: lampirkan alasan darurat" (alasan wajib)
- Zona = jarak ≤ 30 → Lokal; ≤ 150 → Dalam provinsi; selain itu → Luar provinsi
- Faktor zona dipakai = Lokal 0 · Dalam provinsi = faktor 70-100% · Luar provinsi 100%
- Total uang harian = tarif harian × faktor zona × jumlah hari
- Jumlah malam = max(jumlah hari − 1, 0); Estimasi hotel = plafon hotel × jumlah malam
- Estimasi transport lokal = plafon transport × jumlah hari
- Biaya kendaraan pribadi = km × 3.000
- Representasi: diisi, tidak boleh melebihi plafon golongan
- **Total estimasi** = uang harian + hotel + transport lokal + tiket + kendaraan pribadi + representasi
- Batas FPTD & laporan misi = WORKDAY(tanggal kembali, 3)
- Catatan zona lokal: "Zona lokal tanpa uang harian: transport Rp30.000–100.000 dan makan Rp50.000–100.000 sesuai nota."

## B. Persetujuan & proses (status)

Diajukan → Disetujui penugas (tanda tangan & tanggal) → No. Surat Tugas diterbitkan HR/CA (`ST-2026-###`)
→ Diverifikasi Finance (nama & tanggal) → Uang muka dicairkan (tanggal; bila diminta) → Selesai setelah
FPTD + laporan misi masuk sebelum batas.

## Keputusan

- Tambah kolom `grade` (golongan jabatan) di `employees`, diisi admin. Bawaan: CEO → Direktur,
  head → Head/Manager, PKWTT staf → Staff Full Time, PKWT → Staff Part-time, INTERN → Karyawan Magang.
- Kalkulator tampil langsung di form (angka berubah saat mengetik), hasil disimpan bersama pengajuan.
