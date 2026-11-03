# 11 - Struktur Organisasi

Permintaan Athar (2 Nov 2026): halaman khusus struktur organisasi yang bisa diubah dari aplikasi,
tampilannya seperti slide `5_3_Struktur_Organisasi_v2.pptx` (dibuat skrip `build_org_chart_v2.py`).
Ringkasan ini menggantikan kedua file itu; tidak perlu membukanya lagi.

## Tampilan (`/struktur-organisasi`, semua karyawan aktif)

1. **Kotak CEO** di atas: jabatan tampilan (mis. "Founder & CEO") + nama. CEO = karyawan aktif dengan
   peran aplikasi `ceo`. Di sebelahnya satu kartu angka: Karyawan aktif.
2. **Garis penghubung** dari CEO ke tiap **kolom** (pilar). Kolom bisa diberi judul (pil gelap) atau
   dikosongkan (koreksi Athar 2 Nov 2026: Crustea tidak memakai pilar) → kartu langsung di bawah garis.
3. Tiap kolom berisi **kartu departemen**: bilah warna, nama tampilan, satu baris fokus kerja, lalu
   anggota (nama + jabatan). Tanpa inisial, tanpa label Full-Time/Part-Time/Intern, tanpa "N orang",
   tanpa baris sumber (koreksi Athar 2 Nov 2026).
4. Urutan anggota: Chief/Founder/C-level → Head of → staf → intern, lalu jabatan, lalu nama.
   Chief & Head (dan pemimpin kartu) diberi latar "baris pemimpin".
5. Semua warna di dalam kartu bisa diatur per kartu (`org_units.colors`, migrasi 020): bilah atas,
   nama departemen, fokus kerja, latar, garis tepi, latar baris pemimpin, nama orang, jabatan.
   Kosong = bawaan (turunan warna utama `accent`).
6. Di HP kolom bertumpuk ke bawah; di layar lebar berjajar seperti slide. Tata letak memakai container
   query (`@4xl`) supaya unduhan selalu lebar.
7. **Unduh PNG / Unduh PDF** (semua karyawan): bagan dirender ulang selebar 1600 px di luar layar
   (`html-to-image`), PDF = satu halaman seukuran gambar (`jspdf`). Kode: `OrgExport.tsx`.

## Sumber data

- Anggota langsung dari `employees`: hanya `is_active`, dikelompokkan per `dept_code`, jabatan dari
  `job_title`. `emp_status` INTERN hanya dipakai untuk urutan (intern paling bawah).
- Tabel tidak punya jenis kelamin, jadi "(M)/(F)" di slide tidak ditampilkan.
- Bagian yang bisa diubah (migrasi 019 + 020):
  - `org_pillars` (id, name, sort_order): judul (boleh kosong, 020) dan urutan kolom.
  - `org_units` (dept_code → `departments`, pillar_id, sort_order, display_name, accent, focus, colors):
    departemen mana di pilar mana, urutan, nama tampilan, warna aksen (`#RRGGBB`), fokus kerja.
    `pillar_id` kosong = departemen tidak ditampilkan sebagai kartu.
  - `org_people` (employee_id, lead_dept, display_title): anggota Board yang memimpin kartu lain
    (`lead_dept`, tampil paling atas di kartu itu, mis. CTO di Technology Operations) dan jabatan
    tampilan pengganti `job_title`.
- Isi awal = pengaturan skrip (3 pilar, 6 kartu, warna, fokus, nama pendek BDS & DM).

## Mengubah (admin dan CEO)

- Tombol **Ubah struktur** di halaman → panel edit: kolom (judul boleh kosong, urutan ↑↓, tambah, hapus), kartu
  (kolom, urutan ↑↓, nama, warna utama + "Warna lainnya", fokus), orang khusus (pimpin kartu, jabatan tampilan).
- Simpan sekali lewat RPC `save_org_structure(jsonb)` (satu transaksi, cek admin/CEO). Setiap simpan
  tercatat di `audit_log` (`org_update`, struktur lama & baru) → Admin > Riwayat perubahan.
- Data karyawan (nama, jabatan asli, departemen, status) tetap diubah di Admin > Karyawan.

## Peringatan (admin/CEO saja)

Kotak kuning bila ada karyawan aktif yang tidak masuk kartu mana pun (selain CEO), mis. departemen
`MGT` atau departemen yang belum diberi kolom — sama seperti PERINGATAN di skrip.
