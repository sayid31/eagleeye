# CCTV live

Daftar kamera yang membawa **video langsung** (HLS/FLV) di EagleEye View, dihitung dari
`config/cctv_sources.indonesia_unofficial.json` (Indonesia, sumber tidak resmi, hanya untuk demo internal).

## Ringkasan

| | Jumlah |
|---|---:|
| **Total kamera video live** | **1411** |
| Kota (18 kota) | 975 |
| Jalan tol (24 ruas) | 436 |
| Format HLS | 1335 |
| Format FLV (Surakarta) | 76 |

Posisi kamera adalah **perkiraan**, bukan koordinat resmi. Tingkat label di data:

| Label posisi | Kamera | Arti |
|---|---:|---|
| `APPROX. LOCATION` | 1068 | 632 kamera kota (dicari dari nama jalan/tempat) + 436 kamera tol (dari KM ruas, asumsi titik awal belum diverifikasi) |
| `SOURCE-PUBLISHED LOCATION` | 103 | koordinat dipublikasikan sumbernya sendiri (Bandung Barat 43, Bukittinggi 39, Padang Panjang 14, Pesisir Selatan 7), dipakai apa adanya, tidak disurvei ulang; arah tetap tidak diketahui |
| `CITY-LEVEL ONLY` | 178 | diletakkan melingkar di sekitar pusat kota, tidak mewakili lokasi sebenarnya |
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
| 7 | Bandung Barat | 43 | HLS |
| 8 | Bukittinggi | 39 | HLS |
| 9 | Sumedang | 35 | HLS |
| 10 | Pasuruan | 31 | HLS |
| 11 | Pekanbaru | 29 | HLS |
| 12 | Padang | 28 | HLS (LL-HLS fMP4) |
| 13 | Solok | 18 | HLS |
| 14 | Jakarta | 15 | HLS |
| 15 | Padang Panjang | 14 | HLS (fMP4) |
| 16 | Mataram | 12 | HLS |
| 17 | Pesisir Selatan | 7 | HLS |
| 18 | Cianjur | 1 | HLS |

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

## Belum bisa dipakai (tidak masuk pack)

Kamera ini ada di sumbernya tetapi **tidak** didaftarkan, karena tidak menyajikan segmen video yang valid saat dicek.
Aturan masuk: kamera hanya dimasukkan bila pernah menyajikan segmen valid, dan dicek ulang tepat sebelum commit.
Pengecekan terakhir 2026-10-13.

| Sumber | Kamera | Alasan | Status cek ulang |
|---|---:|---|---|
| Pekanbaru | 57 | 55 manifest 404, 2 tidak pernah menghasilkan segmen (SEBERANG MPP 1, SUDIRMAN - TUANKU TAMBUSAI 1) | tetap mati |
| Surakarta | 19 | tidak pernah menjawab, bahkan dengan tunggu 25 detik | belum dicek ulang |
| Surabaya | sekitar 15 | urutan media beku atau playlist kosong, dan 404 terus; 2 kamera sempat pulih dan sudah dimasukkan | belum dicek ulang |
| Bandung Barat | 15 | 13 selalu 404; Padalarang Flyover (Cimareme dan KBP) sempat lolos lalu 404, kini hidup lagi | 13 tetap mati, 2 hidup (lihat bawah) |
| Bukittinggi | 8 | 404 / "File Not Found" | belum dicek ulang |
| Yogyakarta | 2 | gagal uji liveness | belum dicek ulang |
| Pasuruan | 2 | origin menjawab 404 | belum dicek ulang |
| Solok | 1 | Simpang Sigege, 404 | belum dicek ulang |
| Padang Panjang | 1 | cam12 (Simpang SMPN 5), 404 | tetap mati |
| Pesisir Selatan | 1 | Kamera Carocok 1 hanya membalas "File Not Found"; Carocok 4 memakai stream yang sama dengan Carocok 3 sehingga disimpan sekali | tetap mati |
| Jalan tol Cipali | 20 | rantai sertifikat TLS server tidak lengkap; Node menolaknya dan memaksa mematikan verifikasi TLS tidak sepadan untuk demo | belum dicek ulang |
| Banyuwangi | tidak diketahui | `live.banyuwangikab.go.id` diblokir Cloudflare | butuh keputusan owner |
| Sumber lain | tidak diketahui | BPJT (path 404), RTTMC (DNS gagal), smartcity.jakarta (butuh inspeksi browser), Bali Tower (host tidak terjangkau), ATCS Bandung (404) | belum dicek ulang |

Dua kamera **Padalarang Flyover - Cimareme** dan **- KBP** lolos 5 probe berturut-turut (jeda 20 detik) pada 2026-10-13
setelah sebelumnya 404 di setiap probe. Keduanya kamera yang timbul-tenggelam, jadi belum dimasukkan; cek lagi sebelum menambahkannya.

Bukan kamera, tetapi sempat dibahas: layer Google My Maps (58 tempat evakuasi + 86 sirene tsunami) masih sebatas ide dan lisensinya belum jelas.

## Verifikasi pemutaran

Pada 2026-10-13, 149 kamera Sumatera Barat dan Bandung Barat diputar di Chrome headless (hls.js, lewat proxy `/api/cctv/media`),
dengan syarat video punya dimensi dan `currentTime` maju lebih dari 1 detik. **147 dari 149 berhasil diputar** (Bukittinggi 39/39,
Solok 18/18, Padang Panjang 14/14, Pesisir Selatan 7/7, Padang 27/28, Bandung Barat 42/43).
22 kamera gagal pada putaran pertama (batas 30 detik) dan 20 di antaranya berhasil pada putaran kedua (batas 75 detik): origin lambat
atau flaky, jadi sebagian kamera butuh waktu lama sebelum frame pertama muncul. Dua sisanya gagal saat dicek tetapi manifest-nya menjawab 200 pada
cek ulang lewat proxy, jadi tampak sementara: `padang-atcs-balaikota-pintu-keluar` (LL-HLS; beberapa segmen awal di playlist kosong 0 byte sehingga
gagal diurai) dan `bandungbarat-atcs-langensari-cibodas` (manifest 404 sesaat). Pemeriksaan ini memakai player hls.js biasa di browser headless,
bukan panel CCTV aplikasi, jadi belum mencakup tampilan di globe.

## Catatan

- Katalog gabungan saat ini 1911 kamera (batas 2000). Kamera live yang dilaporkan sehat atau offline tergantung kondisi sumber pada saat itu; angka di atas adalah jumlah yang terdaftar, bukan jaminan semuanya menyala.
- Hapus per kota dengan prefiks id-nya (misalnya `surakarta-atcs-*`), atau matikan seluruh paket dengan `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`.
