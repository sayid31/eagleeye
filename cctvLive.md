# CCTV live

Daftar kamera yang membawa **video langsung** (HLS/FLV) di EagleEye View, dihitung dari
`config/cctv_sources.indonesia_unofficial.json` (Indonesia, sumber tidak resmi, hanya untuk demo internal).

## Ringkasan

| | Jumlah |
|---|---:|
| **Total kamera video live** | **2548** |
| Kota dan kabupaten (44 lokasi) | 2040 |
| Jalan tol (29 ruas) | 508 |
| Format HLS | 2398 |
| Format FLV (Surakarta) | 134 |
| Format MJPEG (Jombang, ditampilkan sebagai gambar yang disegarkan) | 16 |

Posisi kamera adalah **perkiraan**, bukan koordinat resmi. Tingkat label di data:

| Label posisi | Kamera | Arti |
|---|---:|---|
| `APPROX. LOCATION` | 1232 | 724 kamera kota (dicari dari nama jalan/tempat; termasuk Kediri 15 dari geocoding slug stream, Pati 4 dari koordinat agregator cctvnusantara.com, dan Ciamis 14 serta Pemalang 9 dari geocoding Nominatim, bukan dari sumber) + 508 kamera tol (dari KM ruas, asumsi titik awal belum diverifikasi) |
| `SOURCE-PUBLISHED LOCATION` | 1059 | koordinat dipublikasikan sumbernya sendiri (Magelang 75, Semarang 59, Bandung Barat 45, Cianjur 44, Bukittinggi 39, Tangerang Kab. 28, Banjar 20, Tasikmalaya 18, Banyumas 20, Padang Panjang 14, Banten 37, Pesisir Selatan 7, Banda Aceh 47, Balangan 36, Banjarmasin 33, Kotawaringin Barat 22, Tanah Bumbu 11, Situbondo 19, Gresik 55, Jombang 16, Kota Serang 20, Nganjuk 289, Banjarbaru 47, Jambi 19, Garut 15, Karo 12, Lebak 10, dan Balangan menjadi 38), dipakai apa adanya, tidak disurvei ulang; arah tetap tidak diketahui |
| `CITY-LEVEL ONLY` | 195 | diletakkan melingkar di sekitar pusat kota, tidak mewakili lokasi sebenarnya |
| tanpa label tier | 62 | 60 Bandung, 1 Jakarta, 1 Denpasar: nama tidak memuat label tier; semuanya `headingConfidence: low` |

## Kota

| # | Kota | Kamera | Format |
|---|---|---:|---|
| 1 | Malang | 199 | HLS |
| 2 | Surabaya | 141 | HLS |
| 3 | Yogyakarta | 133 | HLS |
| 4 | Denpasar | 96 | HLS |
| 5 | Surakarta | 134 | FLV |
| 6 | Bandung | 60 | HLS |
| 7 | Bandung Barat | 45 | HLS |
| 8 | Bukittinggi | 39 | HLS |
| 9 | Sumedang | 35 | HLS |
| 10 | Pasuruan | 31 | HLS |
| 11 | Pekanbaru | 32 | HLS |
| 12 | Padang | 28 | HLS (LL-HLS fMP4) |
| 13 | Solok | 18 | HLS |
| 14 | Jakarta | 15 | HLS |
| 15 | Padang Panjang | 14 | HLS (fMP4) |
| 16 | Mataram | 12 | HLS |
| 17 | Pesisir Selatan | 7 | HLS |
| 18 | Magelang | 75 | HLS |
| 19 | Semarang | 59 | HLS |
| 20 | Cianjur | 44 | HLS |
| 21 | Tangerang (Kabupaten) | 28 | HLS |
| 22 | Banjar | 20 | HLS |
| 23 | Tasikmalaya | 18 | HLS |
| 24 | Banyumas | 20 | HLS |
| 25 | Banten (provinsi: Lebak, Bapenda, KP3B, Gerbang) | 37 | HLS |
| 26 | Banda Aceh | 47 | HLS |
| 27 | Balangan | 38 | HLS |
| 28 | Banjarmasin | 33 | HLS (tertunda sekitar 30 detik) |
| 29 | Kotawaringin Barat | 22 | HLS |
| 30 | Tanah Bumbu | 11 | HLS |
| 31 | Situbondo | 19 | HLS (on-demand MediaMTX, bisa mati sewaktu-waktu) |
| 32 | Kediri | 17 | HLS |
| 33 | Pati | 4 | HLS |
| 34 | Gresik | 55 | HLS on-demand (proxy membuka sesi penonton; sebagian kamera mati di sumber) |
| 35 | Jombang | 16 | MJPEG ZoneMinder (token halaman dibaca saat dijalankan; 9 dari 25 monitor mati di sumber) |
| 36 | Kota Serang | 20 | HLS (Ant Media; perlu CA perantara GlobalSign di `config/ca/`; 3 dari 23 mati di sumber) |
| 37 | Nganjuk | 289 | HLS (`wxyz.nganjukkab.go.id`, koordinat dari sumber) |
| 38 | Banjarbaru | 47 | HLS (`stream-backup.banjarbarukota.go.id`) |
| 39 | Jambi (kota) | 19 | HLS (`cctv.jambikota.go.id`) |
| 40 | Garut | 15 | HLS (`cctv.garutkab.go.id`) |
| 41 | Ciamis | 14 | HLS (Ant Media :5443; posisi `APPROX. LOCATION`) |
| 42 | Karo | 12 | HLS lewat http polos (`72.62.122.47:8888`, host yang dipin di tes) |
| 43 | Lebak (kabupaten) | 10 | HLS (`cctv.lebakkab.go.id`) |
| 44 | Pemalang | 12 | HLS (9 `APPROX. LOCATION`, 3 `CITY-LEVEL ONLY`) |

## Jalan tol

| # | Ruas tol | Kamera | Format |
|---|---|---:|---|
| 1 | Jalan Layang MBZ Toll | 44 | HLS |
| 2 | Jakarta-Cikampek Toll | 42 | HLS |
| 3 | Serpong-Balaraja Toll | 41 | HLS |
| 4 | Pekanbaru-Dumai Toll | 32 | HLS |
| 5 | JORR East Toll | 23 | HLS |
| 6 | JORR South Toll | 22 | HLS |
| 7 | Jagorawi Toll | 22 | HLS |
| 8 | Akses Tanjung Priok Toll | 20 | HLS |
| 9 | Dalam Kota Toll | 20 | HLS |
| 10 | Bengkulu-Taba Penanjung Toll | 18 | HLS |
| 11 | Indrapura-Kisaran Toll | 18 | HLS |
| 12 | Cipularang Toll | 16 | HLS |
| 13 | Semarang-Batang Toll | 16 | HLS |
| 14 | Balikpapan-Samarinda Toll | 13 | HLS |
| 15 | Sedyatmo Toll | 12 | HLS |
| 16 | Medan-Tebing Tinggi Toll | 19 | HLS |
| 17 | Padang-Sicincin Toll | 11 | HLS |
| 18 | Sigli-Banda Aceh Toll | 11 | HLS |
| 19 | Binjai-Langsa Toll | 10 | HLS |
| 20 | Jakarta-Tangerang Toll | 10 | HLS |
| 21 | Palembang-Indralaya Toll | 10 | HLS |
| 22 | Pekanbaru-Bangkinang Toll | 10 | HLS |
| 23 | Indralaya-Prabumulih Toll | 9 | HLS |
| 24 | Padaleunyi Toll | 9 | HLS |
| 25 | Cipali Toll (Cikopo-Palimanan) | 15 | HLS (`cctvastra.lintasmarga.com`; KM asumsi 70–188) |
| 26 | Pejagan-Pemalang Toll | 22 | HLS (`pptrlive.co.id`; KM 250–306, titik awal asumsi) |
| 27 | Ciawi-Sukabumi Toll | 6 | HLS (`www.tjt-info.co.id`; KM 47–55, titik awal asumsi) |
| 28 | Palimanan-Kanci Toll | 4 | HLS (KM 194,75–211,4, titik awal asumsi) |
| 29 | Pemalang-Batang Toll | 3 | HLS (`live.pbtr.co.id`; KM 307, 319, 344) |

## Bukan video live (tidak dihitung di atas)

- **Austin (AS)** dan **London (TfL)**: masing-masing 250 kamera, tetapi berupa **foto yang diperbarui berkala**, bukan video. Diambil saat runtime dari data terbuka.
- **Caltrans (California)**: diambil saat runtime dan jumlahnya berubah; saat dicek terakhir pengambilan data gagal (0 kamera), jadi tidak ada angka yang bisa dipastikan.
- **Shinjuku/Tokyo**: 3 kamera di `config/cctv_sources.shinjuku.json`, tidak dimuat secara default.
- **Kamera seed sintetis** (tanpa stream): tersisa untuk Medan dan Makassar (2 per kota) karena belum punya sumber live, plus seed kota luar negeri.

## Belum bisa dipakai (tidak masuk pack)

Kamera ini ada di sumbernya tetapi **tidak** didaftarkan, karena tidak menyajikan segmen video yang valid saat dicek.
Aturan masuk: kamera hanya dimasukkan bila pernah menyajikan segmen valid, dan dicek ulang tepat sebelum commit.
Pengecekan terakhir 2026-10-14 (cek ulang menyeluruh: kamera berstatus "belum dicek ulang" diuji lagi tiga putaran lalu lewat proxy aplikasi) dan 2026-10-13 (lainnya).

| Sumber | Kamera | Alasan | Status cek ulang |
|---|---:|---|---|
| Pekanbaru | 54 | 52 manifest 404, 2 tidak pernah menghasilkan segmen (SEBERANG MPP 1, SUDIRMAN - TUANKU TAMBUSAI 1); 3 pulih dan sudah dimasukkan | dicek ulang 2026-10-14 |
| Surakarta | sekitar 25 | 18 tidak pernah menjawab; 3 stream FLV berkodek VP6 (tidak bisa diputar browser) tidak dimasukkan; 4 lolos cek FLV tetapi gagal lewat proxy aplikasi; 58 stream lain pulih dan sudah dimasukkan | dicek ulang 2026-10-14 |
| Surabaya | sekitar 11 | urutan media beku atau playlist kosong, dan 404 terus. 4 kamera (cctv_285, 297, 387, 455) sempat bergerak lagi tetapi memakai http polos `36.66.208.101:5000` tanpa koordinat, jadi dianggap rapuh dan tidak dimasukkan | dicek ulang 2026-10-14 |
| Bandung Barat | 13 | selalu 404 | dicek 3 kali pada 2026-10-13, tetap mati |
| Bukittinggi | 8 | 404 / "File Not Found" | belum dicek ulang |
| Pasuruan | 2 | origin menjawab 404 | dicek ulang 2026-10-14, tetap mati |
| Solok | 1 | Simpang Sigege, 404 | belum dicek ulang |
| Padang Panjang | 1 | cam12 (Simpang SMPN 5), 404 | tetap mati |
| Pesisir Selatan | 1 | Kamera Carocok 1 hanya membalas "File Not Found"; Carocok 4 memakai stream yang sama dengan Carocok 3 sehingga disimpan sekali | tetap mati |
| Jalan tol Cipali | 5 | KM 164, 179 B, 189 hanya rekaman (ENDLIST); KM 188 C1 dan C2 ENDLIST lewat proxy aplikasi. 15 kamera lain sudah dimasukkan; rantai TLS lengkap berkat intermediate Sectigo R36 di `config/ca/` | dicek ulang 2026-10-14 |
| Banyuwangi | tidak diketahui | `live.banyuwangikab.go.id` menjawab 403 dengan `cf-mitigated: challenge` (tantangan Cloudflare). Melewatinya sama dengan menembus kontrol akses, jadi **dikecualikan** (dicek ulang 2026-10-14) | dikecualikan, tidak dilewati |
| Jalan tol: rotasi UUID `jmlive.jasamarga.com` | 149 | portal mengganti UUID stream; URL lama menjawab 502 atau bukan m3u8 dan tidak ada URL pengganti dengan KM yang sama. Barisnya **masih ada di pack** (belum dihapus) | butuh keputusan owner |
| Jalan tol: ruas tanpa titik awal KM yang bisa dipertanggungjawabkan | banyak | Manado-Bitung (rantai OSM terputus), Baleno dan Bayung Lencir-Tempino (data OSM gagal diambil), Kertosono-Mojokerto, Ngawi-Kertosono, Semarang A/B/C, Semarang-Solo, Pandaan-Malang; gerbang/ramp tanpa KM; host dengan rantai TLS tidak lengkap (`paspro-streaming`, `cijagolive`, tanpa intermediate di `config/ca/`) | tidak ditambahkan |
| Balangan (tambahan) | 13 | dari 15 URL yang belum masuk, 13 menjawab 404; 2 (Tugu Gula Habang) hidup dan sudah dimasukkan | dicek 2026-10-14 |
| Wonosobo, Brebes, Kudus, Samarinda, Sukoharjo | tidak diketahui | token per penonton, API 401, atau tantangan WAF/Turnstile; tidak dilewati | tidak ditambahkan |
| Sibolga, Pematangsiantar, Sidoarjo (smartcity), Indramayu, Kuningan, Tuban, Kebumen | tidak diketahui | tidak ada HLS statis yang bisa ditemukan (mediamtx tanpa path statis, hanya template string, satu stream saja, hanya API status, atau token stream) | tidak ditambahkan |
| Kudus | 1 | hanya satu stream bawaan dan tanpa koordinat; daftar kameranya butuh kunci di JavaScript situs | tidak ditambahkan |
| Medan, Kabupaten Bogor | tidak diketahui | daftar kamera hanya lewat API yang butuh client id/secret yang tertanam di JavaScript situs; tidak dipakai | tidak ditambahkan |
| Jawa Tengah Dishub GIS | tidak diketahui | butuh login | tidak ditambahkan |
| Grobogan | tidak diketahui | tidak ditemukan daftar atau stream publik | tidak ditambahkan |
| Banten (provinsi) | 127 | portal menandai Online tetapi manifest masih HTTP 404; 23 yang pulih sudah dimasukkan | dicek ulang 2026-10-14 |
| Banyumas 12, Semarang 10, Magelang 16, Cianjur 24, Banjar 19, Tasikmalaya 11 (rekaman ENDLIST), Kota Serang 3, Tangerang Kab. 2 | sekitar 97 | 404, reset koneksi, timeout, atau hanya rekaman; yang pulih (Semarang 13, Banyumas 5, Magelang 1) sudah dimasukkan | dicek ulang 2026-10-14 |
| Kutai Timur | tidak diketahui | situs di balik tantangan WAF proof-of-work; melewatinya tidak dilakukan | tidak ditambahkan |
| Gresik (cctvkanjeng) | 40 | dari 95 kamera: gagal start di sumber (RTSP ditolak, 401 atau error ffmpeg), playlist tidak pernah muncul, beku, atau offline menurut sumber. Respons start situs ini membocorkan kredensial RTSP kamera; tidak disimpan, sebaiknya dilaporkan ke admin situs | dicek ulang lewat proxy 2026-10-14 |
| Jombang | 9 | monitor ZoneMinder yang mengirim gambar "Unable to stream" (kamera mati di sumber) | dicek 2026-10-14 |
| Jatim Pelayaran (Dishub Jatim) | tidak diketahui | MJPEG lewat http, kredensial kamera tertanam, tanpa koordinat | tidak ditambahkan |
| Pontianak | tidak diketahui | hanya embed YouTube | tidak ditambahkan |
| Kaltim (layanan.kaltimprov) | tidak diketahui | kamera tidak aktif, WebRTC, atau URL bertoken sesi; rantai TLS tidak lengkap | tidak ditambahkan |
| cctvnusantara.com | tidak diketahui | agregator: URL stream tidak diterbitkan (relay di balik Turnstile); kamera pengadilan di luar cakupan; stream Serang "Bogeg" sudah masuk lewat kamera Kota Serang | tidak ditambahkan |
| Tanah Bumbu | 2 | ch09 dan ch07 timbul-tenggelam (404 / terputus) dalam 3 putaran cek | tidak ditambahkan |
| Situbondo | 12 | sumber on-demand MediaMTX: playlist menjawab HTTP 500 "source of path ... has timed out" (RTSP upstream mati) atau urutan media beku | dicek ulang 2026-10-14, 15 dari 27 pulih dan dimasukkan |
| Pati | 1 | CCTV Diskominfo Parkiran Depan, 404 | tidak dimasukkan |
| Sumber lain | tidak diketahui | BPJT (path 404), RTTMC (DNS gagal), smartcity.jakarta (butuh inspeksi browser), Bali Tower (host tidak terjangkau), ATCS Bandung (404) | belum dicek ulang |

Dua kamera **Padalarang Flyover - Cimareme** dan **- KBP** sempat 404, lalu lolos 5 probe berturut-turut dan 3 probe ulang tepat sebelum
dimasukkan (2026-10-13), jadi sekarang ada di pack. Keduanya kamera yang timbul-tenggelam: bisa hilang lagi, dan kalau itu terjadi
cukup dibiarkan atau dihapus per id (`bandungbarat-atcs-padalarang-flyover-*`).

Bukan kamera, tetapi sempat dibahas: layer Google My Maps (58 tempat evakuasi + 86 sirene tsunami) masih sebatas ide dan lisensinya belum jelas.

## Verifikasi pemutaran

Pada 2026-10-13, 149 kamera Sumatera Barat dan Bandung Barat diputar di Chrome headless (hls.js, lewat proxy `/api/cctv/media`),
dengan syarat video punya dimensi dan `currentTime` maju lebih dari 1 detik. **147 dari 149 berhasil diputar** (Bukittinggi 39/39,
Solok 18/18, Padang Panjang 14/14, Pesisir Selatan 7/7, Padang 27/28, Bandung Barat 42/43; dua kamera Flyover ditambahkan sesudahnya dan diputar terpisah lewat pengendali self-heal aplikasi: 10 dari 10 berhasil, tetapi satu putaran Cimareme baru siap setelah 53 detik karena origin sempat putus).
22 kamera gagal pada putaran pertama (batas 30 detik) dan 20 di antaranya berhasil pada putaran kedua (batas 75 detik): origin lambat
atau flaky, jadi sebagian kamera butuh waktu lama sebelum frame pertama muncul. Dua sisanya gagal saat dicek tetapi manifest-nya menjawab 200 pada
cek ulang lewat proxy, jadi tampak sementara: `padang-atcs-balaikota-pintu-keluar` (LL-HLS, gagal diurai sekali) dan `bandungbarat-atcs-langensari-cibodas` (manifest 404 sesaat).
Pengecekan ulang: kedua kamera itu lolos 4 dari 4 putaran, jadi tidak ada kamera yang tetap rusak. Pemeriksaan ini memakai player hls.js biasa di browser headless,
bukan panel CCTV aplikasi.

### Pengecekan di globe (aplikasi sungguhan)

Pada 2026-10-13, 10 kamera contoh (Bukittinggi, Solok, Padang Panjang, Pesisir Selatan, 2 Padang, 2 Flyover, Langensari-Cibodas, Lembang Orchid)
dipilih lewat `selectCamera(id, {focus: true})` di Chrome headless (software GL), lalu stream cermin monitor-plane 1920x1080 diambil sampel pikselnya.
**10 dari 10 mencapai status `live`**, tanpa error console. Waktu sampai live 1-12 detik; Lembang Orchid 26 detik karena sempat `retrying` lalu pulih
lewat self-heal. Gambar berubah antar sampel pada semuanya. Dua kamera Padang dan Langensari-Cibodas tampak identik pada jendela 4 detik tetapi
berubah pada jendela 16 detik (adegan sepi, bukan beku). Ini bukti jalur pemutaran bekerja, bukan jaminan semua kamera; kualitas visual dan performa render tidak dinilai.

### Kamera Padang (LL-HLS) kadang gagal di putaran pertama

Kamera Padang memakai LL-HLS (`.../hlsll/live/index.m3u8`). Proxy membuang tag PART karena tidak bisa menahan blocking reload, sehingga yang
tersisa hanya segmen yang sudah lengkap. Hasil pengukuran 2026-10-13: segmen di window upstream selalu berisi 135-145 KB (dugaan awal tentang
segmen awal yang kosong **tidak terbukti**). Yang terlihat adalah dua gejala langka: playlist yang untuk sesaat belum punya satu pun segmen lengkap
(2 dari 118 polling di `padang-atcs-balaikota-bundaran`, 0 dari 120 di `-pintu-keluar`; hls.js melapor `levelEmptyError`) dan sekali `fragParsingError`
pada segmen yang baru muncul. Dua-duanya hilang dengan sendirinya; lewat pengendali self-heal aplikasi (`createHlsSelfHeal`) 20 dari 20 pemutaran
berhasil, satu di antaranya baru siap setelah 13 detik. Tidak ada perubahan kode.

## Catatan

- Batch penemuan 2026-10-14: dari 514 kabupaten/kota (Permendagri 72/2019) ditelusuri subdomain CCTV/ATCS, lalu halaman, JavaScript dan API publiknya dibaca untuk m3u8 dan koordinat. Delapan situs baru lolos probe 3 putaran (segmen valid, urutan media maju) dan pengambilan lewat `/api/cctv/media`: 418 kamera (Nganjuk 289, Banjarbaru 47, Jambi 19, Garut 15, Ciamis 14, Karo 12, Lebak 10, Pemalang 12) ditambah 2 kamera Balangan. Pemutaran di browser/globe belum diuji untuk batch ini.

- 153 kamera batch 2026-10-14 (Banda Aceh, Balangan, Banjarmasin, Kotawaringin Barat, Tanah Bumbu, Situbondo) lolos probe langsung (3 putaran) dan pengambilan lewat `/api/cctv/media` di dev server. Pemutaran di browser/globe belum diuji untuk batch ini. Banda Aceh memuat banyak monitor taman/tinggi muka air; Banjarmasin tertunda sekitar 30 detik.
- Batch tol 2026-10-14: UUID `jmlive.jasamarga.com` dirotasi portal, sehingga 108 baris lama diperbarui ke URL baru (dicocokkan lewat awalan ruas + KM + akhiran A/B, posisi tidak berubah) dan 57 baris baru ditambahkan (4 ruas baru: Pejagan-Pemalang, Pemalang-Batang, Palimanan-Kanci, Ciawi-Sukabumi; perluasan Pekanbaru-Dumai +11, Medan-Tebing Tinggi +8, MBZ, JORR Selatan, Semarang-Batang +1). 165 dari 165 baris yang berubah/baru lolos probe 3 putaran dan pengambilan lewat `/api/cctv/media`. Pemutaran di browser/globe belum diuji.
- Katalog gabungan saat ini sekitar 3050 kamera (batas 4000; batas lama 3000 dinaikkan karena pack 2372 ditambah alokasi Austin/Caltrans/TfL dan cadangan tidak lagi muat). Kamera live yang dilaporkan sehat atau offline tergantung kondisi sumber pada saat itu; angka di atas adalah jumlah yang terdaftar, bukan jaminan semuanya menyala.
- Hapus per kota dengan prefiks id-nya (misalnya `surakarta-atcs-*`), atau matikan seluruh paket dengan `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`.
