# CCTV live

Daftar kamera yang membawa **video langsung** (HLS/FLV) di EagleEye View, dihitung dari
`config/cctv_sources.indonesia_unofficial.json` (Indonesia, sumber tidak resmi, hanya untuk demo internal).

## Ringkasan

| | Jumlah |
|---|---:|
| **Total kamera video live** | **1233** |
| Kota (11 kota) | 797 |
| Jalan tol (24 ruas) | 436 |
| Format HLS | 1157 |
| Format FLV (Surakarta) | 76 |

Posisi kamera adalah **perkiraan**, bukan koordinat resmi. Tingkat label di data:

| Label posisi | Kamera | Arti |
|---|---:|---|
| `APPROX. LOCATION` | 1012 | 576 kamera kota (dicari dari nama jalan/tempat) + 436 kamera tol (dari KM ruas, asumsi titik awal belum diverifikasi) |
| `CITY-LEVEL ONLY` | 159 | diletakkan melingkar di sekitar pusat kota, tidak mewakili lokasi sebenarnya |
| tanpa label tier | 62 | 60 Bandung, 1 Jakarta, 1 Denpasar: nama tidak memuat label tier; semuanya `headingConfidence: low` |

## Kota

| # | Kota | Kamera | Format |
|---|---|---:|---|
| 1 | Malang | 199 | HLS |
| 2 | Surabaya | 141 | HLS |
| 3 | Yogyakarta | 131 | HLS |
| 4 | Denpasar | 96 | HLS |
| 5 | Surakarta | 76 | FLV |
| 6 | Bandung | 60 | HLS |
| 7 | Sumedang | 35 | HLS |
| 8 | Pasuruan | 31 | HLS |
| 9 | Jakarta | 15 | HLS |
| 10 | Mataram | 12 | HLS |
| 11 | Cianjur | 1 | HLS |

## Jalan tol

| # | Ruas tol | Kamera | Format |
|---|---|---:|---|
| 1 | Jalan Layang MBZ Toll | 43 | HLS |
| 2 | Jakarta-Cikampek Toll | 42 | HLS |
| 3 | Serpong-Balaraja Toll | 41 | HLS |
| 4 | JORR East Toll | 23 | HLS |
| 5 | Jagorawi Toll | 22 | HLS |
| 6 | JORR South Toll | 21 | HLS |
| 7 | Pekanbaru-Dumai Toll | 21 | HLS |
| 8 | Akses Tanjung Priok Toll | 20 | HLS |
| 9 | Dalam Kota Toll | 20 | HLS |
| 10 | Bengkulu-Taba Penanjung Toll | 18 | HLS |
| 11 | Indrapura-Kisaran Toll | 18 | HLS |
| 12 | Cipularang Toll | 16 | HLS |
| 13 | Semarang-Batang Toll | 15 | HLS |
| 14 | Balikpapan-Samarinda Toll | 13 | HLS |
| 15 | Sedyatmo Toll | 12 | HLS |
| 16 | Medan-Tebing Tinggi Toll | 11 | HLS |
| 17 | Padang-Sicincin Toll | 11 | HLS |
| 18 | Sigli-Banda Aceh Toll | 11 | HLS |
| 19 | Binjai-Langsa Toll | 10 | HLS |
| 20 | Jakarta-Tangerang Toll | 10 | HLS |
| 21 | Palembang-Indralaya Toll | 10 | HLS |
| 22 | Pekanbaru-Bangkinang Toll | 10 | HLS |
| 23 | Indralaya-Prabumulih Toll | 9 | HLS |
| 24 | Padaleunyi Toll | 9 | HLS |

## Bukan video live (tidak dihitung di atas)

- **Austin (AS)** dan **London (TfL)**: masing-masing 250 kamera, tetapi berupa **foto yang diperbarui berkala**, bukan video. Diambil saat runtime dari data terbuka.
- **Caltrans (California)**: diambil saat runtime dan jumlahnya berubah; saat dicek terakhir pengambilan data gagal (0 kamera), jadi tidak ada angka yang bisa dipastikan.
- **Shinjuku/Tokyo**: 3 kamera di `config/cctv_sources.shinjuku.json`, tidak dimuat secara default.
- **Kamera seed sintetis** (tanpa stream): tersisa untuk Medan, Semarang, dan Makassar (2 per kota) karena belum punya sumber live, plus seed kota luar negeri.

## Catatan

- Katalog gabungan saat ini 1733 kamera (batas 2000). Kamera live yang dilaporkan sehat atau offline tergantung kondisi sumber pada saat itu; angka di atas adalah jumlah yang terdaftar, bukan jaminan semuanya menyala.
- Hapus per kota dengan prefiks id-nya (misalnya `surakarta-atcs-*`), atau matikan seluruh paket dengan `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`.
