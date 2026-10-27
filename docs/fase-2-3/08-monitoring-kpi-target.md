# Modul 7: Monitoring KPI + target kuartal

## A. Monitoring KPI

Data: tabel `kpi_items` (sudah ada, 223 baris dari seed). Kolom: objective_code (mis. `BDS-A.1`), objective,
dept_code, item, pic_type (`person`/`department`), pic_id, target_value, target_unit, target_period
(`quarter`/kosong), target_weeks (mis. `9-W1;9-W2`), is_done, realization_note.

Halaman `/kpi`: kelompok per departemen (MGT, CA, FA, BDS, DM, AQ, TO) → per objective → item.
Progres = item selesai / total per objective & per departemen. Filter departemen, PIC, status.
Ubah `is_done` & catatan realisasi: PIC item, head departemennya, admin, CEO (RLS `write_kpi` sudah ada).

## B. Target kuartal per divisi (dari "MONITORING TARGET 1,5 JUTA USD.xlsx")

Target Q4 2026 (Okt-Des) total **Rp4.000.000.000**, dibagi per sumber:

| Sumber | Divisi PIC | Bobot | Target alokasi (Rp) | Proyeksi strategi (Rp) |
|---|---|---|---|---|
| Penjualan Teknologi | Bisdev | 55% | 2.200.000.000 | 2.299.000.000 |
| Aquagrowth Project | Aquaculture | 20% | 800.000.000 | 8.300.000.000 |
| Trading Ikan dan Udang | Aquaculture | 8% | 320.000.000 | 650.000.000 |
| Open Project | Teknologi & Bisdev | 15% | 600.000.000 | 600.000.000 |
| Grant / Sumber Lain | Bisdev | 2% | 80.000.000 | 500.000.000 |
| Krasty Food | Bisdev | — | — | 50.000.000 |

Tampilan "Target per divisi": bobot, target alokasi, proyeksi strategi, selisih (proyeksi − target),
proyeksi/target; ringkasan per divisi (SUMIFS per divisi) + jumlah strategi per divisi.

Tampilan "Realisasi per divisi": per sumber → realisasi Okt/Nov/Des, total realisasi Q4, realisasi/target,
sisa target; baris "Alokasi lain / belum dipilih"; total; ringkasan per divisi.
Realisasi = jumlah pendapatan berstatus **PAID** per bulan per label alokasi (Excel memakai tab
"Revenue Updated": kolom BULAN, NILAI, ALOKASI, STATUS).

## Tabel baru

`quarter_targets` (tahun, kuartal, total), `target_sources` (sumber, divisi PIC, bobot, target alokasi,
label alokasi), `target_strategies` (sumber, strategi, proyeksi), `revenues` (tanggal, bulan, nilai, alokasi,
status, keterangan) — diisi manual/impor CSV sampai modul Penjualan (#6) menghasilkan data otomatis.

## Keputusan yang perlu dikonfirmasi saat sesi modul ini

- CLAUDE.md menyebut realisasi penjualan dari status **DITERIMA**, Excel memakai **PAID**. Pakai PAID
  (sesuai Excel terbaru) kecuali Athar menyatakan lain.
- Kuartal target = kuartal kalender (Okt-Des), berbeda dengan kuartal ATS (periode 29-28).
