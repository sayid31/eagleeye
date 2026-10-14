# URL CCTV live

Daftar URL stream video langsung (HLS/FLV) dari `config/cctv_sources.indonesia_unofficial.json` (Indonesia, sumber tidak resmi, hanya untuk demo internal). Dibuat dari isi file itu; ringkasan, label posisi, dan kamera yang belum bisa dipakai ada di `cctvLive.md`.

| | Jumlah |
|---|---:|
| **Total URL** | **2584** |
| Kota dan kabupaten (44 lokasi) | 2040 |
| Jalan tol (35 ruas) | 544 |
| HLS | 2434 |
| FLV | 134 |
| MJPEG (Jombang) | 16 |

Catatan:

- Daftar ini adalah kamera yang terdaftar di pack. Sumber tidak resmi bisa mati atau timbul-tenggelam kapan saja, jadi URL yang ada di sini bukan jaminan masih menyala.
- **Malang (199)**: entri pack ini membawa `portalSession` (bootstrap `https://cctv.malangkota.go.id/`, Referer `https://cctv.malangkota.go.id/sebaran-cctv`), artinya aplikasi membuka sesi portal itu lewat proxy `/api/cctv/media` sebelum mengambil stream. Memutar URL mentah di bawah dari player lain mungkin ditolak; hal itu tidak diuji di sini.
- **Gresik (55) dan Jombang (16)**: URL di bawah adalah URL polos tanpa token. Gresik hanya menyala setelah proxy aplikasi membuka sesi penonton anonim (`POST .../start`, `heartbeat` tiap 20 detik, `stop`), jadi memutar URL mentah di player lain biasanya 404. Jombang memakai token JWT 2 jam yang tercetak di halaman publik `https://cctv.jombangkab.go.id/v2/`; proxy membacanya saat dijalankan, tidak pernah disimpan. Tanpa token stream menjawab 403.
- URL di daftar ini tidak memakai query string, dan hanya Malang yang punya `portalSession`, Gresik `onDemand` dan Jombang `pageToken` di data. Tidak ada kunci atau token yang tersimpan di file ini.
- Hapus per kota dengan prefiks id-nya, atau matikan seluruh pack dengan `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`.

## Kota dan kabupaten
### Malang (199)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `malang-atcs-292570058740218968707392` | ATCS XJGH+V49 TAMAN GADANG | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/292570058740218968707392.m3u8` |
| 2 | `malang-atcs-772701504430563728087236` | ATCS Jl. Satsui Tubun No.25 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/772701504430563728087236.m3u8` |
| 3 | `malang-atcs-256581523014055687826746` | ATCS Jl. Rajasa No.8 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/256581523014055687826746.m3u8` |
| 4 | `malang-atcs-791264717746791807536169` | ATCS Jl. Gadang Bumiayu No.8 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/791264717746791807536169.m3u8` |
| 5 | `malang-atcs-336686011348989661063244` | ATCS Jl. Nasional 23 No.24 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/336686011348989661063244.m3u8` |
| 6 | `malang-atcs-215178419587511478247119` | ATCS Jl. S. Supriadi No.15-24 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/215178419587511478247119.m3u8` |
| 7 | `malang-atcs-390518457780656230115714` | ATCS Jl. Rajasa No.2012 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/390518457780656230115714.m3u8` |
| 8 | `malang-atcs-872337836594410225468546` | ATCS Jl. Mayjen Sungkono No.13b | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/872337836594410225468546.m3u8` |
| 9 | `malang-atcs-648109998063016154575665` | ATCS depan perkantoran terpadu | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/648109998063016154575665.m3u8` |
| 10 | `malang-atcs-341249267574702296399925` | ATCS jl. Mayjen Sungkono Block Office | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/341249267574702296399925.m3u8` |
| 11 | `malang-atcs-246296455949996661977887` | ATCS jl. meyjend sungkono arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/246296455949996661977887.m3u8` |
| 12 | `malang-atcs-247069575513558870999554` | ATCS jl, meyjend sungkono arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/247069575513558870999554.m3u8` |
| 13 | `malang-atcs-519874872010984433957942` | ATCS jl. kol sugiono arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/519874872010984433957942.m3u8` |
| 14 | `malang-atcs-906088015550297661590404` | ATCS jl. s. supriadi arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/906088015550297661590404.m3u8` |
| 15 | `malang-atcs-045410553225288501472916` | ATCS jl. s. supriadi (klayatan III) | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/045410553225288501472916.m3u8` |
| 16 | `malang-atcs-721240097001535400904802` | ATCS jl. s. supriadi arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/721240097001535400904802.m3u8` |
| 17 | `malang-atcs-171077206204474544672476` | ATCS jl. janti barat arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/171077206204474544672476.m3u8` |
| 18 | `malang-atcs-456402990956810340846657` | ATCS jl. s supriadi arah utara lokassi klayatan III | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/456402990956810340846657.m3u8` |
| 19 | `malang-atcs-424989231290086461229636` | ATCS jl. meyjend sungkono arah selatan (jembatan) | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/424989231290086461229636.m3u8` |
| 20 | `malang-atcs-397487832387359645963672` | ATCS jl. gribig arah utara (jembatan) | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/397487832387359645963672.m3u8` |
| 21 | `malang-atcs-284039786620080380014346` | ATCS jl. muharto arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/284039786620080380014346.m3u8` |
| 22 | `malang-atcs-359461418488526462162650` | ATCS jl. martadinata arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/359461418488526462162650.m3u8` |
| 23 | `malang-atcs-836708782306919156448722` | ATCS jl. bingkil | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/836708782306919156448722.m3u8` |
| 24 | `malang-atcs-858976621501627801724527` | ATCS jl. malmahera arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/858976621501627801724527.m3u8` |
| 25 | `malang-atcs-212039658036127116733044` | ATCS jl. nusakambangan arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/212039658036127116733044.m3u8` |
| 26 | `malang-atcs-652269633484216664565215` | ATCS jl. arif manrgno arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/652269633484216664565215.m3u8` |
| 27 | `malang-atcs-259213973885550105439889` | ATCS jl. nusakambangan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/259213973885550105439889.m3u8` |
| 28 | `malang-atcs-713846259452297607019995` | ATCS jl. arif margono arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/713846259452297607019995.m3u8` |
| 29 | `malang-atcs-620853484047521997472024` | ATCS jl. yulius usman arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/620853484047521997472024.m3u8` |
| 30 | `malang-atcs-346702335161875943863648` | ATCS jl. Sulawesi arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/346702335161875943863648.m3u8` |
| 31 | `malang-atcs-530280435954205770660031` | ATCS jl. yulius usman arah timur no 22 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/530280435954205770660031.m3u8` |
| 32 | `malang-atcs-920796867173871680340694` | ATCS jl. yulius usman arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/920796867173871680340694.m3u8` |
| 33 | `malang-atcs-373262875962388363723269` | ATCS jl. kyai tamin arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/373262875962388363723269.m3u8` |
| 34 | `malang-atcs-787400068366441690070099` | ATCS pasar besar arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/787400068366441690070099.m3u8` |
| 35 | `malang-atcs-112214116527259160582301` | ATCS jl. sultan syahrir arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/112214116527259160582301.m3u8` |
| 36 | `malang-atcs-629217349359529662387028` | ATCS jl. pranoto arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/629217349359529662387028.m3u8` |
| 37 | `malang-atcs-791662500424223576621102` | ATCS jl. pasar besar arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/791662500424223576621102.m3u8` |
| 38 | `malang-atcs-006065046819333616502324` | ATCS jl. martadinata arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/006065046819333616502324.m3u8` |
| 39 | `malang-atcs-505886570472987236280044` | ATCS jl. zainal zakse arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/505886570472987236280044.m3u8` |
| 40 | `malang-atcs-938035466891117643541014` | ATCS jl. gatot Subroto arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/938035466891117643541014.m3u8` |
| 41 | `malang-atcs-623797234825519031426274` | ATCS jl. pasar besar arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/623797234825519031426274.m3u8` |
| 42 | `malang-atcs-333495472392613611434090` | ATCS jl. syarif al-qodri arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/333495472392613611434090.m3u8` |
| 43 | `malang-atcs-340486331612923975414024` | ATCS jl. ade Irma suryani arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/340486331612923975414024.m3u8` |
| 44 | `malang-atcs-453382724774773485227390` | ATCS jl. kebalen wetan arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/453382724774773485227390.m3u8` |
| 45 | `malang-atcs-420501415743258073902708` | ATCS jl. zaenal zakse arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/420501415743258073902708.m3u8` |
| 46 | `malang-atcs-247723564512685003488446` | ATCS jl.juanda arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/247723564512685003488446.m3u8` |
| 47 | `malang-atcs-023076357712194374375085` | ATCS jl. muharto arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/023076357712194374375085.m3u8` |
| 48 | `malang-atcs-789762621921935268666704` | ATCS Jl. Arif Margono No.31D | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/789762621921935268666704.m3u8` |
| 49 | `malang-atcs-585001585243656697946585` | ATCS Jl. Tumapel No.142 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/585001585243656697946585.m3u8` |
| 50 | `malang-atcs-171664895247859983097279` | ATCS jl. Hasyim ashari arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/171664895247859983097279.m3u8` |
| 51 | `malang-atcs-913339812782937126202419` | ATCS jl. kauman arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/913339812782937126202419.m3u8` |
| 52 | `malang-atcs-406217477871280304673887` | ATCS jl. Hasyim ashari arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/406217477871280304673887.m3u8` |
| 53 | `malang-atcs-079331433202834680650395` | ATCS jl. a.r hakim arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/079331433202834680650395.m3u8` |
| 54 | `malang-atcs-060929711024394280433963` | ATCS jl. kawi arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/060929711024394280433963.m3u8` |
| 55 | `malang-atcs-584894580391537462827774` | ATCS jl. kh. Hasyim ashari arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/584894580391537462827774.m3u8` |
| 56 | `malang-atcs-662201042760075959506830` | ATCS jl. merdeka barat arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/662201042760075959506830.m3u8` |
| 57 | `malang-atcs-818599107354393628794315` | ATCS jl. merdeka barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/818599107354393628794315.m3u8` |
| 58 | `malang-atcs-117940938424194503584011` | ATCS jl. agus salim arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/117940938424194503584011.m3u8` |
| 59 | `malang-atcs-217486301753431654065609` | ATCS jl. agus salim arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/217486301753431654065609.m3u8` |
| 60 | `malang-atcs-222512201418345708685754` | ATCS jl. agus salim arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/222512201418345708685754.m3u8` |
| 61 | `malang-atcs-888598335546629776669925` | ATCS jl. zainul Arifin arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/888598335546629776669925.m3u8` |
| 62 | `malang-atcs-394839611609021690258370` | ATCS Jl. Zainul Arifin No.59 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/394839611609021690258370.m3u8` |
| 63 | `malang-atcs-422383028253759413095916` | ATCS jl. kh ahmad Dahlan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/422383028253759413095916.m3u8` |
| 64 | `malang-atcs-121335965337329637078039` | ATCS Jl. Ir. H. Juanda No.1b | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/121335965337329637078039.m3u8` |
| 65 | `malang-atcs-192101052696608982929523` | ATCS Jl. Gatot Subroto No.38 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/192101052696608982929523.m3u8` |
| 66 | `malang-atcs-717880005188495257691864` | ATCS Jl. Gatot Subroto No.1 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/717880005188495257691864.m3u8` |
| 67 | `malang-atcs-756753165339510713064459` | ATCS kampung tridi | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/756753165339510713064459.m3u8` |
| 68 | `malang-atcs-491236279805146068523382` | ATCS Jl. Aries Munandar No.30 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/491236279805146068523382.m3u8` |
| 69 | `malang-atcs-002327922068835068551525` | ATCS Jl. Zainul Arifin No.1 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/002327922068835068551525.m3u8` |
| 70 | `malang-atcs-472503741586852378929425` | ATCS Jl. Jenderal Basuki Rahmat No.1 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/472503741586852378929425.m3u8` |
| 71 | `malang-atcs-375341952336011589690586` | ATCS jl. merdeka utara arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/375341952336011589690586.m3u8` |
| 72 | `malang-atcs-293434869573645632741268` | ATCS jl. merdeka timur arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/293434869573645632741268.m3u8` |
| 73 | `malang-atcs-825109914933198114646936` | ATCS Jl. Jenderal Basuki Rahmat No.4 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/825109914933198114646936.m3u8` |
| 74 | `malang-atcs-116009283303235824630445` | ATCS Jl. MGR Sugiyopranoto No.3A | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/116009283303235824630445.m3u8` |
| 75 | `malang-atcs-291214161756678285690451` | ATCS Jl. Jenderal Basuki Rahmat No.6e | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/291214161756678285690451.m3u8` |
| 76 | `malang-atcs-383467698805698590809269` | ATCS Jl. Basuki Rachmad | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/383467698805698590809269.m3u8` |
| 77 | `malang-atcs-599118267175295987908194` | ATCS jl. arjuno arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/599118267175295987908194.m3u8` |
| 78 | `malang-atcs-244729190133053856685781` | ATCS jl. kawi arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/244729190133053856685781.m3u8` |
| 79 | `malang-atcs-269060901340905226381917` | ATCS jl. kawi arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/269060901340905226381917.m3u8` |
| 80 | `malang-atcs-433161038569412405938175` | ATCS Jl. Kawi No.11 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/433161038569412405938175.m3u8` |
| 81 | `malang-atcs-664697529898892981084889` | ATCS Jl. Bromo No.14-4 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/664697529898892981084889.m3u8` |
| 82 | `malang-atcs-067883214706611879049144` | ATCS Jl. Kawi No.22 A | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/067883214706611879049144.m3u8` |
| 83 | `malang-atcs-192932202274819493009134` | ATCS Jalan kawi bawah 4 no 3A | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/192932202274819493009134.m3u8` |
| 84 | `malang-atcs-494044159463642643864378` | ATCS Jl. Bareng Kartini 3D No.194 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/494044159463642643864378.m3u8` |
| 85 | `malang-atcs-495229592063339988032865` | ATCS jl. terusan ijen arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/495229592063339988032865.m3u8` |
| 86 | `malang-atcs-467561291886570342820693` | ATCS jl. ijen arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/467561291886570342820693.m3u8` |
| 87 | `malang-atcs-322877538584592778525433` | ATCS Jl. Kawi No.46 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/322877538584592778525433.m3u8` |
| 88 | `malang-atcs-642085663280892020139410` | ATCS Jl. Kawi No.46 timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/642085663280892020139410.m3u8` |
| 89 | `malang-atcs-573357726087672833075775` | ATCS jl. langsep arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/573357726087672833075775.m3u8` |
| 90 | `malang-atcs-547359693237078797537666` | ATCS jl. dieng arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/547359693237078797537666.m3u8` |
| 91 | `malang-atcs-564510132783646943412082` | ATCS jl. galunggung arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/564510132783646943412082.m3u8` |
| 92 | `malang-atcs-889779720689036295934998` | ATCS jl. galunggung arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/889779720689036295934998.m3u8` |
| 93 | `malang-atcs-710655546702615517203062` | ATCS Jl. Galunggung No.74 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/710655546702615517203062.m3u8` |
| 94 | `malang-atcs-879779063216883395653396` | ATCS Jl. Galunggung No.76c | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/879779063216883395653396.m3u8` |
| 95 | `malang-atcs-611606309979396608294034` | ATCS jl. ijen arah utara (sisi barat) | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/611606309979396608294034.m3u8` |
| 96 | `malang-atcs-653722151300593309331609` | ATCS jl. simpang balapan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/653722151300593309331609.m3u8` |
| 97 | `malang-atcs-383651772119550945722301` | ATCS jl. simpang balapan arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/383651772119550945722301.m3u8` |
| 98 | `malang-atcs-098343692068108583411220` | ATCS jl. ijen arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/098343692068108583411220.m3u8` |
| 99 | `malang-atcs-643592251459005888214586` | ATCS jl. patimura arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/643592251459005888214586.m3u8` |
| 100 | `malang-atcs-844727028021085216938269` | ATCS jl. patimura arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/844727028021085216938269.m3u8` |
| 101 | `malang-atcs-028590945630518341489747` | ATCS jl. Wahidin arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/028590945630518341489747.m3u8` |
| 102 | `malang-atcs-655224432137058620115166` | ATCS jl. j.a. suprapto arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/655224432137058620115166.m3u8` |
| 103 | `malang-atcs-092075042505129095657722` | ATCS jl. j.a. suprapto arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/092075042505129095657722.m3u8` |
| 104 | `malang-atcs-395810883923327543094739` | ATCS jl. j.a. suprapto arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/395810883923327543094739.m3u8` |
| 105 | `malang-atcs-876263708687156206364361` | ATCS Jl. Polowijen II No.314 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/876263708687156206364361.m3u8` |
| 106 | `malang-atcs-654189372598870108548003` | ATCS jl. slamet riadi arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/654189372598870108548003.m3u8` |
| 107 | `malang-atcs-771615331018457682499213` | ATCS jl. Basuki rahmat arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/771615331018457682499213.m3u8` |
| 108 | `malang-atcs-994477999826297213214297` | ATCS jl. kahuripan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/994477999826297213214297.m3u8` |
| 109 | `malang-atcs-134679292061611148844449` | ATCS jl. Basuki rahmat arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/134679292061611148844449.m3u8` |
| 110 | `malang-atcs-776763144322125195609829` | ATCS jl. semeru arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/776763144322125195609829.m3u8` |
| 111 | `malang-atcs-253598743355115924306355` | ATCS jl. semeru arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/253598743355115924306355.m3u8` |
| 112 | `malang-atcs-898902535875476482823426` | ATCS jl. bromo arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/898902535875476482823426.m3u8` |
| 113 | `malang-atcs-717958972035700755246088` | ATCS jl. semeru arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/717958972035700755246088.m3u8` |
| 114 | `malang-atcs-421607974337796002196100` | ATCS jl. Jl. Besar Ijen No.24 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/421607974337796002196100.m3u8` |
| 115 | `malang-atcs-996051630808365936867998` | ATCS jl. retawu | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/996051630808365936867998.m3u8` |
| 116 | `malang-atcs-735506210316890709562691` | ATCS jl. ijen arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/735506210316890709562691.m3u8` |
| 117 | `malang-atcs-408386140723144623861301` | ATCS JL. Ijen, No 90-92 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/408386140723144623861301.m3u8` |
| 118 | `malang-atcs-603889351830833340753818` | ATCS jl. pahlawan trip | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/603889351830833340753818.m3u8` |
| 119 | `malang-atcs-031608321985243356752404` | ATCS jl. kesatrian arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/031608321985243356752404.m3u8` |
| 120 | `malang-atcs-498383745389554459491639` | ATCS jl. urip sumaharjo arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/498383745389554459491639.m3u8` |
| 121 | `malang-atcs-973041049647521784083717` | ATCS jl. meyjend wiyono arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/973041049647521784083717.m3u8` |
| 122 | `malang-atcs-786150212613240322734192` | ATCS Jl. Simpang Kesatrian No.6 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/786150212613240322734192.m3u8` |
| 123 | `malang-atcs-320035756896441723894425` | ATCS jl. panglima sudirman arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/320035756896441723894425.m3u8` |
| 124 | `malang-atcs-490601680936121642601185` | ATCS jl. urip sumaharjo arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/490601680936121642601185.m3u8` |
| 125 | `malang-atcs-024271174990073130193626` | ATCS jl. Sudirman arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/024271174990073130193626.m3u8` |
| 126 | `malang-atcs-008689729209182017615333` | ATCS JL. Trunojoyo No. 46 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/008689729209182017615333.m3u8` |
| 127 | `malang-atcs-462406715974251335062174` | ATCS jl. cokroaminoto arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/462406715974251335062174.m3u8` |
| 128 | `malang-atcs-143725395052441804689699` | ATCS jl. raya cemorokandang | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/143725395052441804689699.m3u8` |
| 129 | `malang-atcs-748163626141039645450448` | ATCS jl. cemorokandang arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/748163626141039645450448.m3u8` |
| 130 | `malang-atcs-919248977431029784415723` | ATCS jl. ki ageng gribik arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/919248977431029784415723.m3u8` |
| 131 | `malang-atcs-817521846151282907919064` | ATCS jl. ki ageng gribig arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/817521846151282907919064.m3u8` |
| 132 | `malang-atcs-748385964560314122807188` | ATCS jl. kyaiageng gribig arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/748385964560314122807188.m3u8` |
| 133 | `malang-atcs-133105391563125665089003` | ATCS jl. danau toba arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/133105391563125665089003.m3u8` |
| 134 | `malang-atcs-037075518670899465560926` | ATCS Jl. Danau Kerinci Raya No.1 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/037075518670899465560926.m3u8` |
| 135 | `malang-atcs-931466165340267193793620` | ATCS jl. danau kerinci arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/931466165340267193793620.m3u8` |
| 136 | `malang-atcs-799063606348608223030193` | ATCS jl. danau toba arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/799063606348608223030193.m3u8` |
| 137 | `malang-atcs-007769084157082641425855` | ATCS jl. ranugrati arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/007769084157082641425855.m3u8` |
| 138 | `malang-atcs-004708955419442040752767` | ATCS Jl. Simpang Ranugrati No.5d | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/004708955419442040752767.m3u8` |
| 139 | `malang-atcs-051869339713065045968859` | ATCS jl. ters sulfat arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/051869339713065045968859.m3u8` |
| 140 | `malang-atcs-753337323046986013041375` | ATCS jl. terusan sulfat arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/753337323046986013041375.m3u8` |
| 141 | `malang-atcs-255437547268502386905563` | ATCS Jl. Terusan Sulfat No.3 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/255437547268502386905563.m3u8` |
| 142 | `malang-atcs-212852265924619178576872` | ATCS Jl. Terusan Sulfat No.69 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/212852265924619178576872.m3u8` |
| 143 | `malang-atcs-823145150519459797757495` | ATCS jl. simpang sulfat arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/823145150519459797757495.m3u8` |
| 144 | `malang-atcs-408048032842553451896390` | ATCS Jl. Terusan Sulfat No.2 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/408048032842553451896390.m3u8` |
| 145 | `malang-atcs-886421518518743577298499` | ATCS jl. la. sucipto arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/886421518518743577298499.m3u8` |
| 146 | `malang-atcs-537255318919087826651532` | ATCS jl. la. sucipto arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/537255318919087826651532.m3u8` |
| 147 | `malang-atcs-340493797437204668929658` | ATCS jl. la. sucipto arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/340493797437204668929658.m3u8` |
| 148 | `malang-atcs-563924488881364781254566` | ATCS jl. raden panji suroso utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/563924488881364781254566.m3u8` |
| 149 | `malang-atcs-272315206096758266726516` | ATCS Jl. Laksda Adi Sucipto No.151 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/272315206096758266726516.m3u8` |
| 150 | `malang-atcs-203191103351222911095423` | ATCS Jl. Veteran I | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/203191103351222911095423.m3u8` |
| 151 | `malang-atcs-636589114401733445781917` | ATCS jl. veteran arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/636589114401733445781917.m3u8` |
| 152 | `malang-atcs-639466428930627267991858` | ATCS jl. sumber sari arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/639466428930627267991858.m3u8` |
| 153 | `malang-atcs-767576969564466612969572` | ATCS jl. veteran gerbang ub | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/767576969564466612969572.m3u8` |
| 154 | `malang-atcs-386132036661026320418844` | ATCS Jl. Bendungan Sutami No.1 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/386132036661026320418844.m3u8` |
| 155 | `malang-atcs-967823448439028638648911` | ATCS jl. sigura-gura rah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/967823448439028638648911.m3u8` |
| 156 | `malang-atcs-673512185163543498056968` | ATCS jl. panjaitan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/673512185163543498056968.m3u8` |
| 157 | `malang-atcs-003687850006099691498995` | ATCS jl. soekarno hatta arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/003687850006099691498995.m3u8` |
| 158 | `malang-atcs-385150101635081489243344` | ATCS jl. gajayana arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/385150101635081489243344.m3u8` |
| 159 | `malang-atcs-715337494726392556880466` | ATCS jl. simp. gajayana arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/715337494726392556880466.m3u8` |
| 160 | `malang-atcs-455597782591873967365987` | ATCS jl. gajayana arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/455597782591873967365987.m3u8` |
| 161 | `malang-atcs-446907421280943044413749` | ATCS jl. mt haryono arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/446907421280943044413749.m3u8` |
| 162 | `malang-atcs-373865942595202639251772` | ATCS Jl. MT. Haryono No.35 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/373865942595202639251772.m3u8` |
| 163 | `malang-atcs-227920422769509645238654` | ATCS Jl. Soekarno Hatta No.45b | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/227920422769509645238654.m3u8` |
| 164 | `malang-atcs-490076087057536757601215` | ATCS Jl. Soekarno Hatta No.50 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/490076087057536757601215.m3u8` |
| 165 | `malang-atcs-184398221253246434285173` | ATCS jl. soekarno hatta timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/184398221253246434285173.m3u8` |
| 166 | `malang-atcs-889793263483161081015834` | ATCS jl. soekarno hatta selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/889793263483161081015834.m3u8` |
| 167 | `malang-atcs-807179387709306202506877` | ATCS jl. Borobudur arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/807179387709306202506877.m3u8` |
| 168 | `malang-atcs-895502928116887610228060` | ATCS jl. candi panggung arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/895502928116887610228060.m3u8` |
| 169 | `malang-atcs-704720868465795037095760` | ATCS jl. tlogomas arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/704720868465795037095760.m3u8` |
| 170 | `malang-atcs-318197263503692449077822` | ATCS jl. tlogomas arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/318197263503692449077822.m3u8` |
| 171 | `malang-atcs-522539750301519499247770` | ATCS jembatan tunggulmas | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/522539750301519499247770.m3u8` |
| 172 | `malang-atcs-097779292771471341955457` | ATCS pertigaan jembatan tunggulmas | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/097779292771471341955457.m3u8` |
| 173 | `malang-atcs-180731272173025410229793` | ATCS jl. tlogomas arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/180731272173025410229793.m3u8` |
| 174 | `malang-atcs-572534477246123479166921` | ATCS Jl. Raya Tlogomas No.14a | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/572534477246123479166921.m3u8` |
| 175 | `malang-atcs-963661947392775741127849` | ATCS Jl. Raya Tlogomas No.49 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/963661947392775741127849.m3u8` |
| 176 | `malang-atcs-810133524862588268334710` | ATCS jl. letjend s parman arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/810133524862588268334710.m3u8` |
| 177 | `malang-atcs-637253114452609264665590` | ATCS jl. letjend s parman arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/637253114452609264665590.m3u8` |
| 178 | `malang-atcs-006104464277312024187785` | ATCS jl. melati arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/006104464277312024187785.m3u8` |
| 179 | `malang-atcs-032716732487147302736608` | ATCS jl. kedawung arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/032716732487147302736608.m3u8` |
| 180 | `malang-atcs-289833992881029327755836` | ATCS jl. cengger ayam arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/289833992881029327755836.m3u8` |
| 181 | `malang-atcs-553368650971977610920123` | ATCS jl. kalpataru arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/553368650971977610920123.m3u8` |
| 182 | `malang-atcs-511560590871402984783229` | ATCS jl. danau bratan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/511560590871402984783229.m3u8` |
| 183 | `malang-atcs-392886608131064314613341` | ATCS jl. danau bratan arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/392886608131064314613341.m3u8` |
| 184 | `malang-atcs-148960239776637882670743` | ATCS jl. danau kerinci arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/148960239776637882670743.m3u8` |
| 185 | `malang-atcs-892431741317523091394671` | ATCS jl. danau kerinci arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/892431741317523091394671.m3u8` |
| 186 | `malang-atcs-044906552951351361548373` | ATCS jl. raden panji suroso arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/044906552951351361548373.m3u8` |
| 187 | `malang-atcs-654598878424524457231701` | ATCS jl. raden panji suroso arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/654598878424524457231701.m3u8` |
| 188 | `malang-atcs-323299835038577603023529` | ATCS Jl. Raden Panji Suroso No.8g | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/323299835038577603023529.m3u8` |
| 189 | `malang-atcs-196782209615539550198936` | ATCS jl. simpang panji suroso | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/196782209615539550198936.m3u8` |
| 190 | `malang-atcs-884548119530974853338399` | ATCS jl. panji suroro arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/884548119530974853338399.m3u8` |
| 191 | `malang-atcs-466452347587002114136805` | ATCS jl. r. panji suroso arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/466452347587002114136805.m3u8` |
| 192 | `malang-atcs-053338675520352467621994` | ATCS jl. raden intan arah barat | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/053338675520352467621994.m3u8` |
| 193 | `malang-atcs-925153886443577207350912` | ATCS jl. raden intan arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/925153886443577207350912.m3u8` |
| 194 | `malang-atcs-957992467319427676437983` | ATCS jl. ahmad yani arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/957992467319427676437983.m3u8` |
| 195 | `malang-atcs-300544351200121565371840` | ATCS jl. ahmad yani arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/300544351200121565371840.m3u8` |
| 196 | `malang-atcs-712057197220164117651869` | ATCS jl. raden intan arah timur | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/712057197220164117651869.m3u8` |
| 197 | `malang-atcs-902490552268458858290479` | ATCS Jl. Raden Intan No.7 | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/902490552268458858290479.m3u8` |
| 198 | `malang-atcs-984300820927127330245429` | ATCS jl. a. yani utara arah selatan | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/984300820927127330245429.m3u8` |
| 199 | `malang-atcs-195874189915723862555674` | ATCS jl. a. yani utara arah utara | HLS | `https://cctv.malangkota.go.id/cctv-stream/streams/195874189915723862555674.m3u8` |

### Surabaya (141)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `sby-atcs-144-aditya-warman-inragiri-timur` | ATCS Aditya Warman Inragiri Timur | HLS | `http://36.66.208.101:5000/hls/cctv_144/stream.m3u8` |
| 2 | `sby-atcs-159-aditya-warmansutos-panovu` | ATCS Aditya Warmansutos Panovu | HLS | `http://36.66.208.101:5000/hls/cctv_159/stream.m3u8` |
| 3 | `sby-atcs-157-bolongsari-praja-selatan` | ATCS Bolongsari Praja Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_157/stream.m3u8` |
| 4 | `sby-atcs-120-banyu-orip-putat-ptz` | ATCS Banyu Orip Putat Ptz | HLS | `http://36.66.208.101:5000/hls/cctv_120/stream.m3u8` |
| 5 | `sby-atcs-108-diponegoro-ciliwung-barat-ptz` | ATCS Diponegoro Ciliwung Barat Ptz | HLS | `http://36.66.208.101:5000/hls/cctv_108/stream.m3u8` |
| 6 | `sby-atcs-118-diponegoro-kartini-ptz` | ATCS Diponegoro Kartini Ptz | HLS | `http://36.66.208.101:5000/hls/cctv_118/stream.m3u8` |
| 7 | `sby-atcs-112-diponegoro-musi-selatan` | ATCS Diponegoro Musi Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_112/stream.m3u8` |
| 8 | `sby-atcs-111-diponegoro-musi-utara` | ATCS Diponegoro Musi Utara | HLS | `http://36.66.208.101:5000/hls/cctv_111/stream.m3u8` |
| 9 | `sby-atcs-117-diponegoro-soetomo-selatan` | ATCS Diponegoro Soetomo Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_117/stream.m3u8` |
| 10 | `sby-atcs-166-dukuh-kupang-islamic-center` | ATCS Dukuh Kupang Islamic Center | HLS | `http://36.66.208.101:5000/hls/cctv_166/stream.m3u8` |
| 11 | `sby-atcs-182-gereja-kota-satelit-pano` | ATCS Gereja Kota Satelit Pano | HLS | `http://36.66.208.101:5000/hls/cctv_182/stream.m3u8` |
| 12 | `sby-atcs-123-kedungdoro-kedungsari` | ATCS Kedungdoro Kedungsari | HLS | `http://36.66.208.101:5000/hls/cctv_123/stream.m3u8` |
| 13 | `sby-atcs-124-kedungdoro-kedungsari-selatan` | ATCS Kedungdoro Kedungsari Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_124/stream.m3u8` |
| 14 | `sby-atcs-171-made-lakarsantri-timur` | ATCS Made - Lakarsantri Timur | HLS | `http://36.66.208.101:5000/hls/cctv_171/stream.m3u8` |
| 15 | `sby-atcs-146-mayjend-sungkono-ciwo-barat` | ATCS Mayjend Sungkono Ciwo Barat | HLS | `http://36.66.208.101:5000/hls/cctv_146/stream.m3u8` |
| 16 | `sby-atcs-148-mayjend-sungkono-ciwo-timur` | ATCS Mayjend Sungkono Ciwo Timur | HLS | `http://36.66.208.101:5000/hls/cctv_148/stream.m3u8` |
| 17 | `sby-atcs-150-meyjend-sungkono-tvri-barat` | ATCS Meyjend Sungkono Tvri Barat | HLS | `http://36.66.208.101:5000/hls/cctv_150/stream.m3u8` |
| 18 | `sby-atcs-149-meyjend-sungkono-tvri-pano` | ATCS Meyjend Sungkono Tvri Pano | HLS | `http://36.66.208.101:5000/hls/cctv_149/stream.m3u8` |
| 19 | `sby-atcs-122-pasar-kembang-arjuno` | ATCS Pasar Kembang Arjuno | HLS | `http://36.66.208.101:5000/hls/cctv_122/stream.m3u8` |
| 20 | `sby-atcs-165-patimura-iph-school` | ATCS Patimura Iph School | HLS | `http://36.66.208.101:5000/hls/cctv_165/stream.m3u8` |
| 21 | `sby-atcs-176-pctl-myjend-sungkono-barat` | ATCS Pctl Myjend Sungkono Barat | HLS | `http://36.66.208.101:5000/hls/cctv_176/stream.m3u8` |
| 22 | `sby-atcs-181-royal-residence-pano` | ATCS Royal Residence Pano | HLS | `http://36.66.208.101:5000/hls/cctv_181/stream.m3u8` |
| 23 | `sby-atcs-180-royal-residence-timur` | ATCS Royal Residence Timur | HLS | `http://36.66.208.101:5000/hls/cctv_180/stream.m3u8` |
| 24 | `sby-atcs-187-satelite-indah-wedyamerti-pano` | ATCS Satelite Indah Wedyamerti Pano | HLS | `http://36.66.208.101:5000/hls/cctv_187/stream.m3u8` |
| 25 | `sby-atcs-132-tandes-tanjungsari-barat` | ATCS Tandes - Tanjungsari Barat | HLS | `http://36.66.208.101:5000/hls/cctv_132/stream.m3u8` |
| 26 | `sby-atcs-134-tandes-imigrasi-barat` | ATCS Tandes Imigrasi Barat | HLS | `http://36.66.208.101:5000/hls/cctv_134/stream.m3u8` |
| 27 | `sby-atcs-135-tandes-imigrasi-selatan` | ATCS Tandes Imigrasi Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_135/stream.m3u8` |
| 28 | `sby-atcs-194-uturn-margomulyo-utara` | ATCS Uturn Margomulyo Utara | HLS | `http://36.66.208.101:5000/hls/cctv_194/stream.m3u8` |
| 29 | `sby-atcs-267-ambengan-jaksa-agung-timur` | ATCS Ambengan Jaksa Agung Timur | HLS | `http://36.66.208.101:5000/hls/cctv_267/stream.m3u8` |
| 30 | `sby-atcs-266-ambengan-jaksa-agung-barat` | ATCS Ambengan Jaksa Agung Barat | HLS | `http://36.66.208.101:5000/hls/cctv_266/stream.m3u8` |
| 31 | `sby-atcs-265-ambengan-jaksa-agung-selatan` | ATCS Ambengan Jaksa Agung Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_265/stream.m3u8` |
| 32 | `sby-atcs-317-ambengan-kusuma-bangsa-selatan` | ATCS Ambengan Kusuma Bangsa Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_317/stream.m3u8` |
| 33 | `sby-atcs-316-ambengan-kusuma-bangsa-timur` | ATCS Ambengan Kusuma Bangsa Timur | HLS | `http://36.66.208.101:5000/hls/cctv_316/stream.m3u8` |
| 34 | `sby-atcs-319-ambengan-wijaya-kusuma-selatan` | ATCS Ambengan Wijaya Kusuma Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_319/stream.m3u8` |
| 35 | `sby-atcs-320-ambengan-wiaya-kusuma-timur` | ATCS Ambengan Wiaya Kusuma Timur | HLS | `http://36.66.208.101:5000/hls/cctv_320/stream.m3u8` |
| 36 | `sby-atcs-280-basrah-tegalsari-dome` | ATCS Basrah Tegalsari Dome | HLS | `http://36.66.208.101:5000/hls/cctv_280/stream.m3u8` |
| 37 | `sby-atcs-283-blauran-praban` | ATCS Blauran Praban | HLS | `http://36.66.208.101:5000/hls/cctv_283/stream.m3u8` |
| 38 | `sby-atcs-262-darmo-alfalah-selatan-dome` | ATCS Darmo Alfalah Selatan Dome | HLS | `http://36.66.208.101:5000/hls/cctv_262/stream.m3u8` |
| 39 | `sby-atcs-263-darmo-alfalah-utara` | ATCS Darmo Alfalah Utara | HLS | `http://36.66.208.101:5000/hls/cctv_263/stream.m3u8` |
| 40 | `sby-atcs-295-darmo-bengawan-selatan` | ATCS Darmo Bengawan Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_295/stream.m3u8` |
| 41 | `sby-atcs-276-darmo-pandegiling-barat` | ATCS Darmo Pandegiling Barat | HLS | `http://36.66.208.101:5000/hls/cctv_276/stream.m3u8` |
| 42 | `sby-atcs-275-darmo-pandegiling` | ATCS Darmo Pandegiling | HLS | `http://36.66.208.101:5000/hls/cctv_275/stream.m3u8` |
| 43 | `sby-atcs-271-darmo-polisi-istimewa-utara` | ATCS Darmo Polisi Istimewa Utara | HLS | `http://36.66.208.101:5000/hls/cctv_271/stream.m3u8` |
| 44 | `sby-atcs-327-embong-wungu-barat` | ATCS Embong Wungu Barat | HLS | `http://36.66.208.101:5000/hls/cctv_327/stream.m3u8` |
| 45 | `sby-atcs-326-embong-wungu-utara` | ATCS Embong Wungu Utara | HLS | `http://36.66.208.101:5000/hls/cctv_326/stream.m3u8` |
| 46 | `sby-atcs-286-gemblongan-siola-timur` | ATCS Gemblongan Siola Timur | HLS | `http://36.66.208.101:5000/hls/cctv_286/stream.m3u8` |
| 47 | `sby-atcs-292-gentengkali-undaan` | ATCS Gentengkali Undaan | HLS | `http://36.66.208.101:5000/hls/cctv_292/stream.m3u8` |
| 48 | `sby-atcs-260-grand-city` | ATCS Grand City | HLS | `http://36.66.208.101:5000/hls/cctv_260/stream.m3u8` |
| 49 | `sby-atcs-290-kayoon-sonokembang-barat` | ATCS Kayoon Sonokembang Barat | HLS | `http://36.66.208.101:5000/hls/cctv_290/stream.m3u8` |
| 50 | `sby-atcs-287-monumen-bambu-runcing-selatan` | ATCS Monumen Bambu Runcing Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_287/stream.m3u8` |
| 51 | `sby-atcs-322-pandegling-imam-bonjol-barat` | ATCS Pandegling Imam Bonjol Barat | HLS | `http://36.66.208.101:5000/hls/cctv_322/stream.m3u8` |
| 52 | `sby-atcs-278-panglima-sudirman-karapan-sapi` | ATCS Panglima Sudirman (karapan Sapi) | HLS | `http://36.66.208.101:5000/hls/cctv_278/stream.m3u8` |
| 53 | `sby-atcs-307-pctl-rs-darmo-selatan` | ATCS Pctl Rs Darmo Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_307/stream.m3u8` |
| 54 | `sby-atcs-308-pctl-rs-darmo-utara` | ATCS Pctl Rs Darmo Utara | HLS | `http://36.66.208.101:5000/hls/cctv_308/stream.m3u8` |
| 55 | `sby-atcs-337-pctl-taman-bungkul-hadap-selatan` | ATCS Pctl Taman Bungkul Hadap Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_337/stream.m3u8` |
| 56 | `sby-atcs-258-pemuda-air-mancur` | ATCS Pemuda Air Mancur | HLS | `http://36.66.208.101:5000/hls/cctv_258/stream.m3u8` |
| 57 | `sby-atcs-257-pemuda-air-mancur-timur` | ATCS Pemuda Air Mancur Timur | HLS | `http://36.66.208.101:5000/hls/cctv_257/stream.m3u8` |
| 58 | `sby-atcs-304-residen-sudirman` | ATCS Residen Sudirman | HLS | `http://36.66.208.101:5000/hls/cctv_304/stream.m3u8` |
| 59 | `sby-atcs-312-sogo-embong-malang-pano` | ATCS Sogo Embong Malang Pano | HLS | `http://36.66.208.101:5000/hls/cctv_312/stream.m3u8` |
| 60 | `sby-atcs-252-sulawesi-ngagel-bagong` | ATCS Sulawesi - Ngagel Bagong | HLS | `http://36.66.208.101:5000/hls/cctv_252/stream.m3u8` |
| 61 | `sby-atcs-256-tegalsari-pano` | ATCS Tegalsari Pano | HLS | `http://36.66.208.101:5000/hls/cctv_256/stream.m3u8` |
| 62 | `sby-atcs-274-urip-sumohargo-pandegiling` | ATCS Urip Sumohargo Pandegiling | HLS | `http://36.66.208.101:5000/hls/cctv_274/stream.m3u8` |
| 63 | `sby-atcs-299-walikota-mustajab-jakgung-suprapto` | ATCS Walikota Mustajab Jakgung Suprapto | HLS | `http://36.66.208.101:5000/hls/cctv_299/stream.m3u8` |
| 64 | `sby-atcs-033-a-yani-magorejo-selatan` | ATCS A Yani Magorejo Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_33/stream.m3u8` |
| 65 | `sby-atcs-034-a-yani-margorejo-utara` | ATCS A Yani Margorejo Utara | HLS | `http://36.66.208.101:5000/hls/cctv_34/stream.m3u8` |
| 66 | `sby-atcs-038-a-yani-mayangkara-dome` | ATCS A Yani Mayangkara Dome | HLS | `http://36.66.208.101:5000/hls/cctv_38/stream.m3u8` |
| 67 | `sby-atcs-024-ayani-taman-pelangi` | ATCS Ayani Taman Pelangi | HLS | `http://36.66.208.101:5000/hls/cctv_24/stream.m3u8` |
| 68 | `sby-atcs-005-bundaran-waru` | ATCS Bundaran Waru | HLS | `http://36.66.208.101:5000/hls/cctv_5/stream.m3u8` |
| 69 | `sby-atcs-085-darmokali-bengawan-selatan` | ATCS Darmokali Bengawan Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_85/stream.m3u8` |
| 70 | `sby-atcs-041-flyover-mayangkara-dome` | ATCS Flyover Mayangkara Dome | HLS | `http://36.66.208.101:5000/hls/cctv_41/stream.m3u8` |
| 71 | `sby-atcs-037-frontage-rsal` | ATCS Frontage Rsal | HLS | `http://36.66.208.101:5000/hls/cctv_37/stream.m3u8` |
| 72 | `sby-atcs-012-gayungsari-barat-sisi-utara` | ATCS Gayungsari Barat Sisi Utara | HLS | `http://36.66.208.101:5000/hls/cctv_12/stream.m3u8` |
| 73 | `sby-atcs-052-gn-sari-gajah-mada-barat` | ATCS Gn Sari Gajah Mada Barat | HLS | `http://36.66.208.101:5000/hls/cctv_52/stream.m3u8` |
| 74 | `sby-atcs-051-gn-sari-gajah-mada-dome` | ATCS Gn Sari Gajah Mada Dome | HLS | `http://36.66.208.101:5000/hls/cctv_51/stream.m3u8` |
| 75 | `sby-atcs-058-gn-sari-bumi-marinir-dome` | ATCS Gn Sari Bumi Marinir Dome | HLS | `http://36.66.208.101:5000/hls/cctv_58/stream.m3u8` |
| 76 | `sby-atcs-059-gunugsari-exit-tol-malang` | ATCS Gunugsari Exit Tol Malang | HLS | `http://36.66.208.101:5000/hls/cctv_59/stream.m3u8` |
| 77 | `sby-atcs-078-jagir-wonokromo-barat` | ATCS Jagir Wonokromo Barat | HLS | `http://36.66.208.101:5000/hls/cctv_78/stream.m3u8` |
| 78 | `sby-atcs-077-jagir-wonokromo` | ATCS Jagir Wonokromo | HLS | `http://36.66.208.101:5000/hls/cctv_77/stream.m3u8` |
| 79 | `sby-atcs-067-jemur-kutisari-barat` | ATCS Jemur Kutisari Barat | HLS | `http://36.66.208.101:5000/hls/cctv_67/stream.m3u8` |
| 80 | `sby-atcs-070-jemursari-tenggilis-utara` | ATCS Jemursari Tenggilis Utara | HLS | `http://36.66.208.101:5000/hls/cctv_70/stream.m3u8` |
| 81 | `sby-atcs-064-karangpilang-wonocolo-timur` | ATCS Karangpilang Wonocolo Timur | HLS | `http://36.66.208.101:5000/hls/cctv_64/stream.m3u8` |
| 82 | `sby-atcs-075-margorejo-prapen-dome` | ATCS Margorejo Prapen Dome | HLS | `http://36.66.208.101:5000/hls/cctv_75/stream.m3u8` |
| 83 | `sby-atcs-076-margorejo-prapen-utara` | ATCS Margorejo Prapen Utara | HLS | `http://36.66.208.101:5000/hls/cctv_76/stream.m3u8` |
| 84 | `sby-atcs-060-mastrip-wiyung` | ATCS Mastrip Wiyung | HLS | `http://36.66.208.101:5000/hls/cctv_60/stream.m3u8` |
| 85 | `sby-atcs-096-ngagel-jaya-utara-gereja-utara` | ATCS Ngagel Jaya Utara Gereja Utara | HLS | `http://36.66.208.101:5000/hls/cctv_96/stream.m3u8` |
| 86 | `sby-atcs-087-ngagel-ujung-galuh-utara` | ATCS Ngagel Ujung Galuh Utara | HLS | `http://36.66.208.101:5000/hls/cctv_87/stream.m3u8` |
| 87 | `sby-atcs-016-pegesangan` | ATCS Pegesangan | HLS | `http://36.66.208.101:5000/hls/cctv_16/stream.m3u8` |
| 88 | `sby-atcs-104-pertigaan-marmoyo` | ATCS Pertigaan Marmoyo | HLS | `http://36.66.208.101:5000/hls/cctv_104/stream.m3u8` |
| 89 | `sby-atcs-103-rungkut-alang-alang-timur` | ATCS Rungkut Alang - Alang Timur | HLS | `http://36.66.208.101:5000/hls/cctv_103/stream.m3u8` |
| 90 | `sby-atcs-039-wonokromo-mayangkrama-dome` | ATCS Wonokromo Mayangkrama Dome | HLS | `http://36.66.208.101:5000/hls/cctv_39/stream.m3u8` |
| 91 | `sby-atcs-441-arif-rahman-hakim-utara` | ATCS Arif Rahman Hakim Utara | HLS | `http://36.66.208.101:5000/hls/cctv_441/stream.m3u8` |
| 92 | `sby-atcs-440-arif-rahman-hakim` | ATCS Arif Rahman Hakim | HLS | `http://36.66.208.101:5000/hls/cctv_440/stream.m3u8` |
| 93 | `sby-atcs-439-arif-rahman-hakim-selatan` | ATCS Arif Rahman Hakim Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_439/stream.m3u8` |
| 94 | `sby-atcs-485-bundaran-its` | ATCS Bundaran Its | HLS | `http://36.66.208.101:5000/hls/cctv_485/stream.m3u8` |
| 95 | `sby-atcs-470-bundaran-menur-timur` | ATCS Bundaran Menur Timur | HLS | `http://36.66.208.101:5000/hls/cctv_470/stream.m3u8` |
| 96 | `sby-atcs-457-dharmawangsa-airlangga` | ATCS Dharmawangsa Airlangga | HLS | `http://36.66.208.101:5000/hls/cctv_457/stream.m3u8` |
| 97 | `sby-atcs-459-kertajaya-dharmawangsa-barat` | ATCS Kertajaya Dharmawangsa Barat | HLS | `http://36.66.208.101:5000/hls/cctv_459/stream.m3u8` |
| 98 | `sby-atcs-458-kertajaya-dharmawangsa-timur` | ATCS Kertajaya Dharmawangsa Timur | HLS | `http://36.66.208.101:5000/hls/cctv_458/stream.m3u8` |
| 99 | `sby-atcs-465-kertajaya-manyar-samsat-selatan` | ATCS Kertajaya Manyar Samsat Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_465/stream.m3u8` |
| 100 | `sby-atcs-464-kertajaya-mnyar-samsat-timur` | ATCS Kertajaya Mnyar Samsat Timur | HLS | `http://36.66.208.101:5000/hls/cctv_464/stream.m3u8` |
| 101 | `sby-atcs-475-klampis-jaya-utara` | ATCS Klampis Jaya Utara | HLS | `http://36.66.208.101:5000/hls/cctv_475/stream.m3u8` |
| 102 | `sby-atcs-432-merr-kalijudan-pano` | ATCS Merr Kalijudan Pano | HLS | `http://36.66.208.101:5000/hls/cctv_432/stream.m3u8` |
| 103 | `sby-atcs-447-merr-kadung-baruk-dome` | ATCS Merr Kadung Baruk Dome | HLS | `http://36.66.208.101:5000/hls/cctv_447/stream.m3u8` |
| 104 | `sby-atcs-431-merr-kenjeran-selatan` | ATCS Merr Kenjeran Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_431/stream.m3u8` |
| 105 | `sby-atcs-438-merr-koni-barat` | ATCS Merr Koni Barat | HLS | `http://36.66.208.101:5000/hls/cctv_438/stream.m3u8` |
| 106 | `sby-atcs-436-merr-koni-dome` | ATCS Merr Koni Dome | HLS | `http://36.66.208.101:5000/hls/cctv_436/stream.m3u8` |
| 107 | `sby-atcs-434-merr-mulyorejo-utara` | ATCS Merr Mulyorejo Utara | HLS | `http://36.66.208.101:5000/hls/cctv_434/stream.m3u8` |
| 108 | `sby-atcs-448-merr-stikom-barat` | ATCS Merr Stikom Barat | HLS | `http://36.66.208.101:5000/hls/cctv_448/stream.m3u8` |
| 109 | `sby-atcs-460-ngagel-jaya-utara-hadap-selatan` | ATCS Ngagel Jaya Utara Hadap Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_460/stream.m3u8` |
| 110 | `sby-atcs-473-nginden-panjang-jiwo-barat` | ATCS Nginden Panjang Jiwo Barat | HLS | `http://36.66.208.101:5000/hls/cctv_473/stream.m3u8` |
| 111 | `sby-atcs-471-nginden-bratang-timur` | ATCS Nginden Bratang Timur | HLS | `http://36.66.208.101:5000/hls/cctv_471/stream.m3u8` |
| 112 | `sby-atcs-449-pctl-merr-pandugo-timur` | ATCS Pctl Merr Pandugo Timur | HLS | `http://36.66.208.101:5000/hls/cctv_449/stream.m3u8` |
| 113 | `sby-atcs-487-pctl-merr-semampir-utara` | ATCS Pctl Merr Semampir Utara | HLS | `http://36.66.208.101:5000/hls/cctv_487/stream.m3u8` |
| 114 | `sby-atcs-479-rungkut-madya-utara` | ATCS Rungkut Madya Utara | HLS | `http://36.66.208.101:5000/hls/cctv_479/stream.m3u8` |
| 115 | `sby-atcs-462-smp-santa-clara-pano` | ATCS Smp Santa Clara Pano | HLS | `http://36.66.208.101:5000/hls/cctv_462/stream.m3u8` |
| 116 | `sby-atcs-502-u-turn-merr-konidepan-galaxy-mall-hadap-selatan` | ATCS U Turn Merr Konidepan Galaxy Mall Hadap Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_502/stream.m3u8` |
| 117 | `sby-atcs-357-bubutan-tembaan-timur` | ATCS Bubutan Tembaan Timur | HLS | `http://36.66.208.101:5000/hls/cctv_357/stream.m3u8` |
| 118 | `sby-atcs-362-demak-gresik-pano` | ATCS Demak Gresik Pano | HLS | `http://36.66.208.101:5000/hls/cctv_362/stream.m3u8` |
| 119 | `sby-atcs-363-dupak-pasar-turi` | ATCS Dupak Pasar Turi | HLS | `http://36.66.208.101:5000/hls/cctv_363/stream.m3u8` |
| 120 | `sby-atcs-359-gemblongan-peneleh` | ATCS Gemblongan Peneleh | HLS | `http://36.66.208.101:5000/hls/cctv_359/stream.m3u8` |
| 121 | `sby-atcs-361-indrapura-dprd-timur` | ATCS Indrapura Dprd Timur | HLS | `http://36.66.208.101:5000/hls/cctv_361/stream.m3u8` |
| 122 | `sby-atcs-354-indrapura-rajawali` | ATCS Indrapura Rajawali | HLS | `http://36.66.208.101:5000/hls/cctv_354/stream.m3u8` |
| 123 | `sby-atcs-349-jagalan-kalianyar-selatan` | ATCS Jagalan Kalianyar Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_349/stream.m3u8` |
| 124 | `sby-atcs-413-jembatan-suramadu-fix` | ATCS Jembatan Suramadu Fix | HLS | `http://36.66.208.101:5000/hls/cctv_413/stream.m3u8` |
| 125 | `sby-atcs-345-kembang-jepun-kapasan` | ATCS Kembang Jepun Kapasan | HLS | `http://36.66.208.101:5000/hls/cctv_345/stream.m3u8` |
| 126 | `sby-atcs-407-kenjeran-kd-cowek` | ATCS Kenjeran Kd Cowek | HLS | `http://36.66.208.101:5000/hls/cctv_407/stream.m3u8` |
| 127 | `sby-atcs-404-kenjeran-kd-cowek-selatan` | ATCS Kenjeran Kd Cowek Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_404/stream.m3u8` |
| 128 | `sby-atcs-405-kenjeran-kd-cowek-timur` | ATCS Kenjeran Kd Cowek Timur | HLS | `http://36.66.208.101:5000/hls/cctv_405/stream.m3u8` |
| 129 | `sby-atcs-406-kenjeran-kd-cowek-utara` | ATCS Kenjeran Kd Cowek Utara | HLS | `http://36.66.208.101:5000/hls/cctv_406/stream.m3u8` |
| 130 | `sby-atcs-416-kp-krampung-putro-agung-barat` | ATCS Kp Krampung Putro Agung Barat | HLS | `http://36.66.208.101:5000/hls/cctv_416/stream.m3u8` |
| 131 | `sby-atcs-396-kusuma-bangsangaglik-selatan` | ATCS Kusuma Bangsangaglik Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_396/stream.m3u8` |
| 132 | `sby-atcs-414-nambangan-ptz` | ATCS Nambangan Ptz | HLS | `http://36.66.208.101:5000/hls/cctv_414/stream.m3u8` |
| 133 | `sby-atcs-355-pahlawan-kebonrojo` | ATCS Pahlawan Kebonrojo | HLS | `http://36.66.208.101:5000/hls/cctv_355/stream.m3u8` |
| 134 | `sby-atcs-383-pegirian-hadap-barat` | ATCS Pegirian Hadap Barat | HLS | `http://36.66.208.101:5000/hls/cctv_383/stream.m3u8` |
| 135 | `sby-atcs-425-perak-kerembangan-utara` | ATCS Perak Kerembangan Utara | HLS | `http://36.66.208.101:5000/hls/cctv_425/stream.m3u8` |
| 136 | `sby-atcs-377-pintu-masuk-jembatan-suroboyo-selatan` | ATCS Pintu Masuk Jembatan Suroboyo Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_377/stream.m3u8` |
| 137 | `sby-atcs-390-romokalisari-gresik-fik` | ATCS Romokalisari Gresik Fik | HLS | `http://36.66.208.101:5000/hls/cctv_390/stream.m3u8` |
| 138 | `sby-atcs-422-sdn-pacar-keling-pano` | ATCS Sdn Pacar Keling Pano | HLS | `http://36.66.208.101:5000/hls/cctv_422/stream.m3u8` |
| 139 | `sby-atcs-393-tanjugnsari-dome` | ATCS Tanjugnsari Dome | HLS | `http://36.66.208.101:5000/hls/cctv_393/stream.m3u8` |
| 140 | `sby-atcs-386-terminal-tow` | ATCS Terminal Tow | HLS | `http://36.66.208.101:5000/hls/cctv_386/stream.m3u8` |
| 141 | `sby-atcs-385-terminal-tow-selatan` | ATCS Terminal Tow Selatan | HLS | `http://36.66.208.101:5000/hls/cctv_385/stream.m3u8` |

### Yogyakarta (133)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `jogja-atcs-rthp-rthp-bumen` | ATCS RTHP Bumen | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_bumen.stream/playlist.m3u8` |
| 2 | `jogja-atcs-atcs-atcs-simpang-basen` | ATCS Simpang Baven v. Utara | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Basen.stream/playlist.m3u8` |
| 3 | `jogja-atcs-atcs-atcs-simpang-tegalgendu` | ATCS simpang tegalgendu v. selatan | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Tegalgendu.stream/playlist.m3u8` |
| 4 | `jogja-atcs-rthp-rthp-gajahwong-edupark-3` | ATCS RTHP GAJAH WONG EDU PARK 3 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_3.stream/playlist.m3u8` |
| 5 | `jogja-atcs-atcs-atcs-simpang-gambiran-view-barat` | ATCS SIMPANG GAMBIRAN VIEW BARAT | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Gambiran_View_Barat.stream/playlist.m3u8` |
| 6 | `jogja-atcs-atcs-atcs-simpang-gambiran-view-timur` | ATCS SIMPANG GAMBIRAN VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Gambiran_View_Timur.stream/playlist.m3u8` |
| 7 | `jogja-atcs-rthp-rthp-gajahwong-edupark-2` | ATCS RTHP GAJAH WONG EDU PARK 2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_2.stream/playlist.m3u8` |
| 8 | `jogja-atcs-rthp-rthp-gajahwong-edupark-1` | ATCS RTHP GAJAH WONG EDU PARK 1 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_1.stream/playlist.m3u8` |
| 9 | `jogja-atcs-atcs-atcs-lampu-merah-gambiran2` | ATCS SIMPANG GAMBIRAN 2 - JL.VETERAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Gambiran2.stream/playlist.m3u8` |
| 10 | `jogja-atcs-atcs-atcs-lampu-merah-gambiran1` | ATCS SIMPANG GAMBIRAN 1 - JL.VETERAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Gambiran1.stream/playlist.m3u8` |
| 11 | `jogja-atcs-atcs-atcs-simpang-rejowinangun-view-timur` | ATCS SIMPANG REJOWINANGUN VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Rejowinangun_View_Timur.stream/playlist.m3u8` |
| 12 | `jogja-atcs-atcs-atcs-simpang-wirosaban-view-selatan` | ATCS SIMPANG WIROSABAN VIEW SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Selatan.stream/playlist.m3u8` |
| 13 | `jogja-atcs-atcs-atcs-simpang-wirosaban-view-timur` | ATCS SIMPANG WIROSABAN VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Timur.stream/playlist.m3u8` |
| 14 | `jogja-atcs-atcs-atcs-simpang-wirosaban-view-barat` | ATCS SIMPANG WIROSABAN VIEW BARAT | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Barat.stream/playlist.m3u8` |
| 15 | `jogja-atcs-atcs-atcs-simpang-wirosaban-view-utara` | ATCS SIMPANG WIROSABAN VIEW UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Utara.stream/playlist.m3u8` |
| 16 | `jogja-atcs-atcs-atcs-lampu-merah-jlmentrisupeno2` | ATCS SIMPANG APPI 2 - JL.MENTRI SUPENO | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JlMentriSupeno2.stream/playlist.m3u8` |
| 17 | `jogja-atcs-atcs-atcs-lampu-merah-jlmentrisupeno` | ATCS SIMPANG APPI - JL.MENTRI SUPENO | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JlMentriSupeno.stream/playlist.m3u8` |
| 18 | `jogja-atcs-atcs-atcs-simpang-pasar-telo-view-selatan` | ATCS SIMPANG PASAR TELO VIEW SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Pasar_Telo_View_Selatan.stream/playlist.m3u8` |
| 19 | `jogja-atcs-atcs-atcs-simpang-pasar-telo-view-utara` | ATCS SIMPANG PASAR TELO VIEW UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Pasar_Telo_View_Utara.stream/playlist.m3u8` |
| 20 | `jogja-atcs-atcs-atcs-pasar-telo-ptz` | ATCS SIMPANG PASAR TELO (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Pasar_Telo_PTZ.stream/playlist.m3u8` |
| 21 | `jogja-atcs-rthp-rthp-brontokusuman-blkgkel-2` | ATCS RTHP BRONTOKUSUMAN (BLKG KEL) 2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_brontokusuman_blkgKel_2.stream/playlist.m3u8` |
| 22 | `jogja-atcs-atcs-atcs-jogokaryan` | ATCS SIMPANG JOGOKARIYAN V. SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_jogokaryan.stream/playlist.m3u8` |
| 23 | `jogja-atcs-atcs-atcs-tungkak` | ATCS SIMPANG TUNGKAK (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_tungkak.stream/playlist.m3u8` |
| 24 | `jogja-atcs-atcs-atcs-lampu-merah-sopmerah2` | ATCS SIMPANG KARANG TUNGGAL (S3 JL. KOL.SUGIYONO - JL. SISINGAMANGARAJA) 2 | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SopMerah2.stream/playlist.m3u8` |
| 25 | `jogja-atcs-atcs-atcs-joktengwetan` | ATCS SIMPANG JOKTENG WETAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_joktengwetan.stream/playlist.m3u8` |
| 26 | `jogja-atcs-kecamatan-kemmj-pendopokemantren` | ATCS KEMMJ-PENDOPO KEMANTREN | HLS | `https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-PendopoKemantren.stream/playlist.m3u8` |
| 27 | `jogja-atcs-kecamatan-kemmj-jalanselatankemantren` | ATCS KEMMJ-JALAN SELATAN KEMANTREN | HLS | `https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-JalanSelatanKemantren.stream/playlist.m3u8` |
| 28 | `jogja-atcs-kecamatan-kemmj-timurkemantren` | ATCS KEMMJ-TIMUR KEMANTREN | HLS | `https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-TimurKemantren.stream/playlist.m3u8` |
| 29 | `jogja-atcs-atcs-atcs-lampu-merah-pasargading1` | ATCS SIMPANG PASAR GADING 1 (TIMUR) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_PasarGading1.stream/playlist.m3u8` |
| 30 | `jogja-atcs-atcs-atcs-lampu-merah-pasargading2` | ATCS SIMPANG PASAR GADING 2 (BARAT) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_PasarGading2.stream/playlist.m3u8` |
| 31 | `jogja-atcs-atcs-atcs-joktengkulon` | ATCS SIMPANG JOKTENG KULON (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_joktengkulon.stream/playlist.m3u8` |
| 32 | `jogja-atcs-atcs-atcs-lampu-merah-sugengjeroni1` | ATCS SIMPANG SUGENG JERONI 1 - JL.SUGENG JERONI | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SugengJeroni1.stream/playlist.m3u8` |
| 33 | `jogja-atcs-atcs-atcs-lampu-merah-sugengjeroni2` | ATCS SIMPANG SUGENG JERONI 2 - JL.SUGENG JERONI | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SugengJeroni2.stream/playlist.m3u8` |
| 34 | `jogja-atcs-atcs-atcs-simpang-patangpuluhan` | ATCS SIMPANG PATANGPULUHAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Patangpuluhan.stream/playlist.m3u8` |
| 35 | `jogja-atcs-atcs-atcs-tamansari` | ATCS SIMPANG TAMAN SARI (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_tamansari.stream/playlist.m3u8` |
| 36 | `jogja-atcs-atcs-atcs-mantrigawen-ptz` | ATCS SIMPANG MANTRIGAWEN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Mantrigawen_PTZ.stream/playlist.m3u8` |
| 37 | `jogja-atcs-atcs-atcs-gedongkuning` | ATCS SIMPANG GEDONGKUNING (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Gedongkuning.stream/playlist.m3u8` |
| 38 | `jogja-atcs-atcs-atcs-simpangsgm` | ATCS SIMPANG SGM (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_simpangsgm.stream/playlist.m3u8` |
| 39 | `jogja-atcs-atcs-atcs-ust` | ATCS SIMPANG UST (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_UST.stream/playlist.m3u8` |
| 40 | `jogja-atcs-atcs-atcs-glagahsari` | ATCS SIMPANG GLAGAHSARI | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Glagahsari.stream/playlist.m3u8` |
| 41 | `jogja-atcs-atcs-atcs-glagahsari-ptz` | ATCS SIMPANG GLAGAHSARI (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Glagahsari_PTZ.stream/playlist.m3u8` |
| 42 | `jogja-atcs-balaikota-balaikota-gerbang-timur-pkk-view-selatan-luar` | ATCS GERBANG TIMUR PKK V. SELATAN (LUAR) | HLS | `https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Timur_PKK_View_Selatan-Luar.stream/playlist.m3u8` |
| 43 | `jogja-atcs-balaikota-balaikota-gerbang-timur-pkk-view-utara-luar` | ATCS GERBANG TIMUR PKK V. UTARA (LUAR) | HLS | `https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Timur_PKK_View_Utara-Luar.stream/playlist.m3u8` |
| 44 | `jogja-atcs-atcs-atcs-simpang-balaikota-ptz` | ATCS SIMPANG BALAIKOTA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_PTZ.stream/playlist.m3u8` |
| 45 | `jogja-atcs-atcs-atcs-simpang-balaikota-view-timur` | ATCS SIMPANG BALAIKOTA VIEW UTARA-BARAT | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_View_Timur.stream/playlist.m3u8` |
| 46 | `jogja-atcs-atcs-atcs-simpang-balaikota-view-utara` | ATCS SIMPANG BALAIKOTA VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_View_Utara.stream/playlist.m3u8` |
| 47 | `jogja-atcs-balaikota-balaikota-gerbang-masuk-utara-view-timur-luar` | ATCS GERBANG MASUK UTARA V. TIMUR (LUAR) | HLS | `https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Masuk_Utara_View_Timur-Luar.stream/playlist.m3u8` |
| 48 | `jogja-atcs-atcs-atcs-simpang-mandala-krida-ptz` | ATCS SIMPANG MANDALA KRIDA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Mandala_Krida_PTZ.stream/playlist.m3u8` |
| 49 | `jogja-atcs-atcs-atcs-simpang-amongrogo-view-timur` | ATCS SIMPANG AMONGROGO VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Amongrogo_View_Timur.stream/playlist.m3u8` |
| 50 | `jogja-atcs-atcs-atcs-sentul` | ATCS SIMPANG SENTUL (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_sentul.stream/playlist.m3u8` |
| 51 | `jogja-atcs-atcs-atcs-permata` | ATCS SIMPANG PERMATA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_permata.stream/playlist.m3u8` |
| 52 | `jogja-atcs-atcs-atcs-s4-bausasran` | ATCS SIMPANG BAUSASRAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_S4_Bausasran.stream/playlist.m3u8` |
| 53 | `jogja-atcs-atcs-atcs-ibu-ruswo` | ATCS SIMPANG IBU RUSWO (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Ibu_Ruswo.stream/playlist.m3u8` |
| 54 | `jogja-atcs-atcs-atcs-gondomanan` | ATCS SIMPANG GONDOMANAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_gondomanan.stream/playlist.m3u8` |
| 55 | `jogja-atcs-atcs-atcs-simpang-gondomanan-view-selatan` | ATCS SIMPANG GONDOMANAN VIEW SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Gondomanan_View_Selatan.stream/playlist.m3u8` |
| 56 | `jogja-atcs-malioboro-nolkm-timur` | ATCS NOL KM. - TIMUR | HLS | `https://cctvjss.jogjakota.go.id/malioboro/NolKm_Timur.stream/playlist.m3u8` |
| 57 | `jogja-atcs-malioboro-nolkm-utara` | ATCS NOL KM. - UTARA | HLS | `https://cctvjss.jogjakota.go.id/malioboro/NolKm_Utara.stream/playlist.m3u8` |
| 58 | `jogja-atcs-malioboro-nolkm-gdagung` | ATCS NOL KM. - GD. AGUNG | HLS | `https://cctvjss.jogjakota.go.id/malioboro/NolKm_GdAgung.stream/playlist.m3u8` |
| 59 | `jogja-atcs-atcs-atcs-kmnol` | ATCS SIMPANG KM NOL (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_kmnol.stream/playlist.m3u8` |
| 60 | `jogja-atcs-atcs-atcs-pkumuh` | ATCS SIMPANG PKU MUH. (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_pkumuh.stream/playlist.m3u8` |
| 61 | `jogja-atcs-atcs-atcs-serangan` | ATCS SIMPANG SERANGAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_serangan.stream/playlist.m3u8` |
| 62 | `jogja-atcs-rthp-rthp-jopraban-2` | ATCS RTHP JOPRABAN 2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_2.stream/playlist.m3u8` |
| 63 | `jogja-atcs-rthp-rthp-jopraban-3` | ATCS RTHP JOPRABAN 3 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_3.stream/playlist.m3u8` |
| 64 | `jogja-atcs-rthp-rthp-jopraban-1` | ATCS RTHP JOPRABAN 1 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_1.stream/playlist.m3u8` |
| 65 | `jogja-atcs-atcs-atcs-wirobrajan` | ATCS SIMPANG WIROBRAJAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_wirobrajan.stream/playlist.m3u8` |
| 66 | `jogja-atcs-atcs-atcs-simpang-letjen-suprapto-ks-tubun-view-selatan` | ATCS SIMPANG LETJEN SUPRAPTO-KS. TUBUN V. SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Letjen_Suprapto_KS_Tubun_View_Selatan.stream/playlist.m3u8` |
| 67 | `jogja-atcs-atcs-atcs-simpang-letjen-suprapto-ks-tubun-view-utara` | ATCS SIMPANG LETJEN SUPRAPTO-KS. TUBUN V. UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Letjen_Suprapto_KS_Tubun_View_Utara.stream/playlist.m3u8` |
| 68 | `jogja-atcs-malioboro-malioboro-24-simpang-reksobayan` | ATCS MALIOBORO SIMPANG REKSOBAYAN | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_24_Simpang_Reksobayan.stream/playlist.m3u8` |
| 69 | `jogja-atcs-malioboro-malioboro-30-pasar-beringharjo` | ATCS MALIOBORO PASAR BERINGHARJO | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_30_Pasar_Beringharjo.stream/playlist.m3u8` |
| 70 | `jogja-atcs-malioboro-malioboro-12-ramayana` | ATCS MALIOBORO RAMAYANA | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_12_Ramayana.stream/playlist.m3u8` |
| 71 | `jogja-atcs-atcs-atcs-simpang-melia-purosani` | ATCS SIMPANG MELIA PUROSANI (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Melia_Purosani.stream/playlist.m3u8` |
| 72 | `jogja-atcs-malioboro-malioboro-11-terang-bulan` | ATCS MALIOBORO TERANG BULAN | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_11_Terang_Bulan.stream/playlist.m3u8` |
| 73 | `jogja-atcs-malioboro-malioboro-7-mall-selatan` | ATCS MALIOBORO MALL SELATAN | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_7_Mall_Selatan.stream/playlist.m3u8` |
| 74 | `jogja-atcs-malioboro-malioboro-9-mutiara-baru` | ATCS MALIOBORO MUTIARA BARU | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_9_Mutiara_Baru.stream/playlist.m3u8` |
| 75 | `jogja-atcs-malioboro-malioboro-3-depan-dispar` | ATCS MALIOBORO DEPAN DISPAR | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_3_Depan_Dispar.stream/playlist.m3u8` |
| 76 | `jogja-atcs-malioboro-malioboro-8-mutiara-lama` | ATCS MALIOBORO MUTIARA LAMA | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_8_Mutiara_Lama.stream/playlist.m3u8` |
| 77 | `jogja-atcs-rthp-rthp-segoro-amarto-tegalrejo-2` | ATCS RTHP SEGORO AMARTO TEGALREJO 2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_segoro_amarto_tegalrejo_2.stream/playlist.m3u8` |
| 78 | `jogja-atcs-atcs-atcs-bpk` | ATCS SIMPANG BPK (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_bpk.stream/playlist.m3u8` |
| 79 | `jogja-atcs-bpbd-bpbd-kaliwinongo` | ATCS SUNGAI WINONGO | HLS | `https://cctvjss.jogjakota.go.id/bpbd/BPBD_kaliwinongo.stream/playlist.m3u8` |
| 80 | `jogja-atcs-atcs-atcs-jlagran` | ATCS SIMPANG JLAGRAN (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_jlagran.stream/playlist.m3u8` |
| 81 | `jogja-atcs-malioboro-malioboro-6-mall-utara` | ATCS MALIOBORO MALL UTARA | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_6_Mall_Utara.stream/playlist.m3u8` |
| 82 | `jogja-atcs-malioboro-malioboro-5-perwakilan` | ATCS MALIOBORO PERWAKILAN | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_5_Perwakilan.stream/playlist.m3u8` |
| 83 | `jogja-atcs-malioboro-malioboro-25-utara-mall` | ATCS MALIOBORO UTARA MALL | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_25_Utara_Mall.stream/playlist.m3u8` |
| 84 | `jogja-atcs-malioboro-malioboro-4-depan-dprd` | ATCS MALIOBORO DEPAN DPRD | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_4_Depan_DPRD.stream/playlist.m3u8` |
| 85 | `jogja-atcs-malioboro-malioboro-2-depan-toko-subur` | ATCS MALIOBORO DEPAN TOKO SUBUR | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_2_Depan_Toko_Subur.stream/playlist.m3u8` |
| 86 | `jogja-atcs-malioboro-malioboro-21-utara-inna-malioboro` | ATCS MALIOBORO UTARA INNA MALIOBORO | HLS | `https://cctvjss.jogjakota.go.id/malioboro/Malioboro_21_Utara_Inna_Malioboro.stream/playlist.m3u8` |
| 87 | `jogja-atcs-kotabaru-anpr-jl-ahmad-jazuli` | ATCS JL. AHMAD JAZULI (APOTEK K24) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Ahmad-Jazuli.stream/playlist.m3u8` |
| 88 | `jogja-atcs-kotabaru-jl-nyoman-oka` | ATCS JL. NYOMAN OKA (GEREJA KOTABARU) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/Jl-Nyoman-Oka.stream/playlist.m3u8` |
| 89 | `jogja-atcs-margo-utomo-optic-tugu` | ATCS OPTIC TUGU | HLS | `https://cctvjss.jogjakota.go.id/margo-utomo/Optic-Tugu.stream/playlist.m3u8` |
| 90 | `jogja-atcs-margo-utomo-selatan-olive` | ATCS SELATAN OLIVE | HLS | `https://cctvjss.jogjakota.go.id/margo-utomo/Selatan-Olive.stream/playlist.m3u8` |
| 91 | `jogja-atcs-margo-utomo-wijaya-baru-travel` | ATCS WIJAYA BARU TRAVEL | HLS | `https://cctvjss.jogjakota.go.id/margo-utomo/Wijaya-Baru-Travel.stream/playlist.m3u8` |
| 92 | `jogja-atcs-margo-utomo-gowongan-lor` | ATCS UTARA JL. GOWONGAN LOR | HLS | `https://cctvjss.jogjakota.go.id/margo-utomo/Gowongan-Lor.stream/playlist.m3u8` |
| 93 | `jogja-atcs-kotabaru-anpr-jl-fm-noto-gardu-aniem` | ATCS JL. F.M. NOTO (GARDU ANIEM) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-FM-Noto-Gardu-Aniem.stream/playlist.m3u8` |
| 94 | `jogja-atcs-kotabaru-anpr-jl-yos-sudarso` | ATCS JL. YOS SUDARSO (MIE GACOAN) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Yos-Sudarso.stream/playlist.m3u8` |
| 95 | `jogja-atcs-atcs-atcs-simpang-atmosukarto` | ATCS SIMPANG ATMOSUKARTO (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Atmosukarto.stream/playlist.m3u8` |
| 96 | `jogja-atcs-atcs-atcs-ukdw` | ATCS SIMPANG UKDW (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_ukdw.stream/playlist.m3u8` |
| 97 | `jogja-atcs-kotabaru-anpr-jl-wardhani` | ATCS JL. WARDHANI (SELATAN-TIMUR SMPN 5) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Wardhani.stream/playlist.m3u8` |
| 98 | `jogja-atcs-kotabaru-jl-juadi` | ATCS JL. JUADI (POJOK UTARA-BARAT TELKOM) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/Jl-Juadi.stream/playlist.m3u8` |
| 99 | `jogja-atcs-kotabaru-jl-sajiono` | ATCS JL. SAJIONO (ROEMI) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/Jl-Sajiono.stream/playlist.m3u8` |
| 100 | `jogja-atcs-kotabaru-anpr-jl-fm-noto-raminten` | ATCS JL. F.M. NOTO (RAMINTEN) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-FM-Noto-Raminten.stream/playlist.m3u8` |
| 101 | `jogja-atcs-atcs-atcs-apmd` | ATCS SIMPANG APMD (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8` |
| 102 | `jogja-atcs-bpbd-bpbd-gajahwong2` | ATCS SUNGAI GAJAH WONG 2 | HLS | `https://cctvjss.jogjakota.go.id/bpbd/BPBD_gajahwong2.stream/playlist.m3u8` |
| 103 | `jogja-atcs-atcs-atcs-simpang-debritto-view-utara` | ATCS SIMPANG DEBRITTO VIEW UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_DeBritto_View_Utara.stream/playlist.m3u8` |
| 104 | `jogja-atcs-atcs-atcs-simpang-demangan-view-selatan` | ATCS SIMPANG DEMANGAN VIEW SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Selatan.stream/playlist.m3u8` |
| 105 | `jogja-atcs-atcs-atcs-simpang-demangan-view-timur` | ATCS SIMPANG DEMANGAN VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Timur.stream/playlist.m3u8` |
| 106 | `jogja-atcs-atcs-atcs-simpang-demangan-view-utara` | ATCS SIMPANG DEMANGAN VIEW UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Utara.stream/playlist.m3u8` |
| 107 | `jogja-atcs-atcs-atcs-pasar-demangan-view-selatan` | ATCS PASAR DEMANGAN VIEW SELATAN | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Pasar_Demangan_View_Selatan.stream/playlist.m3u8` |
| 108 | `jogja-atcs-rthp-rthp-klitren-2` | ATCS RTHP KLITREN 2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_klitren_2.stream/playlist.m3u8` |
| 109 | `jogja-atcs-atcs-atcs-utara-timur-gardena-jl-urip-sumoharjo-v-timur` | ATCS UTARA-TIMUR GARDENA (JL. URIP SUMOHARJO) V. TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Utara-Timur_Gardena_Jl_Urip%20Sumoharjo_V_Timur.stream/playlist.m3u8` |
| 110 | `jogja-atcs-atcs-atcs-simpang-galeria-timurselatan` | ATCS SIMPANG GALERIA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Galeria_TimurSelatan.stream/playlist.m3u8` |
| 111 | `jogja-atcs-atcs-atcs-gramedia-2` | ATCS SIMPANG GRAMEDIA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Gramedia_2.stream/playlist.m3u8` |
| 112 | `jogja-atcs-kotabaru-anpr-simpang-gramedia-v-timur-ex-jl-prau` | ATCS SIMPANG GRAMEDIA V. TIMUR | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Simpang-Gramedia-V-Timur_Ex-Jl-Prau.stream/playlist.m3u8` |
| 113 | `jogja-atcs-atcs-atcs-gramedia` | ATCS SIMPANG GRAMEDIA V. UTARA-TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_gramedia.stream/playlist.m3u8` |
| 114 | `jogja-atcs-atcs-atcs-simpang-terban-view-barat` | ATCS SIMPANG TERBAN VIEW BARAT | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Terban_View_Barat.stream/playlist.m3u8` |
| 115 | `jogja-atcs-atcs-atcs-simpang-terban-view-utara` | ATCS SIMPANG TERBAN VIEW UTARA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Terban_View_Utara.stream/playlist.m3u8` |
| 116 | `jogja-atcs-atcs-atcs-simpang-terban-view-timur` | ATCS SIMPANG TERBAN VIEW TIMUR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Terban_View_Timur.stream/playlist.m3u8` |
| 117 | `jogja-atcs-kotabaru-anpr-jl-fm-noto-mcdonalds` | ATCS JL. F.M. NOTO (MCDONALDS) | HLS | `https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-FM-Noto-McDonalds.stream/playlist.m3u8` |
| 118 | `jogja-atcs-margo-utomo-toko-cat-wahyu` | ATCS SELATAN TUGU | HLS | `https://cctvjss.jogjakota.go.id/margo-utomo/Toko-Cat-Wahyu.stream/playlist.m3u8` |
| 119 | `jogja-atcs-atcs-atcs-simpang-tugu` | ATCS SIMPANG TUGU (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Tugu.stream/playlist.m3u8` |
| 120 | `jogja-atcs-atcs-atcs-lampu-merah-pingit3` | ATCS SIMPANG PINGIT 3 - JL. TENTARA PELAJAR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit3.stream/playlist.m3u8` |
| 121 | `jogja-atcs-atcs-atcs-lampu-merah-pingit2` | ATCS SIMPANG PINGIT 2 - JL. TENTARA PELAJAR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit2.stream/playlist.m3u8` |
| 122 | `jogja-atcs-atcs-atcs-lampu-merah-pingit4` | ATCS SIMPANG PINGIT 4 - JL. TENTARA PELAJAR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit4.stream/playlist.m3u8` |
| 123 | `jogja-atcs-atcs-atcs-lampu-merah-pingit1` | ATCS SIMPANG PINGIT 1 - JL.TENTARA PELAJAR | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit1.stream/playlist.m3u8` |
| 124 | `jogja-atcs-atcs-atcs-lampu-merah-pingit5` | ATCS SIMPANG PINGIT 5 (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit5.stream/playlist.m3u8` |
| 125 | `jogja-atcs-atcs-atcs-lampu-merah-kyaimojo2` | ATCS SIMPANG KIAI MOJO 2 (TIMUR) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_KyaiMojo2.stream/playlist.m3u8` |
| 126 | `jogja-atcs-atcs-atcs-lampu-merah-kyaimojo` | ATCS SIMPANG KIAI MOJO 1 (BARAT) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_KyaiMojo.stream/playlist.m3u8` |
| 127 | `jogja-atcs-atcs-atcs-simpang-jatikencana` | ATCS SIMPANG JATI KENCANA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_JatiKencana.stream/playlist.m3u8` |
| 128 | `jogja-atcs-atcs-atcs-simpang-jatikencana-fix` | ATCS SIMPANG JATI KENCANA V. BARAT | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_JatiKencana_Fix.stream/playlist.m3u8` |
| 129 | `jogja-atcs-atcs-atcs-mirota` | ATCS SIMPANG MIROTA (PTZ) | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_mirota.stream/playlist.m3u8` |
| 130 | `jogja-atcs-atcs-atcs-simpang-borobudur-plaza` | ATCS SIMPANG BOROBUDUR PLAZA | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Borobudur_Plaza.stream/playlist.m3u8` |
| 131 | `jogja-atcs-bpbd-bpbd-ngentak` | ATCS SUNGAI NGENTAK | HLS | `https://cctvjss.jogjakota.go.id/bpbd/BPBD_ngentak.stream/playlist.m3u8` |
| 132 | `jogja-atcs-atcs-lampu-merah-joktengwetan` | ATCS ATCS_Lampu_Merah_JoktengWetan | HLS | `https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JoktengWetan.stream/playlist.m3u8` |
| 133 | `jogja-atcs-rthp-pakudaya-pakuncen-2` | ATCS rthp_pakudaya_pakuncen_2 | HLS | `https://cctvjss.jogjakota.go.id/rthp/rthp_pakudaya_pakuncen_2.stream/playlist.m3u8` |

### Denpasar (96)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `denpasar-unofficial-gunung-agung` | ATCS Gunung Agung | HLS | `https://atcs.denpasarkota.go.id/stream/A001GUNUNGAGUNGPTZ/index.m3u8` |
| 2 | `denpasar-atcs-a003-gunung-salak` | ATCS Gunung Salak | HLS | `https://atcs.denpasarkota.go.id/stream/A003GUNUNGSALAKPTZ/stream.m3u8` |
| 3 | `denpasar-atcs-a004-teuku-umar` | ATCS Teuku Umar | HLS | `https://atcs.denpasarkota.go.id/stream/A004TEUKUUMARPTZ1/stream.m3u8` |
| 4 | `denpasar-atcs-a006-soputan` | ATCS Soputan | HLS | `https://atcs.denpasarkota.go.id/stream/A006SOPUTANPTZ/stream.m3u8` |
| 5 | `denpasar-atcs-a008-mahendradatta` | ATCS Mahendradatta | HLS | `https://atcs.denpasarkota.go.id/stream/A008MAHENDRADATTAPTZ/stream.m3u8` |
| 6 | `denpasar-atcs-a009-perumnas` | ATCS Perumnas | HLS | `https://atcs.denpasarkota.go.id/stream/A009PERUMNASPTZ/stream.m3u8` |
| 7 | `denpasar-atcs-a012-pulau-saelus` | ATCS Pulau Saelus | HLS | `https://atcs.denpasarkota.go.id/stream/A012PULAUSAELUSPTZ/stream.m3u8` |
| 8 | `denpasar-atcs-a013-sidakarya` | ATCS Sidakarya | HLS | `https://atcs.denpasarkota.go.id/stream/A013SIDAKARYAPTZ/stream.m3u8` |
| 9 | `denpasar-atcs-a016-yos-sudarso` | ATCS Yos Sudarso | HLS | `https://atcs.denpasarkota.go.id/stream/A016YOSSUDARSOPTZ/stream.m3u8` |
| 10 | `denpasar-atcs-a017-puputan` | ATCS Puputan | HLS | `https://atcs.denpasarkota.go.id/stream/A017PUPUTANPTZ/stream.m3u8` |
| 11 | `denpasar-atcs-a018-dewi-sartika` | ATCS Dewi Sartika | HLS | `https://atcs.denpasarkota.go.id/stream/A018DEWISARTIKAPTZ/stream.m3u8` |
| 12 | `denpasar-atcs-a020-waturenggong` | ATCS Waturenggong | HLS | `https://atcs.denpasarkota.go.id/stream/A020WATURENGGONGPTZ/stream.m3u8` |
| 13 | `denpasar-atcs-a022-ubung` | ATCS Ubung | HLS | `https://atcs.denpasarkota.go.id/stream/A022UBUNGPTZ1/stream.m3u8` |
| 14 | `denpasar-atcs-a028-pulau-galang` | ATCS Pulau Galang | HLS | `https://atcs.denpasarkota.go.id/stream/A028PULAUGALANGPTZ/stream.m3u8` |
| 15 | `denpasar-atcs-a029-tangkuban-perahu` | ATCS Tangkuban Perahu | HLS | `https://atcs.denpasarkota.go.id/stream/A029TANGKUBANPERAHUPTZ/stream.m3u8` |
| 16 | `denpasar-atcs-a032-ahmad-yani` | ATCS Ahmad Yani | HLS | `https://atcs.denpasarkota.go.id/stream/A032AHMADYANIPTZ/stream.m3u8` |
| 17 | `denpasar-atcs-a033-nangka` | ATCS Nangka | HLS | `https://atcs.denpasarkota.go.id/stream/A033NANGKAPTZ1/stream.m3u8` |
| 18 | `denpasar-atcs-a034-kenyeri` | ATCS Kenyeri | HLS | `https://atcs.denpasarkota.go.id/stream/A034KENYERIPTZ/stream.m3u8` |
| 19 | `denpasar-atcs-a038-tohpati` | ATCS Tohpati | HLS | `https://atcs.denpasarkota.go.id/stream/A038TOHPATIPTZ/stream.m3u8` |
| 20 | `denpasar-atcs-a039-kebo-iwa` | ATCS Kebo Iwa | HLS | `https://atcs.denpasarkota.go.id/stream/A039KEBOIWAPTZ/stream.m3u8` |
| 21 | `denpasar-atcs-a042-sedap-malam` | ATCS Sedap Malam | HLS | `https://atcs.denpasarkota.go.id/stream/A042SEDAPMALAMPTZ/stream.m3u8` |
| 22 | `denpasar-atcs-a043-gunung-galunggung` | ATCS Gunung Galunggung | HLS | `https://atcs.denpasarkota.go.id/stream/A043GUNUNGGALUNGGUNGPTZ/stream.m3u8` |
| 23 | `denpasar-atcs-a002-kapten-sujana` | ATCS Kapten Sujana | HLS | `https://atcs.denpasarkota.go.id/stream/A002KAPTENSUJANAPTZ/stream.m3u8` |
| 24 | `denpasar-atcs-a005-batanta` | ATCS Batanta | HLS | `https://atcs.denpasarkota.go.id/stream/A005BATANTAPTZ/stream.m3u8` |
| 25 | `denpasar-atcs-a007-balun` | ATCS Balun | HLS | `https://atcs.denpasarkota.go.id/stream/A007BALUNPTZ/stream.m3u8` |
| 26 | `denpasar-atcs-a010-permata-hijau` | ATCS Permata Hijau | HLS | `https://atcs.denpasarkota.go.id/stream/A010PERMATAHIJAUPTZ/stream.m3u8` |
| 27 | `denpasar-atcs-a011-merpati` | ATCS Merpati | HLS | `https://atcs.denpasarkota.go.id/stream/A011MERPATIPTZ/stream.m3u8` |
| 28 | `denpasar-atcs-a014-kapten-japa` | ATCS Kapten Japa | HLS | `https://atcs.denpasarkota.go.id/stream/A014KAPTENJAPAPTZ/stream.m3u8` |
| 29 | `denpasar-atcs-a015-melati` | ATCS Melati | HLS | `https://atcs.denpasarkota.go.id/stream/A015MELATIPTZ/stream.m3u8` |
| 30 | `denpasar-atcs-a019-feunud` | ATCS Feunud | HLS | `https://atcs.denpasarkota.go.id/stream/A019FEUNUDPTZ/stream.m3u8` |
| 31 | `denpasar-atcs-a024-arjuna` | ATCS Arjuna | HLS | `https://atcs.denpasarkota.go.id/stream/A024ARJUNAPTZ/stream.m3u8` |
| 32 | `denpasar-atcs-a030-cargo` | ATCS Cargo | HLS | `https://atcs.denpasarkota.go.id/stream/A030CARGOPTZ/stream.m3u8` |
| 33 | `denpasar-atcs-a031-pidada` | ATCS Pidada | HLS | `https://atcs.denpasarkota.go.id/stream/A031PIDADAPTZ/stream.m3u8` |
| 34 | `denpasar-atcs-a035-noja` | ATCS Noja | HLS | `https://atcs.denpasarkota.go.id/stream/A035NOJAPTZ/stream.m3u8` |
| 35 | `denpasar-atcs-a036-trenggulli` | ATCS Trenggulli | HLS | `https://atcs.denpasarkota.go.id/stream/A036TRENGGULIPTZ/stream.m3u8` |
| 36 | `denpasar-atcs-a037-kenarok` | ATCS Kenarok | HLS | `https://atcs.denpasarkota.go.id/stream/A037KENAROKPTZ/stream.m3u8` |
| 37 | `denpasar-atcs-a040-sekar-sari` | ATCS Sekar Sari | HLS | `https://atcs.denpasarkota.go.id/stream/A040SEKARSARIPTZ/stream.m3u8` |
| 38 | `denpasar-atcs-a041-gemitir` | ATCS Gemitir | HLS | `https://atcs.denpasarkota.go.id/stream/A041GEMITIRPTZ/stream.m3u8` |
| 39 | `denpasar-atcs-a044-waribang` | ATCS Waribang | HLS | `https://atcs.denpasarkota.go.id/stream/A044WARIBANGPTZ/stream.m3u8` |
| 40 | `denpasar-atcs-a045-surabi` | ATCS Surabi | HLS | `https://atcs.denpasarkota.go.id/stream/A045SURABIPTZ/stream.m3u8` |
| 41 | `denpasar-atcs-a046-subita` | ATCS Subita | HLS | `https://atcs.denpasarkota.go.id/stream/A046SUBITAPTZ/stream.m3u8` |
| 42 | `denpasar-atcs-a047-kecubung` | ATCS Kecubung | HLS | `https://atcs.denpasarkota.go.id/stream/A047KECUBUNGPTZ/stream.m3u8` |
| 43 | `denpasar-atcs-a048-nusa-indah` | ATCS Nusa Indah | HLS | `https://atcs.denpasarkota.go.id/stream/A048NUSAINDAHPTZ/stream.m3u8` |
| 44 | `denpasar-atcs-a049-tukad-unda` | ATCS Tukad Unda | HLS | `https://atcs.denpasarkota.go.id/stream/A049TUKADUNDAPTZ/stream.m3u8` |
| 45 | `denpasar-atcs-a113-tukad-barito` | ATCS Tukad Barito | HLS | `https://atcs.denpasarkota.go.id/stream/A113TUKADBARITOPTZ/stream.m3u8` |
| 46 | `denpasar-atcs-a052-kapten-agung` | ATCS Kapten Agung | HLS | `https://atcs.denpasarkota.go.id/stream/A052KAPTENAGUNGPTZ/stream.m3u8` |
| 47 | `denpasar-atcs-a053-simpang-6-teuku-umar` | ATCS Simpang 6 Teuku Umar | HLS | `https://atcs.denpasarkota.go.id/stream/A053SIMPANG6TEUKUUMARPTZ/stream.m3u8` |
| 48 | `denpasar-atcs-a065-udayana` | ATCS Udayana | HLS | `https://atcs.denpasarkota.go.id/stream/A065UDAYANAPTZ/stream.m3u8` |
| 49 | `denpasar-atcs-a066-puputan-2` | ATCS Puputan (2) | HLS | `https://atcs.denpasarkota.go.id/stream/A066PUPUTANPTZ/stream.m3u8` |
| 50 | `denpasar-atcs-a067-nangka-utara` | ATCS Nangka Utara | HLS | `https://atcs.denpasarkota.go.id/stream/A067NANGKAUTARAPTZ/stream.m3u8` |
| 51 | `denpasar-atcs-a068-seroja` | ATCS Seroja | HLS | `https://atcs.denpasarkota.go.id/stream/A068SEROJAPTZ/stream.m3u8` |
| 52 | `denpasar-atcs-a069-padma` | ATCS Padma | HLS | `https://atcs.denpasarkota.go.id/stream/A069PADMAPTZ/stream.m3u8` |
| 53 | `denpasar-atcs-a070-titi-banda` | ATCS Titi Banda | HLS | `https://atcs.denpasarkota.go.id/stream/A070TITIBANDAPTZ/stream.m3u8` |
| 54 | `denpasar-atcs-a071-bundaran-hang-tuah` | ATCS Bundaran Hang Tuah | HLS | `https://atcs.denpasarkota.go.id/stream/A071BUNDARANHANGTUAHPTZ/stream.m3u8` |
| 55 | `denpasar-atcs-a072-durian-kaliasem` | ATCS Durian - Kaliasem | HLS | `https://atcs.denpasarkota.go.id/stream/A072DURIAN-KALIASEMPTZ/stream.m3u8` |
| 56 | `denpasar-atcs-a073-ahmad-yani-maruti` | ATCS Ahmad Yani - Maruti | HLS | `https://atcs.denpasarkota.go.id/stream/A073AHMADYANI-MARUTIPTZ/stream.m3u8` |
| 57 | `denpasar-atcs-a074-ahmad-yani-mulawarman` | ATCS Ahmad Yani - Mulawarman | HLS | `https://atcs.denpasarkota.go.id/stream/A074AHMADYANI-MULAWARMANPTZ/stream.m3u8` |
| 58 | `denpasar-atcs-a075-pasar-satria` | ATCS Pasar Satria | HLS | `https://atcs.denpasarkota.go.id/stream/A075PASARSATRIAPTZ/stream.m3u8` |
| 59 | `denpasar-atcs-a076-banjar-tainsiat` | ATCS Banjar Tainsiat | HLS | `https://atcs.denpasarkota.go.id/stream/A076BANJARTAINSIATPTZ/stream.m3u8` |
| 60 | `denpasar-atcs-a077-banjar-balun` | ATCS Banjar Balun | HLS | `https://atcs.denpasarkota.go.id/stream/A077BANJARBALUNPTZ/stream.m3u8` |
| 61 | `denpasar-atcs-a078-wibisana-setiabudi` | ATCS Wibisana - Setiabudi | HLS | `https://atcs.denpasarkota.go.id/stream/A078WIBISANA-SETIABUDIPTZ/stream.m3u8` |
| 62 | `denpasar-atcs-a079-lapangan-puputan-utara` | ATCS Lapangan Puputan Utara | HLS | `https://atcs.denpasarkota.go.id/stream/A079LAPANGPUPUTANUTARAPTZ/stream.m3u8` |
| 63 | `denpasar-atcs-a080-suli-sarigading` | ATCS Suli - Sarigading | HLS | `https://atcs.denpasarkota.go.id/stream/A080SULI-SARIGADINGPTZ/stream.m3u8` |
| 64 | `denpasar-atcs-a081-banjar-tampak-gangsul` | ATCS Banjar Tampak Gangsul | HLS | `https://atcs.denpasarkota.go.id/stream/A081BANJARTAMPAKGANGSULPTZ/stream.m3u8` |
| 65 | `denpasar-atcs-a082-veteran-abimanyu` | ATCS Veteran - Abimanyu | HLS | `https://atcs.denpasarkota.go.id/stream/A082VETERAN-ABIMANYUPTZ/stream.m3u8` |
| 66 | `denpasar-atcs-a083-pura-dalem-yangbatu` | ATCS Pura Dalem Yangbatu | HLS | `https://atcs.denpasarkota.go.id/stream/A083PURADALEMYANGBATUPTZ/stream.m3u8` |
| 67 | `denpasar-atcs-a084-pojok-selatan-museum-bali` | ATCS Pojok Selatan Museum Bali | HLS | `https://atcs.denpasarkota.go.id/stream/A084POJOKSELATANMUSEUMBALIPTZ/stream.m3u8` |
| 68 | `denpasar-atcs-a085-pojok-utara-jagatnatha` | ATCS Pojok Utara Jagatnatha | HLS | `https://atcs.denpasarkota.go.id/stream/A085POJOKUTARAJAGATNATHAPTZ/stream.m3u8` |
| 69 | `denpasar-atcs-a086-trenggana-siulan` | ATCS Trenggana - Siulan | HLS | `https://atcs.denpasarkota.go.id/stream/A086TRENGGANA-SIULANPTZ/stream.m3u8` |
| 70 | `denpasar-atcs-a087-pasar-agung-peninjoan` | ATCS Pasar Agung Peninjoan | HLS | `https://atcs.denpasarkota.go.id/stream/A087PASARAGUNGPENINJOANPTZ/stream.m3u8` |
| 71 | `denpasar-atcs-a088-terminal-kereneng` | ATCS Terminal Kereneng | HLS | `https://atcs.denpasarkota.go.id/stream/A088TERMINALKERENENGPTZ/stream.m3u8` |
| 72 | `denpasar-atcs-a089-raya-puputan-letda-tantular` | ATCS Raya Puputan - Letda Tantular | HLS | `https://atcs.denpasarkota.go.id/stream/A089RAYAPUPUTAN-LETDATANTULARPTZ/stream.m3u8` |
| 73 | `denpasar-atcs-a090-kapten-agung-kapten-regug` | ATCS Kapten Agung - Kapten Regug | HLS | `https://atcs.denpasarkota.go.id/stream/A090KAPTENAGUNG-KAPTENREGUGPTZ/stream.m3u8` |
| 74 | `denpasar-atcs-a091-kamboja-angsoka` | ATCS Kamboja - Angsoka | HLS | `https://atcs.denpasarkota.go.id/stream/A091KAMBOJA-ANGSOKAPTZ/stream.m3u8` |
| 75 | `denpasar-atcs-a092-kamboja-rijasa` | ATCS Kamboja - Rijasa | HLS | `https://atcs.denpasarkota.go.id/stream/A092KAMBOJA-RIJASAPTZ/stream.m3u8` |
| 76 | `denpasar-atcs-a093-dprd-kota-denpasar` | ATCS DPRD Kota Denpasar | HLS | `https://atcs.denpasarkota.go.id/stream/A093DPRDKOTADENPASARPTZ/stream.m3u8` |
| 77 | `denpasar-atcs-a094-kamboja-rampai` | ATCS Kamboja - Rampai | HLS | `https://atcs.denpasarkota.go.id/stream/A094KAMBOJA-RAMPAIPTZ/stream.m3u8` |
| 78 | `denpasar-atcs-a095-hayam-wuruk-lely` | ATCS Hayam Wuruk - Lely | HLS | `https://atcs.denpasarkota.go.id/stream/A095HAYAMWURUK-LELYPTZ/stream.m3u8` |
| 79 | `denpasar-atcs-a096-sidakarya-bedugul` | ATCS Sidakarya - Bedugul | HLS | `https://atcs.denpasarkota.go.id/stream/A096SIDAKARYA-BEDUGULPTZ/stream.m3u8` |
| 80 | `denpasar-atcs-a097-waturenggong-tukad-yeh-aya` | ATCS Waturenggong - Tukad Yeh Aya | HLS | `https://atcs.denpasarkota.go.id/stream/A097WATURENGGONG-TUKADYEHAYAPTZ/stream.m3u8` |
| 81 | `denpasar-atcs-a098-tukad-barito-tukad-badung` | ATCS Tukad Barito - Tukad Badung | HLS | `https://atcs.denpasarkota.go.id/stream/A098TUKADBARITO-TUKADBADUNGPTZ/stream.m3u8` |
| 82 | `denpasar-atcs-a099-suci` | ATCS Suci | HLS | `https://atcs.denpasarkota.go.id/stream/A099SUCIPTZ/stream.m3u8` |
| 83 | `denpasar-atcs-a100-pura-demak` | ATCS Pura Demak | HLS | `https://atcs.denpasarkota.go.id/stream/A100PURADEMAKPTZ/stream.m3u8` |
| 84 | `denpasar-atcs-a101-batukaru-rinjani` | ATCS Batukaru - Rinjani | HLS | `https://atcs.denpasarkota.go.id/stream/A101BATUKARU-RINJANIPTZ/stream.m3u8` |
| 85 | `denpasar-atcs-a102-udayana-beliton` | ATCS Udayana - Beliton | HLS | `https://atcs.denpasarkota.go.id/stream/A102UDAYANA-BELITON/stream.m3u8` |
| 86 | `denpasar-atcs-a104-sutoyo-hasanudin` | ATCS Sutoyo - Hasanudin | HLS | `https://atcs.denpasarkota.go.id/stream/A104SUTOYO-HASANUDINPTZ/stream.m3u8` |
| 87 | `denpasar-atcs-a105-rsad-udayana` | ATCS RSAD Udayana | HLS | `https://atcs.denpasarkota.go.id/stream/A105RSADUDAYANAPTZ/stream.m3u8` |
| 88 | `denpasar-atcs-a106-enggano-bungin` | ATCS Enggano - Bungin | HLS | `https://atcs.denpasarkota.go.id/stream/A106ENGGANO-BUNGINPTZ/stream.m3u8` |
| 89 | `denpasar-atcs-a107-gatot-subroto-barat-gunung-catur` | ATCS Gatot Subroto Barat - Gunung Catur | HLS | `https://atcs.denpasarkota.go.id/stream/A107GATSUBARAT-GUNUNGCATURPTZ/stream.m3u8` |
| 90 | `denpasar-atcs-a108-pasar-sanglah` | ATCS Pasar Sanglah | HLS | `https://atcs.denpasarkota.go.id/stream/A108PASARSANGLAHPTZ/stream.m3u8` |
| 91 | `denpasar-atcs-a109-teuku-umar-pulau-seram` | ATCS Teuku Umar - Pulau Seram | HLS | `https://atcs.denpasarkota.go.id/stream/A109TEUKUUMAR-PULAUSERAMPTZ/stream.m3u8` |
| 92 | `denpasar-atcs-a110-pulau-kawe-satelit` | ATCS Pulau Kawe - Satelit | HLS | `https://atcs.denpasarkota.go.id/stream/A110PULAUKAWE-SATELITPTZ/stream.m3u8` |
| 93 | `denpasar-atcs-a119-taman-pancing` | ATCS Taman Pancing | HLS | `https://atcs.denpasarkota.go.id/stream/A119TAMANPANCINGPTZ/stream.m3u8` |
| 94 | `denpasar-atcs-a120-tukad-pakerisan` | ATCS Tukad Pakerisan | HLS | `https://atcs.denpasarkota.go.id/stream/A120TUKADPAKERISANPTZ/stream.m3u8` |
| 95 | `denpasar-atcs-a050-jalan-gunung-agung` | ATCS Jalan Gunung Agung | HLS | `https://atcs.denpasarkota.go.id/stream/A050JALANGUNUNGAGUNGPTZ/stream.m3u8` |
| 96 | `denpasar-atcs-a051-mahendradatta-soputan` | ATCS Mahendradatta - Soputan | HLS | `https://atcs.denpasarkota.go.id/stream/A051MAHENDRADATTA-SOPUTANPTZ/stream.m3u8` |

### Surakarta (134)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `surakarta-atcs-agas` | ATCS Agas | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Agas.flv` |
| 2 | `surakarta-atcs-balaikota` | ATCS Balai Kota | FLV | `https://surakarta.atcsindonesia.info:8086/camera/BalaiKota.flv` |
| 3 | `surakarta-atcs-balapan01` | ATCS Balapan 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Balapan01.flv` |
| 4 | `surakarta-atcs-banjarsari` | ATCS Banjarsari | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Banjarsari.flv` |
| 5 | `surakarta-atcs-baron` | ATCS Baron | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Baron.flv` |
| 6 | `surakarta-atcs-baturono` | ATCS Batu Rono | FLV | `https://surakarta.atcsindonesia.info:8086/camera/BatuRono.flv` |
| 7 | `surakarta-atcs-bawahflyoverpurwosari` | ATCS Bawah Flyover Purwosari | FLV | `https://surakarta.atcsindonesia.info:8086/camera/BawahFlyoverPurwosari.flv` |
| 8 | `surakarta-atcs-bundaranbaron` | ATCS Bundaran Baron | FLV | `https://surakarta.atcsindonesia.info:8086/camera/BundaranBaron.flv` |
| 9 | `surakarta-atcs-gladag` | ATCS Gladag | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Gladag.flv` |
| 10 | `surakarta-atcs-bundarantipes` | ATCS Bundaran Tipes | FLV | `https://surakarta.atcsindonesia.info:8086/camera/BundaranTipes.flv` |
| 11 | `surakarta-atcs-cengklik` | ATCS Cengklik | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Cengklik.flv` |
| 12 | `surakarta-atcs-fajarindah` | ATCS Fajar Indah | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FajarIndah.flv` |
| 13 | `surakarta-atcs-farokah` | ATCS Farokah | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Farokah.flv` |
| 14 | `surakarta-atcs-flyovertimur` | ATCS Flyover Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FlyoverTimur.flv` |
| 15 | `surakarta-atcs-gading` | ATCS Gading | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Gading.flv` |
| 16 | `surakarta-atcs-gemblegan` | ATCS Gemblegan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Gemblegan.flv` |
| 17 | `surakarta-atcs-gendengan01` | ATCS Gendengan 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Gendengan01.flv` |
| 18 | `surakarta-atcs-gilingan01` | ATCS Gilingan 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Gilingan01.flv` |
| 19 | `surakarta-atcs-jembatantirtonadi` | ATCS Jembatan Tirtonadi | FLV | `https://surakarta.atcsindonesia.info:8086/camera/JembatanTirtonadi.flv` |
| 20 | `surakarta-atcs-jongke` | ATCS Jongke | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Jongke.flv` |
| 21 | `surakarta-atcs-juanda` | ATCS Juanda | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Juanda.flv` |
| 22 | `surakarta-atcs-jurug` | ATCS Jurug | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Jurug.flv` |
| 23 | `surakarta-atcs-jurugtimur` | ATCS Jurug Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/JurugTimur.flv` |
| 24 | `surakarta-atcs-kabangan` | ATCS Kabangan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Kabangan.flv` |
| 25 | `surakarta-atcs-kandangsapi` | ATCS Kandang Sapi | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KandangSapi.flv` |
| 26 | `surakarta-atcs-kawatan` | ATCS Kawatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Kawatan.flv` |
| 27 | `surakarta-atcs-kelurahansumber01` | ATCS Kelurahan Sumber 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KelurahanSumber01.flv` |
| 28 | `surakarta-atcs-kerten` | ATCS Kerten | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Kerten.flv` |
| 29 | `surakarta-atcs-ketandan` | ATCS Ketandan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Ketandan.flv` |
| 30 | `surakarta-atcs-kleco` | ATCS Kleco | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Kleco.flv` |
| 31 | `surakarta-atcs-klodran` | ATCS Klodran | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Klodran.flv` |
| 32 | `surakarta-atcs-komplang01` | ATCS Komplang 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Komplang01.flv` |
| 33 | `surakarta-atcs-mijipinilihanlor` | ATCS Mijipinilihan Lor | FLV | `https://surakarta.atcsindonesia.info:8086/camera/MijipinilihanLor.flv` |
| 34 | `surakarta-atcs-lojigandrung` | ATCS Loji Gandrung | FLV | `https://surakarta.atcsindonesia.info:8086/camera/LojiGandrung.flv` |
| 35 | `surakarta-atcs-brimob01` | ATCS Brimob 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Brimob01.flv` |
| 36 | `surakarta-atcs-makutho` | ATCS Makutho | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Makutho.flv` |
| 37 | `surakarta-atcs-mipitan` | ATCS Mipitan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Mipitan.flv` |
| 38 | `surakarta-atcs-mojosongo` | ATCS Mojosongo | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Mojosongo.flv` |
| 39 | `surakarta-atcs-mujahidin` | ATCS Mujahidin | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Mujahidin.flv` |
| 40 | `surakarta-atcs-ngapeman01` | ATCS Ngapeman 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Ngapeman01.flv` |
| 41 | `surakarta-atcs-ngemplak` | ATCS Ngemplak | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Ngemplak.flv` |
| 42 | `surakarta-atcs-ngemplakbarat` | ATCS Ngemplak Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/NgemplakBarat.flv` |
| 43 | `surakarta-atcs-ngemplakselatan` | ATCS Ngemplak Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/NgemplakSelatan.flv` |
| 44 | `surakarta-atcs-ngemplaktimur` | ATCS Ngemplak Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/NgemplakTimur.flv` |
| 45 | `surakarta-atcs-ngemplakutara` | ATCS Ngemplak Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/NgemplakUtara.flv` |
| 46 | `surakarta-atcs-nonongan` | ATCS Nonongan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Nonongan.flv` |
| 47 | `surakarta-atcs-overpassmanahan` | ATCS Overpass Manahan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/OverpassManahan.flv` |
| 48 | `surakarta-atcs-pajang` | ATCS Pajang | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Pajang.flv` |
| 49 | `surakarta-atcs-panggung` | ATCS Panggung | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Panggung.flv` |
| 50 | `surakarta-atcs-pasargede` | ATCS Pasar Gede | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PasarGede.flv` |
| 51 | `surakarta-atcs-pasarkembang` | ATCS Pasar Kembang | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PasarKembang.flv` |
| 52 | `surakarta-atcs-pasarnusukan` | ATCS Pasar Nusukan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PasarNusukan.flv` |
| 53 | `surakarta-atcs-pasarpon01` | ATCS Pasar Pon 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PasarPon01.flv` |
| 54 | `surakarta-atcs-pgs` | ATCS PGS | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PGS.flv` |
| 55 | `surakarta-atcs-purwosari` | ATCS Purwosari | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Purwosari.flv` |
| 56 | `surakarta-atcs-rahayu01` | ATCS Rahayu 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Rahayu01.flv` |
| 57 | `surakarta-atcs-ramayana` | ATCS Ramayana | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Ramayana.flv` |
| 58 | `surakarta-atcs-ringroad` | ATCS Ring Road | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RingRoad.flv` |
| 59 | `surakarta-atcs-sangkrah` | ATCS Sangkrah | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Sangkrah.flv` |
| 60 | `surakarta-atcs-satesumber01` | ATCS Sate Sumber 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SateSumber01.flv` |
| 61 | `surakarta-atcs-sekarpace` | ATCS Sekarpace | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Sekarpace.flv` |
| 62 | `surakarta-atcs-semanggi` | ATCS Semanggi | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Semanggi.flv` |
| 63 | `surakarta-atcs-sholikin01` | ATCS Sholikin 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Sholikin01.flv` |
| 64 | `surakarta-atcs-spbupucangsawit` | ATCS SPBU Pucangsawit | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SPBUPucangsawit.flv` |
| 65 | `surakarta-atcs-sraten` | ATCS Sraten | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Sraten.flv` |
| 66 | `surakarta-atcs-sriwedari01` | ATCS Sriwedari 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Sriwedari01.flv` |
| 67 | `surakarta-atcs-tipes` | ATCS Tipes | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Tipes.flv` |
| 68 | `surakarta-atcs-tirtonadi01` | ATCS Tirtonadi 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Tirtonadi01.flv` |
| 69 | `surakarta-atcs-cembengan` | ATCS Cembengan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Cembengan.flv` |
| 70 | `surakarta-atcs-tuguwisnu01` | ATCS Tugu Wisnu 01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/TuguWisnu01.flv` |
| 71 | `surakarta-atcs-uns` | ATCS UNS | FLV | `https://surakarta.atcsindonesia.info:8086/camera/UNS.flv` |
| 72 | `surakarta-atcs-unsbarat` | ATCS UNS Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/UNSBarat.flv` |
| 73 | `surakarta-atcs-unstimur` | ATCS UNS Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/UNSTimur.flv` |
| 74 | `surakarta-atcs-ursulin` | ATCS Ursulin | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Ursulin.flv` |
| 75 | `surakarta-atcs-warungpelem` | ATCS Warung Pelem | FLV | `https://surakarta.atcsindonesia.info:8086/camera/WarungPelem.flv` |
| 76 | `surakarta-atcs-widuran` | ATCS Widuran | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Widuran.flv` |
| 77 | `surakarta-atcs-balong` | ATCS Balong | FLV | `https://surakarta.atcsindonesia.info:8086/camera/Balong.flv` |
| 78 | `surakarta-atcs-cembengan-barat` | ATCS Cembengan Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/CembenganBarat.flv` |
| 79 | `surakarta-atcs-cembengan-selatan` | ATCS Cembengan Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/CembenganSelatan.flv` |
| 80 | `surakarta-atcs-cembengan-timur` | ATCS Cembengan Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/CembenganTimur.flv` |
| 81 | `surakarta-atcs-cembengan-utara` | ATCS Cembengan Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/CembenganUtara.flv` |
| 82 | `surakarta-atcs-fajar-indah-barat` | ATCS Fajar Indah Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FajarIndahBarat.flv` |
| 83 | `surakarta-atcs-fajar-indah-selatan` | ATCS Fajar Indah Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FajarIndahSelatan.flv` |
| 84 | `surakarta-atcs-fajar-indah-timur` | ATCS Fajar Indah Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FajarIndahTimur.flv` |
| 85 | `surakarta-atcs-fajar-indah-utara` | ATCS Fajar Indah Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FajarIndahUtara.flv` |
| 86 | `surakarta-atcs-faroka-barat` | ATCS Faroka Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FarokaBarat.flv` |
| 87 | `surakarta-atcs-faroka-timur` | ATCS Faroka Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FarokaTimur.flv` |
| 88 | `surakarta-atcs-flyover-barat` | ATCS Flyover Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/FlyoverBarat.flv` |
| 89 | `surakarta-atcs-gemblegan-barat` | ATCS Gemblegan Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GembleganBarat.flv` |
| 90 | `surakarta-atcs-gemblegan-selatan` | ATCS Gemblegan Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GembleganSelatan.flv` |
| 91 | `surakarta-atcs-gemblegan-timur` | ATCS Gemblegan Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GembleganTimur.flv` |
| 92 | `surakarta-atcs-gemblegan-utara` | ATCS Gemblegan Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GembleganUtara.flv` |
| 93 | `surakarta-atcs-gendengan-barat` | ATCS Gendengan Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GendenganBarat.flv` |
| 94 | `surakarta-atcs-gendengan-timur` | ATCS Gendengan Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GendenganTimur.flv` |
| 95 | `surakarta-atcs-genengan-barat` | ATCS Genengan Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GenenganBarat.flv` |
| 96 | `surakarta-atcs-genengan-selatan` | ATCS Genengan Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GenenganSelatan.flv` |
| 97 | `surakarta-atcs-genengan-timur` | ATCS Genengan Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GenenganTimur.flv` |
| 98 | `surakarta-atcs-genengan-utara` | ATCS Genengan Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GenenganUtara.flv` |
| 99 | `surakarta-atcs-giri-mulyo01` | ATCS Giri Mulyo01 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GiriMulyo01.flv` |
| 100 | `surakarta-atcs-gondang-ptz` | ATCS Gondang PTZ | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GondangPTZ.flv` |
| 101 | `surakarta-atcs-gondang-wide` | ATCS Gondang Wide | FLV | `https://surakarta.atcsindonesia.info:8086/camera/GondangWide.flv` |
| 102 | `surakarta-atcs-isiptz` | ATCS ISIPTZ | FLV | `https://surakarta.atcsindonesia.info:8086/camera/ISIPTZ.flv` |
| 103 | `surakarta-atcs-isiwide` | ATCS ISIWide | FLV | `https://surakarta.atcsindonesia.info:8086/camera/ISIWide.flv` |
| 104 | `surakarta-atcs-kelurahan-sumber-barat` | ATCS Kelurahan Sumber Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KelurahanSumberBarat.flv` |
| 105 | `surakarta-atcs-kelurahan-sumber-selatan` | ATCS Kelurahan Sumber Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KelurahanSumberSelatan.flv` |
| 106 | `surakarta-atcs-kelurahan-sumber-timur` | ATCS Kelurahan Sumber Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KelurahanSumberTimur.flv` |
| 107 | `surakarta-atcs-kelurahan-sumber-utara` | ATCS Kelurahan Sumber Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KelurahanSumberUtara.flv` |
| 108 | `surakarta-atcs-kerten-utara` | ATCS Kerten Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KertenUtara.flv` |
| 109 | `surakarta-atcs-kleco-barat` | ATCS Kleco Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KlecoBarat.flv` |
| 110 | `surakarta-atcs-klodran-barat` | ATCS Klodran Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KlodranBarat.flv` |
| 111 | `surakarta-atcs-klodran-timur` | ATCS Klodran Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/KlodranTimur.flv` |
| 112 | `surakarta-atcs-mojosongo-barat` | ATCS Mojosongo Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/MojosongoBarat.flv` |
| 113 | `surakarta-atcs-mojosongo-utara` | ATCS Mojosongo Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/MojosongoUtara.flv` |
| 114 | `surakarta-atcs-nonongan-wide` | ATCS Nonongan Wide | FLV | `https://surakarta.atcsindonesia.info:8086/camera/NononganWide.flv` |
| 115 | `surakarta-atcs-overpass-barat` | ATCS Overpass Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/OverpassBarat.flv` |
| 116 | `surakarta-atcs-overpass-selatan` | ATCS Overpass Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/OverpassSelatan.flv` |
| 117 | `surakarta-atcs-panggung-barat` | ATCS Panggung Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PanggungBarat.flv` |
| 118 | `surakarta-atcs-panggung-selatan` | ATCS Panggung Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PanggungSelatan.flv` |
| 119 | `surakarta-atcs-pasar-kliwon` | ATCS Pasar Kliwon | FLV | `https://surakarta.atcsindonesia.info:8086/camera/PasarKliwon.flv` |
| 120 | `surakarta-atcs-ring-road-barat` | ATCS Ring Road Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RingRoadBarat.flv` |
| 121 | `surakarta-atcs-ring-road-selatan` | ATCS Ring Road Selatan | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RingRoadSelatan.flv` |
| 122 | `surakarta-atcs-ring-road-timur` | ATCS Ring Road Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RingRoadTimur.flv` |
| 123 | `surakarta-atcs-ring-road-utara` | ATCS Ring Road Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RingRoadUtara.flv` |
| 124 | `surakarta-atcs-ruas-ring-road-barat` | ATCS Ruas Ring Road Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RuasRingRoadBarat.flv` |
| 125 | `surakarta-atcs-ruas-ring-road-timur` | ATCS Ruas Ring Road Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/RuasRingRoadTimur.flv` |
| 126 | `surakarta-atcs-smp18` | ATCS SMP18 | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SMP18.flv` |
| 127 | `surakarta-atcs-sekarpace-barat` | ATCS Sekarpace Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SekarpaceBarat.flv` |
| 128 | `surakarta-atcs-sekarpace-timur` | ATCS Sekarpace Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SekarpaceTimur.flv` |
| 129 | `surakarta-atcs-sekarpace-utara` | ATCS Sekarpace Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/SekarpaceUtara.flv` |
| 130 | `surakarta-atcs-tugu-wisnu-timur` | ATCS Tugu Wisnu Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/TuguWisnuTimur.flv` |
| 131 | `surakarta-atcs-tugu-wisnu-utara` | ATCS Tugu Wisnu Utara | FLV | `https://surakarta.atcsindonesia.info:8086/camera/TuguWisnuUtara.flv` |
| 132 | `surakarta-atcs-vmsdprd` | ATCS VMSDPRD | FLV | `https://surakarta.atcsindonesia.info:8086/camera/VMSDPRD.flv` |
| 133 | `surakarta-atcs-warung-pelem-barat` | ATCS Warung Pelem Barat | FLV | `https://surakarta.atcsindonesia.info:8086/camera/WarungPelemBarat.flv` |
| 134 | `surakarta-atcs-warung-pelem-timur` | ATCS Warung Pelem Timur | FLV | `https://surakarta.atcsindonesia.info:8086/camera/WarungPelemTimur.flv` |

### Magelang (75)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `magelang-atcs-ptz-batas-kota` | ATCS PTZ-BATAS KOTA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/7df59214-0e5b-40df-b467-75a7857b0159.m3u8` |
| 2 | `magelang-atcs-cctv-simpang-satpoll-barat` | ATCS CCTV-SIMPANG SATPOLL BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/54f6ec38-e985-4186-addb-fa471f1c9d56.m3u8` |
| 3 | `magelang-atcs-cctv-simpang-kupatan-barat` | ATCS CCTV-SIMPANG KUPATAN - BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/77b482bb-6ec7-4653-b12f-8b240079f797.m3u8` |
| 4 | `magelang-atcs-cctv-simpang-satpoll-utara` | ATCS CCTV-SIMPANG SATPOLL UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/031a639e-1e4b-478c-af0c-70ccac058fa2.m3u8` |
| 5 | `magelang-atcs-cctv-simpang-satpol-selatan` | ATCS CCTV-SIMPANG SATPOL SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/a1aa0214-9e0b-477c-8264-fdad75a0528d.m3u8` |
| 6 | `magelang-atcs-ptz-simpang-kupatan` | ATCS PTZ-SIMPANG KUPATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/152c9fa2-0b6b-463f-acef-641d0930a284.m3u8` |
| 7 | `magelang-atcs-cctv-simpang-kupatan-selatan` | ATCS CCTV-SIMPANG KUPATAN - SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/6d8b6828-593c-49dc-b4b7-55e5cd6b4859.m3u8` |
| 8 | `magelang-atcs-cctv-simpang-safari-utara` | ATCS CCTV-SIMPANG SAFARI - UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/1ea0f193-01c7-4d98-acad-54a769744260.m3u8` |
| 9 | `magelang-atcs-cctv-simpang-safari-selatan` | ATCS CCTV-SIMPANG SAFARI - SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/76677aa9-81ba-4c2d-88d7-fd693ac21410.m3u8` |
| 10 | `magelang-atcs-cctv-simpang-safari-barat` | ATCS CCTV-SIMPANG SAFARI - BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/5407478b-43a5-447b-b622-0eddad507718.m3u8` |
| 11 | `magelang-atcs-ptz-simpang-safari` | ATCS PTZ-SIMPANG SAFARI | HLS | `https://restreamer.magelangkota.go.id/memfs/cc8fd6cf-0264-4fb3-beb8-79df7cdf26f1.m3u8` |
| 12 | `magelang-atcs-cctv-simpang-smp-7-selatan` | ATCS CCTV-SIMPANG SMP 7-SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/31c5bae8-016b-4831-a98a-5d7fbe9db7db.m3u8` |
| 13 | `magelang-atcs-cctv-kebun-bibit-parkiran` | ATCS CCTV-KEBUN BIBIT - PARKIRAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/340139d5-3055-4899-a36e-0d1d25776987.m3u8` |
| 14 | `magelang-atcs-cctv-kebun-bibit-taman` | ATCS CCTV-KEBUN BIBIT -  TAMAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/0c21c4ff-ff0f-4134-ae71-e79950f6d8fa.m3u8` |
| 15 | `magelang-atcs-cctv-simpang-cacaban-timur` | ATCS CCTV-SIMPANG CACABAN TIMUR | HLS | `https://restreamer.magelangkota.go.id/memfs/30e607e7-800c-47e3-bb1f-3769db522bc3.m3u8` |
| 16 | `magelang-atcs-cctv-simpang-cacaban-ptz` | ATCS CCTV SIMPANG CACABAN PTZ | HLS | `https://restreamer.magelangkota.go.id/memfs/bd65a54a-deaf-43d3-aa7a-849d3f5197fa.m3u8` |
| 17 | `magelang-atcs-cctv-simpang-kodim-utara` | ATCS CCTV-SIMPANG KODIM - UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/ba5c4749-ae17-45f3-aa5e-2a9fc4dd0e7a.m3u8` |
| 18 | `magelang-atcs-cctv-simpang-cacaban-selatan` | ATCS CCTV-SIMPANG CACABAN SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/e31fdc1f-feb2-4544-8e9b-693631ba1ba6.m3u8` |
| 19 | `magelang-atcs-cctv-simpang-cacaban-barat` | ATCS CCTV SIMPANG CACABAN BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/e87d2aad-61a2-464c-b49e-07734a664710.m3u8` |
| 20 | `magelang-atcs-cctv-simpang-kodim-barat` | ATCS CCTV-SIMPANG KODIM-BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/bcc1abd1-e6e8-4013-80f4-ad961f6765b6.m3u8` |
| 21 | `magelang-atcs-ptz-simpang-kodim` | ATCS PTZ-SIMPANG KODIM | HLS | `https://restreamer.magelangkota.go.id/memfs/648cd769-e6d6-4c08-866d-9e06464a2edf.m3u8` |
| 22 | `magelang-atcs-cctv-simpang-utara-masjid-agung` | ATCS CCTV-SIMPANG UTARA-MASJID AGUNG | HLS | `https://dev.cctv.magelangkota.go.id/memfs/13618425-2c5c-4fb9-8b9b-813511d360ba.m3u8` |
| 23 | `magelang-atcs-cctv-simpang-barat-masjid-agung` | ATCS CCTV-SIMPANG BARAT MASJID AGUNG | HLS | `https://restreamer.magelangkota.go.id/memfs/520ecab9-897e-43b4-b37e-8f2fa2288141.m3u8` |
| 24 | `magelang-atcs-cctv-aloon-aloon-gardena` | ATCS CCTV-ALOON - ALOON GARDENA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/8fb93fb3-cf14-4d29-8ec5-6ae8d56419df.m3u8` |
| 25 | `magelang-atcs-cctv-simpang-pecinan-utara` | ATCS CCTV-SIMPANG PECINAN-UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/0c799e57-868d-484d-98e2-8cac5a6327f5.m3u8` |
| 26 | `magelang-atcs-cctv-simpang-pecinan-barat` | ATCS CCTV-SIMPANG PECINAN BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/e7f9865d-8b62-4028-8c4f-9473a0a616df.m3u8` |
| 27 | `magelang-atcs-cctv-simpang-alun-alun-water-fountain` | ATCS CCTV-SIMPANG ALUN ALUN - WATER FOUNTAIN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/71838e52-ddc7-4a5b-af89-6d745c69ad03.m3u8` |
| 28 | `magelang-atcs-ptz-aloon-aloon-ptz-tengah` | ATCS PTZ-ALOON ALOON - PTZ TENGAH | HLS | `https://dev.cctv.magelangkota.go.id/memfs/3ae4cf0b-df1b-405b-be6a-164bba2814f2.m3u8` |
| 29 | `magelang-atcs-cctv-simpang-alun-alun-telkom` | ATCS CCTV-SIMPANG ALUN ALUN - TELKOM | HLS | `https://dev.cctv.magelangkota.go.id/memfs/445bc62e-35b5-4bb3-802c-2507bd78c035.m3u8` |
| 30 | `magelang-atcs-cctv-simpang-rejowinangun-ptz` | ATCS CCTV SIMPANG REJOWINANGUN PTZ | HLS | `https://restreamer.magelangkota.go.id/memfs/780c797e-81ea-4283-b150-79989ab068ae.m3u8` |
| 31 | `magelang-atcs-cctv-simpang-rejowinangun-utara` | ATCS CCTV SIMPANG REJOWINANGUN UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/5794c388-cce2-447d-a743-557fbdd6344f.m3u8` |
| 32 | `magelang-atcs-cctv-simpang-rejowinangun-barat` | ATCS CCTV-SIMPANG REJOWINANGUN BARAT | HLS | `https://restreamer.magelangkota.go.id/memfs/c087d79e-6d6a-4289-9029-f438edeff3f8.m3u8` |
| 33 | `magelang-atcs-cctv-simpang-cpm-timur` | ATCS CCTV-SIMPANG CPM - TIMUR | HLS | `https://restreamer.magelangkota.go.id/memfs/ab64e148-5be2-4965-ad99-09df5ac56dcb.m3u8` |
| 34 | `magelang-atcs-cctv-simpang-cpm-utara` | ATCS CCTV-SIMPANG CPM - UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/71ec2b63-dda2-4e2a-8e75-10bb1ab19a26.m3u8` |
| 35 | `magelang-atcs-cctv-g-karang-gading-barat` | ATCS CCTV G KARANG GADING BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/bf4aeadc-5f9c-4797-ad69-92cdc383a6c7.m3u8` |
| 36 | `magelang-atcs-cctv-gor-samapta-didalam-selatan` | ATCS CCTV-GOR SAMAPTA DIDALAM - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/d0c07ad4-d2d9-4ac8-9db5-e48a141badd8.m3u8` |
| 37 | `magelang-atcs-cctv-smk-3-barat` | ATCS CCTV-SMK 3  BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/79f5ca33-6a6d-4a4a-98d3-838908afb562.m3u8` |
| 38 | `magelang-atcs-cctv-smkn3-magelang-timur` | ATCS CCTV-SMKN3 MAGELANG-TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/4492f5d9-be05-4fd5-a536-4849d5582136.m3u8` |
| 39 | `magelang-atcs-gor-samapta-diluar-selatan` | ATCS GOR SAMAPTA DILUAR - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/2a2f0817-5e07-40f0-ac7e-3ae7811671db.m3u8` |
| 40 | `magelang-atcs-gor-samapta-diluar-utara` | ATCS GOR SAMAPTA DILUAR - UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/99d847b9-dd05-476a-bf55-b8a06251ec8c.m3u8` |
| 41 | `magelang-atcs-gor-samapta-diluar-timur` | ATCS GOR SAMAPTA DILUAR - TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/198b13c0-f995-471a-8c56-5899cd1f55cd.m3u8` |
| 42 | `magelang-atcs-cctv-taman-a-yani-tengah-selatan` | ATCS CCTV-TAMAN A. YANI TENGAH-SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/5ebbee56-c131-4dc5-807f-c8ad44dd2cef.m3u8` |
| 43 | `magelang-atcs-cctv-t-badaan-jl-utara` | ATCS CCTV-T. BADAAN-JL.UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/f5e78afa-c429-4ab1-b31e-e4b3b637e5d7.m3u8` |
| 44 | `magelang-atcs-cctv-t-badaan-utara-timur` | ATCS CCTV-T.BADAAN-UTARA TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/a96f472a-d0ea-4315-b515-193c602bbc3a.m3u8` |
| 45 | `magelang-atcs-cctv-sma-pendowo-barat` | ATCS CCTV-SMA PENDOWO-BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/df0eecb4-2deb-460b-9752-bb8a2fedb9e8.m3u8` |
| 46 | `magelang-atcs-cctv-sma-pendowo-timur` | ATCS CCTV SMA PENDOWO TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/0e575a53-cdc1-421c-9563-6fc3395abd10.m3u8` |
| 47 | `magelang-atcs-cctv-simpang-menowo-selatan` | ATCS CCTV SIMPANG MENOWO SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/7ea08807-0e56-4cac-a496-e844ad8b89d0.m3u8` |
| 48 | `magelang-atcs-cctv-simpang-menowo-timur` | ATCS CCTV-SIMPANG MENOWO-TIMUR | HLS | `https://restreamer.magelangkota.go.id/memfs/16b90739-0ff7-4450-9b32-1abe14cc58f4.m3u8` |
| 49 | `magelang-atcs-cctv-simpang-menowo-utara` | ATCS CCTV SIMPANG MENOWO UTARA | HLS | `https://restreamer.magelangkota.go.id/memfs/64293a4a-346e-4941-a716-4e80cc6136fe.m3u8` |
| 50 | `magelang-atcs-cctv-rsj-selatan` | ATCS CCTV-RSJ SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/c73a535b-71d2-4ac3-b1ab-c92ca9d2adc9.m3u8` |
| 51 | `magelang-atcs-cctv-rsj-utara` | ATCS CCTV-RSJ- UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/67338104-0028-4720-9f47-110fd4c0e7a9.m3u8` |
| 52 | `magelang-atcs-cctv-sma-kristen-barat` | ATCS CCTV SMA KRISTEN BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/b8266d83-4c6c-418f-a161-84cd07aa0b31.m3u8` |
| 53 | `magelang-atcs-cctv-sma-kristen-timur` | ATCS CCTV-SMA KRISTEN-TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/c6157074-9430-41e1-8cb7-72c99fa9ec59.m3u8` |
| 54 | `magelang-atcs-cctv-simpang-bni-arah-timur` | ATCS CCTV-SIMPANG BNI-ARAH TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/da9c4d13-77a6-435b-a46c-ee1d457f8ac8.m3u8` |
| 55 | `magelang-atcs-cctv-sumberwaras-utara` | ATCS CCTV-SUMBERWARAS-UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/115734d1-b3f5-42c4-b57c-0444bad14cb8.m3u8` |
| 56 | `magelang-atcs-cctv-sumberwaras-selatan` | ATCS CCTV-SUMBERWARAS-SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/d5400625-14f3-4787-8d57-80ea84b77154.m3u8` |
| 57 | `magelang-atcs-cctv-simpang-masjid-agung-selatan` | ATCS CCTV-SIMPANG MASJID AGUNG-SELATAN | HLS | `https://restreamer.magelangkota.go.id/memfs/dd4923b5-9ec7-4817-abbc-59192698722c.m3u8` |
| 58 | `magelang-atcs-cctv-simpang-masjid-agung-timur` | ATCS CCTV-SIMPANG MASJID AGUNG-TIMUR | HLS | `https://restreamer.magelangkota.go.id/memfs/f4fd977a-1a81-4eb0-9d78-5e9732c23deb.m3u8` |
| 59 | `magelang-atcs-ptz-simpang-pecinan` | ATCS PTZ-SIMPANG PECINAN | HLS | `https://restreamer.magelangkota.go.id/memfs/b588be63-2ac1-4a65-90cc-ba0e1c2b5fa2.m3u8` |
| 60 | `magelang-atcs-cctv-alun-alun-panggung-selatan` | ATCS CCTV-ALUN ALUN PANGGUNG - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/2cf96a42-3def-4d0e-b38d-973173d011b7.m3u8` |
| 61 | `magelang-atcs-cctv-psc-utara` | ATCS CCTV PSC - UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/090e1664-df75-410d-a4ea-b0db0d334329.m3u8` |
| 62 | `magelang-atcs-cctv-psc-selatan` | ATCS CCTV PSC - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/342540b3-545c-41a4-b3a2-624f7d824cdc.m3u8` |
| 63 | `magelang-atcs-smpn-1-magelang-selatan` | ATCS SMPN 1 MAGELANG - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/41299267-1f2d-413e-abf2-d55c1ee99dba.m3u8` |
| 64 | `magelang-atcs-smpn-1-magelang-utara` | ATCS SMPN 1 MAGELANG - UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/2e22bf14-2428-483a-ae99-1d87f0973e29.m3u8` |
| 65 | `magelang-atcs-puskesmas-magelang-selatan-utara` | ATCS PUSKESMAS MAGELANG SELATAN - UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/00a237d2-bae2-4d08-9c0d-ab06986262ff.m3u8` |
| 66 | `magelang-atcs-puskesmas-magelang-selatan-barat` | ATCS PUSKESMAS MAGELANG SELATAN - BARAT | HLS | `https://dev.cctv.magelangkota.go.id/memfs/4c3dac48-9b48-482f-9f84-c10f14ed471e.m3u8` |
| 67 | `magelang-atcs-puskesmas-magelang-selatan-timur` | ATCS PUSKESMAS MAGELANG SELATAN - TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/a000ece4-361d-400c-9602-7fa74cd9894e.m3u8` |
| 68 | `magelang-atcs-kec-magelang-tengah-lapangan` | ATCS KEC MAGELANG TENGAH - LAPANGAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/beaf36dd-1767-4ec1-ab59-a9430ff53f52.m3u8` |
| 69 | `magelang-atcs-smpn-3-magelang-selatan` | ATCS SMPN 3 MAGELANG - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/8fe525a2-3291-494e-813d-3825a3d2e244.m3u8` |
| 70 | `magelang-atcs-smpn-3-magelang-timur` | ATCS SMPN 3 MAGELANG - TIMUR | HLS | `https://dev.cctv.magelangkota.go.id/memfs/fef8e680-46fe-4905-af36-69d84aebd4e1.m3u8` |
| 71 | `magelang-atcs-smpn-3-magelang-pertigaan` | ATCS SMPN 3 MAGELANG - PERTIGAAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/5d5acb18-c099-49a0-8c8b-e444b9b568bf.m3u8` |
| 72 | `magelang-atcs-rumdin-ketua-dprd-selatan` | ATCS RUMDIN KETUA DPRD - SELATAN | HLS | `https://dev.cctv.magelangkota.go.id/memfs/d0133ed3-fc7d-4738-86fb-718df392f2ab.m3u8` |
| 73 | `magelang-atcs-rumdin-ketua-dprd-utara` | ATCS RUMDIN KETUA DPRD - UTARA | HLS | `https://dev.cctv.magelangkota.go.id/memfs/46b6bb7b-7187-480d-81a1-cd1f41a4c128.m3u8` |
| 74 | `magelang-atcs-ptz-taman-a-yani-tengah` | ATCS PTZ TAMAN A YANI TENGAH | HLS | `https://dev.cctv.magelangkota.go.id/memfs/bab55df3-99a6-4c27-ae6c-5158aa9046a4.m3u8` |
| 75 | `magelang-atcs-cctv-simpang-rejowinangun-timur` | ATCS CCTV-SIMPANG REJOWINANGUN TIMUR | HLS | `https://restreamer.magelangkota.go.id/memfs/03cc5b14-207e-4408-a7be-334d3e93e441.m3u8` |

### Bandung (60)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bandung-pelindung-abe1b962` | Antapani-Depan Borma 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Ant.m3u8` |
| 2 | `bandung-pelindung-97d309cb` | Fly Over Cimindi-Jl. Budi 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Flycim.m3u8` |
| 3 | `bandung-pelindung-86a3c665` | Cibaduyut-Dekat Tps 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Cibatps.m3u8` |
| 4 | `bandung-pelindung-569d537f` | Rancanumpang 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/rancanumpangg.m3u8` |
| 5 | `bandung-pelindung-e42b8567` | Terminal Dago 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/IrHJuandaTerminaldago.m3u8` |
| 6 | `bandung-pelindung-c0432895` | Cicendo - Kb Kawung 02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Cicend.m3u8` |
| 7 | `bandung-pelindung-43107932` | Jl Terusan Buah Batu 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/TerusanBuahBatudua.m3u8` |
| 8 | `bandung-pelindung-83416ad6` | Jl Alun Alun Ujung Berung 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Alunalunujungberungdua.m3u8` |
| 9 | `bandung-pelindung-d37180c3` | Taman Sumbersari 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/sumbersari.m3u8` |
| 10 | `bandung-pelindung-262c610e` | Jl Soeta Metro Dealer Mercy 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/SoetaMetrodealerMercydua.m3u8` |
| 11 | `bandung-pelindung-4b1b0474` | Martanegara Satpol Pp 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/martanegaraa.m3u8` |
| 12 | `bandung-pelindung-c97b58f8` | Setiabudi-Bungur 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Setiabudibung.m3u8` |
| 13 | `bandung-pelindung-5154aca4` | Borma Cikutra 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/CIKUT.m3u8` |
| 14 | `bandung-pelindung-9c356f52` | Jl. Arcamanik 02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Arca.m3u8` |
| 15 | `bandung-pelindung-858c03a0` | Soekarno Hatta-Gedebage 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Soekarnogede.m3u8` |
| 16 | `bandung-pelindung-84150db0` | Setiabudi Depan Terminal Ledeng 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Setiabudidepanterminal.m3u8` |
| 17 | `bandung-pelindung-48a4d270` | Batas Kota 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/BatasKo.m3u8` |
| 18 | `bandung-pelindung-aa8a910f` | Mtoha-Bkr_01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Mohtohabkr.m3u8` |
| 19 | `bandung-pelindung-9a0ca0c6` | Jl Soekarno Hatta-Kpu 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Soettakp.m3u8` |
| 20 | `bandung-pelindung-426c19c5` | Taman Tugu Pramuka | HLS | `https://pelindung.bandung.go.id:3443/video/DPKP3/tamankitrisatu.m3u8` |
| 21 | `bandung-pelindung-2862828c` | Moh Toha-Rs Sartika Asih 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Tohr.m3u8` |
| 22 | `bandung-pelindung-375fca14` | Jl. Sutami 02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Suta.m3u8` |
| 23 | `bandung-pelindung-12ec8572` | Dago 2-Sma 1 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Dagsm.m3u8` |
| 24 | `bandung-pelindung-8d309d2f` | Husein 03 - St Halte | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/huse.m3u8` |
| 25 | `bandung-pelindung-f23f6010` | Kopo-Rs Bandung Kiwari 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Kopors.m3u8` |
| 26 | `bandung-pelindung-aab86fdd` | Jl Waas Batununggal 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/WaaspertigaankompleksBatununggaldua.m3u8` |
| 27 | `bandung-pelindung-7a9ddcb8` | Pasar Kiaracondong 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/pasarkircon.m3u8` |
| 28 | `bandung-pelindung-07565841` | Cicabe_02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/CIC.m3u8` |
| 29 | `bandung-pelindung-8ae5aac8` | Jl Kopo Sebrang Miko Mall 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Koposebrangmikomall.m3u8` |
| 30 | `bandung-pelindung-05d5d4bd` | Pasteur Jl Dr Djunjunan Btc 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/DrDjunjunanBTC.m3u8` |
| 31 | `bandung-pelindung-bf0b1dea` | Tb Jl. Cikutra | HLS | `https://pelindung.bandung.go.id:3443/video/DPU/cikutra.m3u8` |
| 32 | `bandung-pelindung-eff14296` | Tb Jl. Cingised | HLS | `https://pelindung.bandung.go.id:3443/video/DPU/cingised.m3u8` |
| 33 | `bandung-pelindung-b7a9cf9a` | Jamika_01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/JAMIKA.m3u8` |
| 34 | `bandung-pelindung-82b05e71` | Jl. Antapani-Terminal Antapani 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Anter.m3u8` |
| 35 | `bandung-pelindung-7460522e` | Pasteur-Pasopati_02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/PAST.m3u8` |
| 36 | `bandung-pelindung-125878e8` | Cimindi-Jembatan_02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/CIMIND.m3u8` |
| 37 | `bandung-pelindung-3064ce25` | Jl Cigadung 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Cigadungdua.m3u8` |
| 38 | `bandung-pelindung-0f40fe36` | Burangrang Bpi 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/burangrangbpi.m3u8` |
| 39 | `bandung-pelindung-cb1349e1` | Pertigaan Ah Nasution-Cijambe 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Pernas.m3u8` |
| 40 | `bandung-pelindung-e80aecb0` | Jl. Rumah Sakit-Cinambo 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Rumahsak.m3u8` |
| 41 | `bandung-pelindung-2c4a8c55` | Kepatihan Tengah 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/KepatihanTengahh.m3u8` |
| 42 | `bandung-pelindung-cd11efa4` | Jakarta-Hkbp_02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/JAK.m3u8` |
| 43 | `bandung-pelindung-536cec86` | Jl Ambon Saparua 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/ambonsaparua.m3u8` |
| 44 | `bandung-pelindung-bc5559bc` | Katamso 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Katamsok.m3u8` |
| 45 | `bandung-pelindung-e9924905` | Simpang Dago 02 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/DAG.m3u8` |
| 46 | `bandung-pelindung-03db0d08` | Kopo Bizpark / Dpn Bri Kopo 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/KOPOBizpark.m3u8` |
| 47 | `bandung-pelindung-60a7a17c` | Jl. Turangga 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/Turangga.m3u8` |
| 48 | `bandung-pelindung-d24dc7d9` | Pasar Pagarsih - Jamika 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HUAWEI/Pagarsihh.m3u8` |
| 49 | `bandung-pelindung-f6429b7e` | Sudirman-Kemenag 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Sudikem.m3u8` |
| 50 | `bandung-pelindung-b660163f` | Cihampelas-Gandok 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Cihampelasgan.m3u8` |
| 51 | `bandung-pelindung-5bed9825` | Kebon-Kopi-Cimahi | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/KEBON.m3u8` |
| 52 | `bandung-pelindung-839965f2` | Tamblong 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Tamblong.m3u8` |
| 53 | `bandung-pelindung-67881881` | Sor Arcamanik-1 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Viadua.m3u8` |
| 54 | `bandung-pelindung-2445b23b` | Tamansari Unisba 02 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/unisbaa.m3u8` |
| 55 | `bandung-pelindung-5eb7d676` | Pasar Sederhana 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/pasarsederhana.m3u8` |
| 56 | `bandung-pelindung-501f4c5c` | Gasibu_01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/GASIBU.m3u8` |
| 57 | `bandung-pelindung-9ead58c2` | Kircon_01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/KIRCON.m3u8` |
| 58 | `bandung-pelindung-fc06df7c` | Bubat Kordon 01 | HLS | `https://pelindung.bandung.go.id:3443/video/DAHUA/BUB.m3u8` |
| 59 | `bandung-pelindung-89f1a472` | Perempatan Laswi-Gatsu 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/Perlas.m3u8` |
| 60 | `bandung-pelindung-727f72ba` | Cicadas - Cikutra 01 | HLS | `https://pelindung.bandung.go.id:3443/video/HIKSVISION/cicadasstyusup.m3u8` |

### Semarang (59)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `semarang-atcs-kyai-saleh` | ATCS KYAI SALEH | HLS | `https://livepantau.semarangkota.go.id/ba20c7a2-f499-48c4-af4f-815068f678a0/index.m3u8` |
| 2 | `semarang-atcs-thamrin-pandanaran-360` | ATCS THAMRIN PANDANARAN 360 | HLS | `https://livepantau.semarangkota.go.id/162c2b72-d3a6-490e-b15e-eca621897f3b/index.m3u8` |
| 3 | `semarang-atcs-kalibanteng` | ATCS KALIBANTENG | HLS | `https://livepantau.semarangkota.go.id/14692ada-0bf1-4da9-bd4f-13a926804958/index.m3u8` |
| 4 | `semarang-atcs-kalibanteng-2` | ATCS KALIBANTENG 2 | HLS | `https://livepantau.semarangkota.go.id/c5e748d2-ee65-4a81-91d7-07085a6fad50/index.m3u8` |
| 5 | `semarang-atcs-simp-exit-tol-krapyak-360` | ATCS SIMP EXIT TOL KRAPYAK 360 | HLS | `https://livepantau.semarangkota.go.id/5bcd5bbc-91fb-4496-bcc9-a362ec48a7f0/index.m3u8` |
| 6 | `semarang-atcs-kariadi` | ATCS KARIADI | HLS | `https://livepantau.semarangkota.go.id/30993efa-38bc-42f7-a74e-7044fe42e3a9/index.m3u8` |
| 7 | `semarang-atcs-polda-360` | ATCS POLDA 360 | HLS | `https://livepantau.semarangkota.go.id/74ffdc80-264f-4028-94cc-4ede386b0340/index.m3u8` |
| 8 | `semarang-atcs-fatmawati` | ATCS FATMAWATI | HLS | `https://livepantau.semarangkota.go.id/5d13ca45-d96a-43b0-af69-6b01c5168305/index.m3u8` |
| 9 | `semarang-atcs-jrakah` | ATCS JRAKAH | HLS | `https://livepantau.semarangkota.go.id/cd99f288-896a-4e73-9d8c-275ac0008a7d/index.m3u8` |
| 10 | `semarang-atcs-sp-akpol` | ATCS SP. AKPOL | HLS | `https://livepantau.semarangkota.go.id/ceda53cc-7431-4e23-aa31-ccc312deac09/index.m3u8` |
| 11 | `semarang-atcs-simpang-lima-2` | ATCS SIMPANG LIMA 2 | HLS | `https://livepantau.semarangkota.go.id/7af16225-3215-49b7-8966-d649a947960d/index.m3u8` |
| 12 | `semarang-atcs-kaliwiru` | ATCS KALIWIRU | HLS | `https://livepantau.semarangkota.go.id/cbb3e887-84c4-43c7-9e70-913dc8f460fd/index.m3u8` |
| 13 | `semarang-atcs-pucang-gading` | ATCS PUCANG GADING | HLS | `https://livepantau.semarangkota.go.id/6fc25748-f6d0-48e9-8c7b-b1489c1765af/index.m3u8` |
| 14 | `semarang-atcs-bea-cukai` | ATCS BEA CUKAI | HLS | `https://livepantau.semarangkota.go.id/e74537ad-d4d8-4230-8144-d371eda979f4/index.m3u8` |
| 15 | `semarang-atcs-tugumuda-2-wide` | ATCS TUGUMUDA 2 WIDE | HLS | `https://livepantau.semarangkota.go.id/26306fea-44d0-4fa7-a82d-c153e86deaa2/index.m3u8` |
| 16 | `semarang-atcs-indraprasta-imam-bonjol` | ATCS INDRAPRASTA-IMAM BONJOL | HLS | `https://livepantau.semarangkota.go.id/0b44f5b2-780d-4f86-9ecd-801041b8925a/index.m3u8` |
| 17 | `semarang-atcs-simpang-thamrin` | ATCS SIMPANG THAMRIN | HLS | `https://livepantau.semarangkota.go.id/3278760a-a203-4eb4-a331-3519eeb6bd1a/index.m3u8` |
| 18 | `semarang-atcs-batan-thamrin` | ATCS BATAN-THAMRIN | HLS | `https://livepantau.semarangkota.go.id/db2df515-cb51-4163-ba76-11d6d9f1b9a4/index.m3u8` |
| 19 | `semarang-atcs-exit-tol-srondol` | ATCS EXIT TOL SRONDOL | HLS | `https://livepantau.semarangkota.go.id/c3814165-b28d-4a32-b33f-007a8e412003/index.m3u8` |
| 20 | `semarang-atcs-simp-sukun` | ATCS SIMP SUKUN | HLS | `https://livepantau.semarangkota.go.id/b5e002b6-9d51-4055-a56c-690b773bd809/index.m3u8` |
| 21 | `semarang-atcs-kaligarang` | ATCS KALIGARANG | HLS | `https://livepantau.semarangkota.go.id/c118ec35-b342-4b76-927e-672d5b5c53d6/index.m3u8` |
| 22 | `semarang-atcs-titik-nol` | ATCS TITIK NOL | HLS | `https://livepantau.semarangkota.go.id/a0deaf08-a8f1-415a-9315-d1424f0ef9fb/index.m3u8` |
| 23 | `semarang-atcs-jembatan-mberok` | ATCS JEMBATAN MBEROK | HLS | `https://livepantau.semarangkota.go.id/ac03c11b-4aa8-4311-a2c3-1dcdf12e33ab/index.m3u8` |
| 24 | `semarang-atcs-fly-over-jatingaleh-wide` | ATCS FLY OVER JATINGALEH WIDE | HLS | `https://livepantau.semarangkota.go.id/5b09107f-81a6-4e14-b9b7-7712ef5aef7a/index.m3u8` |
| 25 | `semarang-atcs-dpu-kel-wonosari` | ATCS DPU-KEL.WONOSARI | HLS | `https://livepantau.semarangkota.go.id/02066f7c-0377-45c9-8804-f3ad65569ed0/index.m3u8` |
| 26 | `semarang-atcs-dpu-terowongan-soetta-usm` | ATCS DPU-TEROWONGAN SOETTA USM | HLS | `https://livepantau.semarangkota.go.id/41f054be-4f47-46f3-b5eb-263c82ada1f5/index.m3u8` |
| 27 | `semarang-atcs-dpu-pahlawan` | ATCS DPU_PAHLAWAN | HLS | `https://livepantau.semarangkota.go.id/c954ee49-2de6-4e7e-be98-8e17c659f9a9/index.m3u8` |
| 28 | `semarang-atcs-bukit-sari` | ATCS BUKIT SARI | HLS | `https://livepantau.semarangkota.go.id/4ff40187-00a9-440f-9256-9c0a89af55aa/index.m3u8` |
| 29 | `semarang-atcs-patung-diponegoro-360` | ATCS PATUNG DIPONEGORO 360 | HLS | `https://livepantau.semarangkota.go.id/533f1fdf-bc9d-44e4-ae3e-fdee94061cd5/index.m3u8` |
| 30 | `semarang-atcs-pasar-banyumanik` | ATCS PASAR BANYUMANIK | HLS | `https://livepantau.semarangkota.go.id/190e60ca-44df-4bb1-840b-7a0ccf35f169/index.m3u8` |
| 31 | `semarang-atcs-counting-banyumanik` | ATCS COUNTING BANYUMANIK | HLS | `https://livepantau.semarangkota.go.id/68322b26-693f-479a-84a0-4ba700ec3c41/index.m3u8` |
| 32 | `semarang-atcs-counting-krapyak` | ATCS COUNTING KRAPYAK | HLS | `https://livepantau.semarangkota.go.id/60690ef5-ec79-4020-ae17-788a9df42566/index.m3u8` |
| 33 | `semarang-atcs-bawah-tol-x3w-in` | ATCS BAWAH TOL X3W_IN | HLS | `https://livepantau.semarangkota.go.id/9b4a952d-5ebd-45a3-8dc6-e04d44851f51/index.m3u8` |
| 34 | `semarang-atcs-tugumuda-2` | ATCS TUGUMUDA 2 | HLS | `https://livepantau.semarangkota.go.id/0f310a61-9d28-4f03-845d-daa815b72ccf/index.m3u8` |
| 35 | `semarang-atcs-pahlawan-ptz-1` | ATCS PAHLAWAN PTZ 1 | HLS | `https://livepantau.semarangkota.go.id/41bedb9a-b93f-4f7d-b1a4-b6d0bc166c7d/index.m3u8` |
| 36 | `semarang-atcs-pahlawan-ptz-2` | ATCS PAHLAWAN PTZ 2 | HLS | `https://livepantau.semarangkota.go.id/d7fa15ea-df64-4865-a24e-32a333b17207/index.m3u8` |
| 37 | `semarang-atcs-pahlawan-180` | ATCS PAHLAWAN 180 | HLS | `https://livepantau.semarangkota.go.id/5a9b5e8f-3336-4a0a-8fe0-6a7e48c43c1f/index.m3u8` |
| 38 | `semarang-atcs-pahlawan-rimba-graha` | ATCS PAHLAWAN - RIMBA GRAHA | HLS | `https://livepantau.semarangkota.go.id/98291649-01d5-46a0-9f7b-204c48a2e139/index.m3u8` |
| 39 | `semarang-atcs-pahlawan-bundaran-air-mancur` | ATCS PAHLAWAN - BUNDARAN AIR MANCUR | HLS | `https://livepantau.semarangkota.go.id/0b552199-1ac2-45b0-9096-7c9e1b3848d1/index.m3u8` |
| 40 | `semarang-atcs-sriwijaya-02` | ATCS SRIWIJAYA 02 | HLS | `https://livepantau.semarangkota.go.id/b23731ab-2aae-4bd0-8b22-2c47d8461f1a/index.m3u8` |
| 41 | `semarang-atcs-sriwijaya-01` | ATCS SRIWIJAYA 01 | HLS | `https://livepantau.semarangkota.go.id/8eb25438-c8d3-4c8d-98fd-be74d14df3fa/index.m3u8` |
| 42 | `semarang-atcs-simpang-tentrem-mall` | ATCS SIMPANG TENTREM MALL | HLS | `https://livepantau.semarangkota.go.id/873d1c8c-56d6-4918-906f-514cbbce5ea4/index.m3u8` |
| 43 | `semarang-atcs-simpang-wagisan-taman-kasmaran` | ATCS SIMPANG WAGISAN TAMAN KASMARAN | HLS | `https://livepantau.semarangkota.go.id/7a8e0b4a-af0c-4b65-a43f-fe441c4bf4d3/index.m3u8` |
| 44 | `semarang-atcs-metro-johar` | ATCS METRO JOHAR | HLS | `https://livepantau.semarangkota.go.id/20fbd70b-a1df-4fa1-a3fa-1115a6bf43d8/index.m3u8` |
| 45 | `semarang-atcs-ruas-kerapyak` | ATCS RUAS KERAPYAK | HLS | `https://livepantau.semarangkota.go.id/f058e160-742f-4960-a47f-ad1fc5354bd4/index.m3u8` |
| 46 | `semarang-atcs-karangayu-ke-barat` | ATCS KARANGAYU KE BARAT | HLS | `https://livepantau.semarangkota.go.id/0305a054-bb38-42f9-801b-113385baa0f6/index.m3u8` |
| 47 | `semarang-atcs-jpo-jalan-ahmad-yani` | ATCS JPO JALAN AHMAD YANI | HLS | `https://livepantau.semarangkota.go.id/5e20c403-7f34-4749-8f56-3863711e0d38/index.m3u8` |
| 48 | `semarang-atcs-bangkong` | ATCS BANGKONG | HLS | `https://livepantau.semarangkota.go.id/b8013256-1adc-4d5f-aed6-b28ed7d0b52e/index.m3u8` |
| 49 | `semarang-atcs-milo` | ATCS MILO | HLS | `https://livepantau.semarangkota.go.id/1e056193-d64c-4e53-84a1-41a55d373ad0/index.m3u8` |
| 50 | `semarang-atcs-simpang-kariadi-ptz` | ATCS SIMPANG KARIADI PTZ | HLS | `https://livepantau.semarangkota.go.id/5ed366a4-fec8-43b4-9052-6fe9a3fd5847/index.m3u8` |
| 51 | `semarang-atcs-supriyadi` | ATCS SUPRIYADI | HLS | `https://livepantau.semarangkota.go.id/75722eec-3065-4f02-b1a3-c6ec259dc52b/index.m3u8` |
| 52 | `semarang-atcs-pasar-kambing-360` | ATCS PASAR KAMBING 360 | HLS | `https://livepantau.semarangkota.go.id/67435362-8242-4f71-bf82-6c4f899a665e/index.m3u8` |
| 53 | `semarang-atcs-hanoman` | ATCS HANOMAN | HLS | `https://livepantau.semarangkota.go.id/c83dfda9-1e9e-4b8a-8c83-f7396d7781e4/index.m3u8` |
| 54 | `semarang-atcs-bergota-360` | ATCS BERGOTA 360 | HLS | `https://livepantau.semarangkota.go.id/0ccddd03-b302-458c-8618-69807ff6622c/index.m3u8` |
| 55 | `semarang-atcs-bundaran-diponegoro` | ATCS BUNDARAN DIPONEGORO | HLS | `https://livepantau.semarangkota.go.id/c878988b-26b8-48ee-8352-4c5abfb61275/index.m3u8` |
| 56 | `semarang-atcs-tlogosari` | ATCS TLOGOSARI | HLS | `https://livepantau.semarangkota.go.id/c3ecd247-0994-4147-a90e-dd1917700580/index.m3u8` |
| 57 | `semarang-atcs-arah-tugu-tunas` | ATCS ARAH TUGU TUNAS | HLS | `https://livepantau.semarangkota.go.id/9468fa0e-c92f-4178-a9b6-3e94af0f456d/index.m3u8` |
| 58 | `semarang-atcs-mt-haryono` | ATCS MT Haryono | HLS | `https://livepantau.semarangkota.go.id/ece9e864-bdbb-4db5-a8f3-30ddd7c2bebf/index.m3u8` |
| 59 | `semarang-atcs-arah-pandanaran` | ATCS ARAH PANDANARAN | HLS | `https://livepantau.semarangkota.go.id/78e494b8-4873-4bfd-96ad-a319358e3f21/index.m3u8` |

### Banda Aceh (47)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bandaaceh-atcs-b-salatin-8-ptz` | B Salatin 8 PTZ | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/fc8168e4-868c-4492-8468-4998ffd4f8f3.m3u8` |
| 2 | `bandaaceh-atcs-bustanussalatin-2` | Bustanussalatin 2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/021969d5-9423-48e7-8da3-1fb9a60d90dd.m3u8` |
| 3 | `bandaaceh-atcs-bustanussalatin-4` | Bustanussalatin 4 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/c7afe47d-fc16-4080-9c41-5b042078febf.m3u8` |
| 4 | `bandaaceh-atcs-bustanussalatin-5` | Bustanussalatin 5 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/5f988854-a6b6-4a9e-8c50-8a5aad4978df.m3u8` |
| 5 | `bandaaceh-atcs-bustanussalatin-6` | Bustanussalatin 6 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/b01a5c35-e3b0-4a61-a09d-62778b65ffee.m3u8` |
| 6 | `bandaaceh-atcs-bustanussalatin-7` | Bustanussalatin 7 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/5031c4f6-655d-4610-9adf-85a0f5f3b52e.m3u8` |
| 7 | `bandaaceh-atcs-diponegoro-1` | Diponegoro 1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/563a15fa-e447-4ae1-a779-165693035eed.m3u8` |
| 8 | `bandaaceh-atcs-diponegoro-190-view` | Diponegoro 190 View | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/4b901db2-a552-4e8f-a8c4-eddda4664fcc.m3u8` |
| 9 | `bandaaceh-atcs-diponegoro-2` | Diponegoro 2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/14d01de2-7b3b-45aa-b915-68f7aa92edac.m3u8` |
| 10 | `bandaaceh-atcs-diponegoro-3` | Diponegoro 3 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/dee20d21-a2d1-46b0-885f-f52461e1bc28.m3u8` |
| 11 | `bandaaceh-atcs-diponegoro-4` | Diponegoro 4 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/a67393b6-b543-48ae-9eb9-67c6aae29f3a.m3u8` |
| 12 | `bandaaceh-atcs-diponegoro-5` | Diponegoro 5 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/f69d3a9d-1e15-43ac-9d7f-45f37bf9e2b8.m3u8` |
| 13 | `bandaaceh-atcs-diponegoro-sp-ranup` | Diponegoro SP Ranup | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/ed26510d-a708-4529-aa8e-63c9cc34761f.m3u8` |
| 14 | `bandaaceh-atcs-kartini-1` | Kartini 1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/bf50d9cf-9cb4-4dfa-a202-f034e34ba349.m3u8` |
| 15 | `bandaaceh-atcs-kartini-190-view` | Kartini 190 View | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/9835c704-ac25-4433-8c9b-fa1b2854dfcc.m3u8` |
| 16 | `bandaaceh-atcs-kartini-2` | Kartini 2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/54cc9a46-6e66-4a61-b65c-fd148871ba3f.m3u8` |
| 17 | `bandaaceh-atcs-lhong-raya-1` | Lhong Raya 1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/a9cbcff3-4231-4d7b-b35a-b9d127342bd7.m3u8` |
| 18 | `bandaaceh-atcs-lhong-raya-2` | Lhong Raya 2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/6168e513-4cae-4846-8f1d-cc21361e9cd8.m3u8` |
| 19 | `bandaaceh-atcs-lhong-raya-3` | Lhong Raya 3 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/3bd4149b-a158-4918-be5d-6bcf179a5e45.m3u8` |
| 20 | `bandaaceh-atcs-lhong-raya-4` | Lhong Raya 4 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/34bd32ae-f5e0-4b9a-bc3f-da60da6f3a40.m3u8` |
| 21 | `bandaaceh-atcs-lhong-raya-5` | Lhong Raya 5 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/13ff40bd-9ac8-403f-a548-aef70fe66ec7.m3u8` |
| 22 | `bandaaceh-atcs-lhong-raya-dome` | Lhong Raya Dome | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/8a37e1c4-2798-4112-8fa4-3de04e656d29.m3u8` |
| 23 | `bandaaceh-atcs-pantau-ketinggian-air-geuceu-meunara` | Pantau Ketinggian Air - Geuceu Meunara | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/3f3b9dba-fbd5-4a5e-8217-1cc41393dcd7.m3u8` |
| 24 | `bandaaceh-atcs-pantau-ketinggian-air-kampung-baru` | Pantau Ketinggian Air - Kampung Baru | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/74dadb96-1e06-466e-bb67-3c9a45ac6d28.m3u8` |
| 25 | `bandaaceh-atcs-pantau-ketinggian-air-km-0` | Pantau Ketinggian Air - KM 0 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/f80e3d05-1bfa-456c-8da3-0c25bdb44241.m3u8` |
| 26 | `bandaaceh-atcs-pantau-ketinggian-air-putroe-phang` | Pantau Ketinggian Air - Putroe Phang | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/23f96d6f-6abf-4300-b1f9-a0a3486fe0fe.m3u8` |
| 27 | `bandaaceh-atcs-ptz-bundaran-pelabuhan` | PTZ Bundaran Pelabuhan | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/d48d74c5-ae9a-4693-81d9-8218fc3c50d9.m3u8` |
| 28 | `bandaaceh-atcs-ptz-bundaran-pelabuhan-2` | PTZ Bundaran Pelabuhan 2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/79579919-e536-4e8e-9fb8-e573af3bdd7a.m3u8` |
| 29 | `bandaaceh-atcs-ptz-pintu-masuk-pelabuhan` | PTZ Pintu Masuk Pelabuhan | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/695d63b8-7d00-492e-98be-b07049d50dfb.m3u8` |
| 30 | `bandaaceh-atcs-ulee-lheue-1-1` | Ulee Lheue 1.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/6d69d062-c646-4769-836b-726c0aac4c61.m3u8` |
| 31 | `bandaaceh-atcs-ulee-lheue-1-2` | Ulee Lheue 1.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/65e65676-73b9-450b-9548-d1b4b5f7d95c.m3u8` |
| 32 | `bandaaceh-atcs-ulee-lheue-10-1` | Ulee Lheue 10.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/58e5d7c0-8a48-4ef7-95e3-d9f7d3128468.m3u8` |
| 33 | `bandaaceh-atcs-ulee-lheue-10-2` | Ulee Lheue 10.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/606b3d87-3c52-4cfc-bfe9-12eb5f6e5192.m3u8` |
| 34 | `bandaaceh-atcs-ulee-lheue-2-1` | Ulee Lheue 2.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/d42ba716-0f1d-4cee-bc52-5996486e9670.m3u8` |
| 35 | `bandaaceh-atcs-ulee-lheue-3-1` | Ulee Lheue 3.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/f6af3542-9a27-4984-b1d8-55d714ad83fc.m3u8` |
| 36 | `bandaaceh-atcs-ulee-lheue-4-1` | Ulee Lheue 4.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/61304885-5ebf-4ee2-b06e-c178e58ff9c8.m3u8` |
| 37 | `bandaaceh-atcs-ulee-lheue-4-2` | Ulee Lheue 4.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/9b605784-8ee6-47f0-a96c-f5133b000888.m3u8` |
| 38 | `bandaaceh-atcs-ulee-lheue-5-1` | Ulee Lheue 5.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/8372de41-940c-4cad-a72c-2a05ecb8b9f4.m3u8` |
| 39 | `bandaaceh-atcs-ulee-lheue-5-2` | Ulee Lheue 5.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/dbadf9aa-96e3-43e7-95c0-04e95ef2a145.m3u8` |
| 40 | `bandaaceh-atcs-ulee-lheue-6-1` | Ulee Lheue 6.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/2c86b1ff-d015-4fcd-b850-4e85aaa69a95.m3u8` |
| 41 | `bandaaceh-atcs-ulee-lheue-6-2` | Ulee Lheue 6.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/8f2c060c-f252-4356-a47c-e5817244ec67.m3u8` |
| 42 | `bandaaceh-atcs-ulee-lheue-7-1` | Ulee Lheue 7.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/d6077432-f579-475b-aec1-9c5c91a70b0f.m3u8` |
| 43 | `bandaaceh-atcs-ulee-lheue-7-2` | Ulee Lheue 7.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/82b5342a-6359-4624-86f5-6e18feee1043.m3u8` |
| 44 | `bandaaceh-atcs-ulee-lheue-8-1` | Ulee Lheue 8.1 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/50dbc15a-978f-4028-8733-377a96d424b1.m3u8` |
| 45 | `bandaaceh-atcs-ulee-lheue-8-2` | Ulee Lheue 8.2 | HLS | `https://api.bandaacehkota.go.id/cctv/memfs/e8e589b7-1e9a-4854-98ad-18330d8121e1.m3u8` |
| 46 | `bandaaceh-atcs-underpass-beurawe` | Underpass Beurawe | HLS | `https://cctv-stream.bandaacehkota.info/memfs/0b8d9f6d-5b2c-4c6d-a645-438cdf8cdd18.m3u8` |
| 47 | `bandaaceh-atcs-underpass-beurawe-ptz` | Underpass Beurawe PTZ | HLS | `https://cctv-stream.bandaacehkota.info/memfs/4d43bfe3-89a4-4858-9715-51085407a3c0.m3u8` |

### Bandung Barat (45)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bandungbarat-atcs-ciburuy-cipatat` | ATCS CIBURUY - CIPATAT | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/9512d5e6-2424-44f0-869a-4026ea91b2ed.m3u8` |
| 2 | `bandungbarat-atcs-ciburuy-tagog` | ATCS CIBURUY - TAGOG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/99057394-48a9-4806-9f61-cbbd011ae6cf.m3u8` |
| 3 | `bandungbarat-atcs-cikamuning-cihaliwung` | ATCS CIKAMUNING - CIHALIWUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/341ddb06-0eb7-491b-a395-6684b4b1c835.m3u8` |
| 4 | `bandungbarat-atcs-cikamuning-exit-tol` | ATCS CIKAMUNING - EXIT TOL | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/f213ebc0-2e3d-4989-9552-7bbe06599d66.m3u8` |
| 5 | `bandungbarat-atcs-cikamuning-purwakarta` | ATCS CIKAMUNING - PURWAKARTA | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/a103fb59-3c3d-4bf3-b1b1-edc8232fdf48.m3u8` |
| 6 | `bandungbarat-atcs-tagog-padalarang-bandung` | ATCS TAGOG PADALARANG - BANDUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/8c6a68c4-5fa5-44b6-8be5-72860ba26ba8.m3u8` |
| 7 | `bandungbarat-atcs-tagog-padalarang-purwakarta` | ATCS TAGOG PADALARANG - PURWAKARTA | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/02e59fd8-d67a-40b3-bb2c-5f54c7bcadf9.m3u8` |
| 8 | `bandungbarat-atcs-lembang-betrix-bandung` | ATCS LEMBANG BETRIX - BANDUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/ef739a9d-0e90-49db-8fc2-2717f0b62ef6.m3u8` |
| 9 | `bandungbarat-atcs-lembang-betrix-parongpong` | ATCS LEMBANG BETRIX - PARONGPONG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/d860bdd1-7791-49e4-9c1d-975ca897a9d1.m3u8` |
| 10 | `bandungbarat-atcs-citunjung-batujajar` | ATCS CITUNJUNG - BATUJAJAR | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/54b72fb9-43c8-426c-8fbc-9a91bf13f857.m3u8` |
| 11 | `bandungbarat-atcs-farmhouse-lembang` | ATCS FARMHOUSE - LEMBANG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/4936192b-c8b3-43fb-ba9f-14b1099f307c.m3u8` |
| 12 | `bandungbarat-atcs-farmhouse-bandung` | ATCS FARMHOUSE - BANDUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/671df771-b4ea-49f4-a9e9-aac462c3a48c.m3u8` |
| 13 | `bandungbarat-atcs-lembang-unai-cihanjuang` | ATCS LEMBANG UNAI - CIHANJUANG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/71c2b98d-868c-40c1-baae-b34b20480adf.m3u8` |
| 14 | `bandungbarat-atcs-lembang-unai-cisarua` | ATCS LEMBANG UNAI - CISARUA | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/e7a94d54-466a-432a-a57b-896779a3f359.m3u8` |
| 15 | `bandungbarat-atcs-alun-alun-cililin-batujajar` | ATCS ALUN ALUN CILILIN - BATUJAJAR | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/633da1e9-5e53-4721-a03d-3312b3dcb436.m3u8` |
| 16 | `bandungbarat-atcs-alun-alun-cililin-sindangkerta` | ATCS ALUN ALUN CILILIN - SINDANGKERTA | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/ec96824a-6726-4608-8194-83fbbc274a51.m3u8` |
| 17 | `bandungbarat-atcs-padalarang-gedong-5-bawah-stasion` | ATCS PADALARANG - GEDONG 5 BAWAH - STASION | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/5a8e5507-18f9-47ce-8c46-3524862ad6bb.m3u8` |
| 18 | `bandungbarat-atcs-cimareme-1-cimahi` | ATCS CIMAREME 1 - CIMAHI | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/4a69fe99-674c-4d18-b58c-b1d3133d7626.m3u8` |
| 19 | `bandungbarat-atcs-lembang-grand-hotel-bandung` | ATCS LEMBANG - GRAND HOTEL - BANDUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/1e9f3cc5-58b9-4169-b959-5e26d4283db7.m3u8` |
| 20 | `bandungbarat-atcs-lembang-unai-lembang` | ATCS LEMBANG UNAI - LEMBANG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/dd2489bc-de9f-4b67-a95c-d4952fa11a69.m3u8` |
| 21 | `bandungbarat-atcs-padalarang-gedong-5-atas-cihaliwung` | ATCS PADALARANG - GEDONG 5 ATAS - CIHALIWUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/b50d64f1-7fdc-4c58-942d-bb018327e174.m3u8` |
| 22 | `bandungbarat-atcs-padalarang-gedong-5-atas-kertajaya` | ATCS PADALARANG - GEDONG 5 ATAS - KERTAJAYA | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/9bd7d138-361e-40e2-aabb-508d9b7d54eb.m3u8` |
| 23 | `bandungbarat-atcs-padalarang-gedong-5-bawah-tol` | ATCS PADALARANG - GEDONG 5 BAWAH - TOL | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/7885b4db-a93f-4e0c-ada4-9f11ca8809e5.m3u8` |
| 24 | `bandungbarat-atcs-padalarang-gedong-5-atas-stasiun` | ATCS PADALARANG - GEDONG 5 ATAS - STASIUN | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/f2648f57-eef6-49bf-9180-5dc071521f4f.m3u8` |
| 25 | `bandungbarat-atcs-padalarang-giant-tagog` | ATCS PADALARANG - GIANT - TAGOG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/ac902612-1f98-43ff-9d0c-b0f1a8d7d6a1.m3u8` |
| 26 | `bandungbarat-atcs-padalarang-jl-baru-kbp-tol` | ATCS PADALARANG - JL. BARU KBP - TOL | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/f7f61926-3166-4ba1-9e90-3fcf269497c7.m3u8` |
| 27 | `bandungbarat-atcs-padalarang-purabaya-cipatat` | ATCS PADALARANG - PURABAYA - CIPATAT | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/c43816f8-f487-4b51-af04-a7cce245d4ef.m3u8` |
| 28 | `bandungbarat-atcs-padalarang-purabaya-kavaleri` | ATCS PADALARANG - PURABAYA - KAVALERI | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/a8a70d7d-0265-4ddb-be0e-9e6438728604.m3u8` |
| 29 | `bandungbarat-atcs-padalarang-purabaya-tagog` | ATCS PADALARANG - PURABAYA - TAGOG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/e6549612-e618-4dc5-8e75-086ec0d8140c.m3u8` |
| 30 | `bandungbarat-atcs-padalarang-giant-tol` | ATCS PADALARANG GIANT - TOL | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/d2e6bcb6-e6d5-4c0f-81c6-134e1345c8b5.m3u8` |
| 31 | `bandungbarat-atcs-cimareme-1-padalarang` | ATCS CIMAREME 1 - PADALARANG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/6d7e169d-d11b-43bd-b8c1-fe58cdc60cda.m3u8` |
| 32 | `bandungbarat-atcs-padalarang-cihaliwung-cikalong` | ATCS PADALARANG - CIHALIWUNG - CIKALONG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/67968ed3-ded3-4b14-8e65-792ad566f7fe.m3u8` |
| 33 | `bandungbarat-atcs-padalarang-cihaliwung-stasiun` | ATCS PADALARANG - CIHALIWUNG - STASIUN | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/8ec35155-b847-41a8-8387-68cfb2ad184b.m3u8` |
| 34 | `bandungbarat-atcs-simpang-bbs-cililin` | ATCS SIMPANG BBS - CILILIN | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/1372824f-a99d-450b-a614-5fddb49bb96f.m3u8` |
| 35 | `bandungbarat-atcs-simpang-bbs-cipatik` | ATCS SIMPANG BBS - CIPATIK | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/08f471e0-ea5b-4867-bb9d-8dce1a3c26dd.m3u8` |
| 36 | `bandungbarat-atcs-langensari-cibodas` | ATCS LANGENSARI - CIBODAS | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/2946e37c-f05e-4c1c-96de-0a873d375f4c.m3u8` |
| 37 | `bandungbarat-atcs-langensari-sespim` | ATCS LANGENSARI - SESPIM | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/ea81b6aa-211a-4f0b-9b5c-68a38426ca8c.m3u8` |
| 38 | `bandungbarat-atcs-cangkorah-leuwigajah` | ATCS CANGKORAH - LEUWIGAJAH | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/a1dba728-28bb-4ba5-86b4-a898cfeb1753.m3u8` |
| 39 | `bandungbarat-atcs-cangkorah-cimareme` | ATCS CANGKORAH - CIMAREME | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/86bf138e-01b3-4724-b2c1-ff5782b326fe.m3u8` |
| 40 | `bandungbarat-atcs-cangkorah-batujajar` | ATCS CANGKORAH - BATUJAJAR | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/71ea14f7-d25b-48db-8afe-b48531eb4206.m3u8` |
| 41 | `bandungbarat-atcs-warung-pulus-cimareme` | ATCS WARUNG PULUS - CIMAREME | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/372cc649-a609-4613-9414-3f38ee52e5ff.m3u8` |
| 42 | `bandungbarat-atcs-lembang-orchid-bandung` | ATCS LEMBANG ORCHID - BANDUNG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/1206e494-60c6-4367-9780-2d6ea50ab578.m3u8` |
| 43 | `bandungbarat-atcs-lembang-orchid-subang` | ATCS LEMBANG ORCHID - SUBANG | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/a260f274-0b48-41b4-90bf-ec4f1e059d5c.m3u8` |
| 44 | `bandungbarat-atcs-padalarang-flyover-cimareme` | ATCS PADALARANG FLYOVER - CIMAREME | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/ec13c486-5008-4006-83c5-04be0b075e54.m3u8` |
| 45 | `bandungbarat-atcs-padalarang-flyover-kbp` | ATCS PADALARANG FLYOVER - KBP | HLS | `https://atcs-dishubkbb.urbanaccess.net/memfs/dfa0a451-adae-4309-98fb-53851b5c2e14.m3u8` |

### Cianjur (44)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `cianjur-atcs-bundaran-lampu-gentur-dari-arah-dr-muwardi` | ATCS BUNDARAN LAMPU GENTUR DARI ARAH DR. MUWARDI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/Tugu-Gentur-DrMuwahrdi.m3u8` |
| 2 | `cianjur-atcs-bundaran-lampu-gentur-dari-arah-selakopi` | ATCS BUNDARAN LAMPU GENTUR DARI ARAH SELAKOPI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/ArahSalakopi.m3u8` |
| 3 | `cianjur-atcs-bundaran-lampu-gentur` | ATCS BUNDARAN LAMPU GENTUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/BundaranTuguGentur.m3u8` |
| 4 | `cianjur-atcs-simpang-4-toko-lili-dari-arah-warujajar` | ATCS SIMPANG 4 TOKO LILI DARI ARAH WARUJAJAR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/9MISv95WwEtJ1767185263301.m3u8` |
| 5 | `cianjur-atcs-simpang-4-toko-lili-dari-arah-suroso` | ATCS SIMPANG 4 TOKO LILI DARI ARAH SUROSO | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/liliarahsuroso.m3u8` |
| 6 | `cianjur-atcs-simpang-3-leuwi-bungur` | ATCS SIMPANG 3 LEUWI BUNGUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SP3-Lewibungur.m3u8` |
| 7 | `cianjur-atcs-simpang-3-cikidang` | ATCS SIMPANG 3 CIKIDANG | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SP3Cikidang.m3u8` |
| 8 | `cianjur-atcs-simpang-3-moch-ali` | ATCS SIMPANG 3 MOCH. ALI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/wi0mimnjBcHE1762834916806.m3u8` |
| 9 | `cianjur-atcs-sp3-ciranjang-arah-cianjur` | ATCS SP3 CIRANJANG ARAH CIANJUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/JUJZgRKmDFTA1759501774067.m3u8` |
| 10 | `cianjur-atcs-tugu-tauco-arah-ramayana` | ATCS TUGU TAUCO ARAH RAMAYANA | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/TaucoArahRamayana.m3u8` |
| 11 | `cianjur-atcs-sp3-suge-2` | ATCS SP3_SUGE 2 | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SugeArahHypermart.m3u8` |
| 12 | `cianjur-atcs-sp3-suge-1` | ATCS SP3 _SUGE 1 | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SugeArahtokoLili.m3u8` |
| 13 | `cianjur-atcs-simpang-4-warungkondang` | ATCS SIMPANG 4 WARUNGKONDANG | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/5YK77KVsswMU1762835161499.m3u8` |
| 14 | `cianjur-atcs-simpang-4-blk` | ATCS SIMPANG 4 BLK | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SP4BLK.m3u8` |
| 15 | `cianjur-atcs-simpang-4-dishub-dari-arah-bandung` | ATCS SIMPANG 4 DISHUB DARI ARAH BANDUNG | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/l6jrThL3NKVN1761906420028.m3u8` |
| 16 | `cianjur-atcs-simpang-4-dishub-arah-ramayana` | ATCS SIMPANG 4 DISHUB ARAH RAMAYANA | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SP4_Dishub_PTZ_2.m3u8` |
| 17 | `cianjur-atcs-simpang-3-rsud-cianjur` | ATCS SIMPANG 3 RSUD CIANJUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/SP3RSUD.m3u8` |
| 18 | `cianjur-atcs-simpang-3-sasak` | ATCS SIMPANG 3 SASAK | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sasak1.m3u8` |
| 19 | `cianjur-atcs-simpang-3-sasak-arah-pupr` | ATCS SIMPANG 3 SASAK ARAH PUPR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sasak2.m3u8` |
| 20 | `cianjur-atcs-sp-3-ciranjang-arah-bandung` | ATCS SP 3 CIRANJANG ARAH BANDUNG | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/pjdoCuZQu1Yj1759502012203.m3u8` |
| 21 | `cianjur-atcs-sp-4-syanghai` | ATCS SP-4-SYANGHAI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/syanghai2.m3u8` |
| 22 | `cianjur-atcs-tugu-tauhid` | ATCS TUGU TAUHID | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sp3tauhid.m3u8` |
| 23 | `cianjur-atcs-sp3-siliwangi-bri` | ATCS SP3 SILIWANGI BRI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sp3bri.m3u8` |
| 24 | `cianjur-atcs-ruas-jl-pasar-cipana` | ATCS RUAS JL PASAR CIPANA | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/pasarcipanas.m3u8` |
| 25 | `cianjur-atcs-tugu-tauco-arah-dr-muwardi` | ATCS TUGU TAUCO ARAH DR MUWARDI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/Muwardi.m3u8` |
| 26 | `cianjur-atcs-sp3-ariaciko` | ATCS SP3 ARIACIKO | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sp3arciko.m3u8` |
| 27 | `cianjur-atcs-sp-3-warujajar` | ATCS SP 3 WARUJAJAR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sp3warujajar.m3u8` |
| 28 | `cianjur-atcs-sp-4-toko-lili` | ATCS SP 4 TOKO LILI | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/lili2.m3u8` |
| 29 | `cianjur-atcs-ruas-jl-raya-cipanas-bogor` | ATCS RUAS JL RAYA CIPANAS BOGOR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/restarea.m3u8` |
| 30 | `cianjur-atcs-alun-alun-cianjur` | ATCS ALUN-ALUN CIANJUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/alun2.m3u8` |
| 31 | `cianjur-atcs-botol-kecap-ciloto` | ATCS BOTOL KECAP CILOTO | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/3YzQ31YkgWev1761663382284.m3u8` |
| 32 | `cianjur-atcs-sp4-blk-arah-p-hidayatullah` | ATCS SP4 BLK ARAH P. HIDAYATULLAH | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/7W4ePyjThVbO1761717099598.m3u8` |
| 33 | `cianjur-atcs-sp3-arwinda` | ATCS SP3 ARWINDA | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/Nv99JIMs9oIW1768059019707.m3u8` |
| 34 | `cianjur-atcs-sp-jebrod-2` | ATCS SP JEBROD 2 | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/sp4jebrod.m3u8` |
| 35 | `cianjur-atcs-terminal-pasir-hayam` | ATCS TERMINAL PASIR HAYAM | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/EQxn3obUMd0q1773768668125.m3u8` |
| 36 | `cianjur-atcs-tugu-meong` | ATCS TUGU MEONG | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/dD2zYtOKEbNi1773782706885.m3u8` |
| 37 | `cianjur-atcs-sp-3-pasundan` | ATCS SP 3 PASUNDAN | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/XHoJ2K2gwaO71773842442254.m3u8` |
| 38 | `cianjur-atcs-sp-3-bpk-penabur` | ATCS SP 3 BPK PENABUR | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/97H6ydBcJiyX1773842763624.m3u8` |
| 39 | `cianjur-atcs-sp-3-dinkes` | ATCS SP 3 DINKES | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/Ng4y81piML301773843415582.m3u8` |
| 40 | `cianjur-atcs-sp-3-pasar-beas` | ATCS SP 3 PASAR BEAS | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/WNy2drGIXPfb1773843655801.m3u8` |
| 41 | `cianjur-atcs-sp-3-pataruman` | ATCS SP 3 PATARUMAN | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/mny1jPJpFmm61773843673567.m3u8` |
| 42 | `cianjur-atcs-sp-3-moch-ali-iqro` | ATCS SP 3 MOCH ALI (IQRO) | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/MgNBwAYABDbp1773845095590.m3u8` |
| 43 | `cianjur-atcs-spbu-blk` | ATCS SPBU BLK | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/yD3PioSMyiem1773845412150.m3u8` |
| 44 | `cianjur-atcs-sp-4-pasir-honje-h-didi` | ATCS SP 4 PASIR HONJE (H.DIDI) | HLS | `https://atcs.cianjurkab.go.id:5443/LieApp/streams/J9SGRvcZfYMa1780671285063.m3u8` |

### Bukittinggi (39)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bukittinggi-atcs-simpang-pasar-banto-d1` | ATCS Simpang Pasar Banto D1 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d1/s.m3u8` |
| 2 | `bukittinggi-atcs-simpang-bni-d2` | ATCS Simpang BNI D2 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d2/s.m3u8` |
| 3 | `bukittinggi-atcs-batas-kota-birugo-d4` | ATCS Batas Kota Birugo D4 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d4/s.m3u8` |
| 4 | `bukittinggi-atcs-batas-kota-birugo-d45` | ATCS Batas Kota Birugo D45 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d45/s.m3u8` |
| 5 | `bukittinggi-atcs-simpang-aur-d5` | ATCS Simpang Aur D5 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d5/s.m3u8` |
| 6 | `bukittinggi-atcs-simpang-surau-gadang-d9` | ATCS Simpang Surau Gadang D9 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d9/s.m3u8` |
| 7 | `bukittinggi-atcs-simpang-surau-gadang-d25` | ATCS Simpang Surau Gadang D25 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d25/s.m3u8` |
| 8 | `bukittinggi-atcs-simpang-depan-dprd-d11` | ATCS Simpang Depan DPRD D11 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d11/s.m3u8` |
| 9 | `bukittinggi-atcs-panorama-d12` | ATCS Panorama D12 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d12/s.m3u8` |
| 10 | `bukittinggi-atcs-panorama-d41` | ATCS Panorama D41 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d41/s.m3u8` |
| 11 | `bukittinggi-atcs-simpang-tembok-d14` | ATCS Simpang Tembok D14 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d14/s.m3u8` |
| 12 | `bukittinggi-atcs-simpang-tembok-d15` | ATCS Simpang Tembok D15 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d15/s.m3u8` |
| 13 | `bukittinggi-atcs-simpang-tembok-d16` | ATCS Simpang Tembok D16 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d16/s.m3u8` |
| 14 | `bukittinggi-atcs-jam-gadang-d17` | ATCS Jam Gadang D17 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d17/s.m3u8` |
| 15 | `bukittinggi-atcs-jam-gadang-d18` | ATCS Jam Gadang D18 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d18/s.m3u8` |
| 16 | `bukittinggi-atcs-simpang-garegeh-d19` | ATCS Simpang Garegeh D19 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d19/s.m3u8` |
| 17 | `bukittinggi-atcs-simpang-garegeh-d20` | ATCS Simpang Garegeh D20 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d20/s.m3u8` |
| 18 | `bukittinggi-atcs-simpang-manggis-d22` | ATCS Simpang Manggis D22 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d22/s.m3u8` |
| 19 | `bukittinggi-atcs-simpang-manggis-d23` | ATCS Simpang Manggis D23 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d23/s.m3u8` |
| 20 | `bukittinggi-atcs-simpang-manggis-d24` | ATCS Simpang Manggis D24 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d24/s.m3u8` |
| 21 | `bukittinggi-atcs-simpang-yarsi-d27` | ATCS Simpang Yarsi D27 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d27/s.m3u8` |
| 22 | `bukittinggi-atcs-simpang-yarsi-d36` | ATCS Simpang Yarsi D36 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d36/s.m3u8` |
| 23 | `bukittinggi-atcs-simpang-mandiangin-d28` | ATCS Simpang Mandiangin D28 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d28/s.m3u8` |
| 24 | `bukittinggi-atcs-simpang-mandiangin-d30` | ATCS Simpang Mandiangin D30 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d30/s.m3u8` |
| 25 | `bukittinggi-atcs-simpang-mandiangin-d31` | ATCS Simpang Mandiangin D31 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d31/s.m3u8` |
| 26 | `bukittinggi-atcs-simpang-tarok-d26` | ATCS Simpang Tarok D26 | HLS | `https://hls.bukittinggikota.go.id/hls1/S8CLldgSvMnakXwcqcfUXXHsV1V3D4/hls/vaGEV01I5C/cam1d26/s.m3u8` |
| 27 | `bukittinggi-atcs-simpang-tarok-d32` | ATCS Simpang Tarok D32 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d32/s.m3u8` |
| 28 | `bukittinggi-atcs-simpang-tarok-d33` | ATCS Simpang Tarok D33 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d33/s.m3u8` |
| 29 | `bukittinggi-atcs-simpang-jirek-d37` | ATCS Simpang Jirek D37 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d37/s.m3u8` |
| 30 | `bukittinggi-atcs-simpang-jirek-d38` | ATCS Simpang Jirek D38 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d38/s.m3u8` |
| 31 | `bukittinggi-atcs-simpang-jirek-d39` | ATCS Simpang Jirek D39 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d39/s.m3u8` |
| 32 | `bukittinggi-atcs-simpang-jirek-d40` | ATCS Simpang Jirek D40 | HLS | `https://hls.bukittinggikota.go.id/hls2/1JsXXZ1uXKOKRw26u67F4mrsN3bTYI/hls/5uGBKQdmwh/cam1d40/s.m3u8` |
| 33 | `bukittinggi-atcs-simpang-parak-kopi-bawah-d1` | ATCS Simpang Parak Kopi Bawah D1 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d1/s.m3u8` |
| 34 | `bukittinggi-atcs-simpang-parak-kopi-bawah-d3` | ATCS Simpang Parak Kopi Bawah D3 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d3/s.m3u8` |
| 35 | `bukittinggi-atcs-bantola-d13` | ATCS Bantola D13 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d13/s.m3u8` |
| 36 | `bukittinggi-atcs-simpang-parak-kopi-dalam-d14` | ATCS Simpang Parak Kopi Dalam D14 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d14/s.m3u8` |
| 37 | `bukittinggi-atcs-banto-laweh-d5` | ATCS Banto Laweh D5 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d5/s.m3u8` |
| 38 | `bukittinggi-atcs-banto-laweh-d8` | ATCS Banto Laweh D8 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d8/s.m3u8` |
| 39 | `bukittinggi-atcs-banto-laweh-d9` | ATCS Banto Laweh D9 | HLS | `https://hls.bukittinggikota.go.id/hls3/wlRJXDnLF0nDarpukpIkiPcPiJquQU/hls/5uGBKQdmwh/cam2d9/s.m3u8` |

### Balangan (38)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `balangan-atcs-kantor-bupati-utama` | Kantor Bupati | HLS | `https://cctv.balangankab.go.id/hls/kantor-bupati-utama/index.m3u8` |
| 2 | `balangan-atcs-depan-diskominfo-utama` | Depan Diskominfo | HLS | `https://cctv.balangankab.go.id/hls/depan-diskominfo-utama/index.m3u8` |
| 3 | `balangan-atcs-mesjid-al-akbar-area` | Mesjid Al Akbar | HLS | `https://cctv.balangankab.go.id/hls/mesjid-al-akbar-area/index.m3u8` |
| 4 | `balangan-atcs-simp-3-taman-sehati-utama` | Simp. 3 Taman Sehati | HLS | `https://cctv.balangankab.go.id/hls/simp3-taman-sehati-utama/index.m3u8` |
| 5 | `balangan-atcs-simp-batu-piring-utama` | Simp Batu Piring | HLS | `https://cctv.balangankab.go.id/hls/simp-batu-piring-utama/index.m3u8` |
| 6 | `balangan-atcs-simp-ban-ganal-utama` | Simp Ban Ganal | HLS | `https://cctv.balangankab.go.id/hls/simp-ban-ganal-utama/index.m3u8` |
| 7 | `balangan-atcs-jembatan-paringin-utama` | Jembatan Paringin | HLS | `https://cctv.balangankab.go.id/hls/jembatan-paringin-utama/index.m3u8` |
| 8 | `balangan-atcs-bundaran-paringin-utama` | Bundaran Paringin | HLS | `https://cctv.balangankab.go.id/hls/bundaran-paringin-utama/index.m3u8` |
| 9 | `balangan-atcs-gedung-pancasila-utama` | Gedung Pancasila | HLS | `https://cctv.balangankab.go.id/hls/gedung-pancasila-utama/index.m3u8` |
| 10 | `balangan-atcs-depan-bank-kalsel-utama` | Depan Bank Kalsel | HLS | `https://cctv.balangankab.go.id/hls/depan-bank-kalsel-utama/index.m3u8` |
| 11 | `balangan-atcs-depan-dekranasda-utama` | Depan Dekranasda | HLS | `https://cctv.balangankab.go.id/hls/depan-dekranasda-utama/index.m3u8` |
| 12 | `balangan-atcs-depan-indomaret-rica-area` | Depan Indomaret Rica | HLS | `https://cctv.balangankab.go.id/hls/depan-indomaret-rica-area/index.m3u8` |
| 13 | `balangan-atcs-simp-4-gunung-pandau-area` | Simp 4 Gunung Pandau | HLS | `https://cctv.balangankab.go.id/hls/simp4-gunung-pandau-area/index.m3u8` |
| 14 | `balangan-atcs-simp-4-kecamatan-parsel-area` | Simp 4 Kecamatan Parsel | HLS | `https://cctv.balangankab.go.id/hls/simp4-kec-parsel-area/index.m3u8` |
| 15 | `balangan-atcs-simp-3-polres-utama` | Simp 3 Polres | HLS | `https://cctv.balangankab.go.id/hls/simp3-polres-utama/index.m3u8` |
| 16 | `balangan-atcs-kecamatan-batumandi-area` | Kecamatan Batumandi | HLS | `https://cctv.balangankab.go.id/hls/kec-batumandi-area/index.m3u8` |
| 17 | `balangan-atcs-simp-3-mantimin` | Simp 3 Mantimin | HLS | `https://cctv.balangankab.go.id/hls/simp3-mantimin/index.m3u8` |
| 18 | `balangan-atcs-jembatan-pop` | Jembatan POP | HLS | `https://cctv.balangankab.go.id/hls/jembatan-pop/index.m3u8` |
| 19 | `balangan-atcs-simp-3-arah-gm` | Simp 3 Arah GM | HLS | `https://cctv.balangankab.go.id/hls/simp3-arah-gm/index.m3u8` |
| 20 | `balangan-atcs-simp-polsek-juai` | Simp Polsek Juai | HLS | `https://cctv.balangankab.go.id/hls/simp-polsek-juai/index.m3u8` |
| 21 | `balangan-atcs-bundaran-paringin-area` | Bundaran Paringin | HLS | `https://cctv.balangankab.go.id/hls/bundaran-paringin-area/index.m3u8` |
| 22 | `balangan-atcs-mesjid-al-akbar-utama` | Mesjid Al Akbar | HLS | `https://cctv.balangankab.go.id/hls/mesjid-al-akbar-utama/index.m3u8` |
| 23 | `balangan-atcs-kantor-bupati-area` | Kantor Bupati | HLS | `https://cctv.balangankab.go.id/hls/kantor-bupati-area/index.m3u8` |
| 24 | `balangan-atcs-depan-diskominfo-area` | Depan Diskominfo | HLS | `https://cctv.balangankab.go.id/hls/depan-diskominfo-area/index.m3u8` |
| 25 | `balangan-atcs-simp-batu-piring-area` | Simp Batu Piring | HLS | `https://cctv.balangankab.go.id/hls/simp-batu-piring-area/index.m3u8` |
| 26 | `balangan-atcs-simp-ban-ganal-area` | Simp Ban Ganal | HLS | `https://cctv.balangankab.go.id/hls/simp-ban-ganal-area/index.m3u8` |
| 27 | `balangan-atcs-jembatan-paringin-area` | Jembatan Paringin | HLS | `https://cctv.balangankab.go.id/hls/jembatan-paringin-area/index.m3u8` |
| 28 | `balangan-atcs-depan-dekranasda-area` | Depan Dekranasda | HLS | `https://cctv.balangankab.go.id/hls/depan-dekranasda-area/index.m3u8` |
| 29 | `balangan-atcs-simp-3-polres-area` | Simp 3 Polres | HLS | `https://cctv.balangankab.go.id/hls/simp3-polres-area/index.m3u8` |
| 30 | `balangan-atcs-simp4-gunung-pandau-utama` | Simp4 Gunung Pandau | HLS | `https://cctv.balangankab.go.id/hls/simp4-gunung-pandau-utama/index.m3u8` |
| 31 | `balangan-atcs-depan-indomaret-rica-utama` | Depan Indomaret Rica | HLS | `https://cctv.balangankab.go.id/hls/depan-indomaret-rica-utama/index.m3u8` |
| 32 | `balangan-atcs-simp-3-mantimin-area` | Simp 3 Mantimin | HLS | `https://cctv.balangankab.go.id/hls/simp3-mantimin-area/index.m3u8` |
| 33 | `balangan-atcs-gedung-pancasila-area` | Gedung Pancasila | HLS | `https://cctv.balangankab.go.id/hls/gedung-pancasila-area/index.m3u8` |
| 34 | `balangan-atcs-depan-bank-kalsel-area` | Depan Bank Kalsel | HLS | `https://cctv.balangankab.go.id/hls/depan-bank-kalsel-area/index.m3u8` |
| 35 | `balangan-atcs-simp-3-taman-sehati-area` | Simp. 3 Taman Sehati | HLS | `https://cctv.balangankab.go.id/hls/simp3-taman-sehati-area/index.m3u8` |
| 36 | `balangan-atcs-simp-4-kecamatan-parsel-utama` | Simp 4 Kecamatan Parsel | HLS | `https://cctv.balangankab.go.id/hls/simp4-kec-parsel-utama/index.m3u8` |
| 37 | `balangan-atcs-tugu-gula-habang-lampihong-utama` | Tugu Gula Habang Lampihong | HLS | `https://cctv.balangankab.go.id/hls/tugu-gula-habang-utama/index.m3u8` |
| 38 | `balangan-atcs-tugu-gula-habang-lampihong-area` | Tugu Gula Habang Lampihong | HLS | `https://cctv.balangankab.go.id/hls/tugu-gula-habang-area/index.m3u8` |

### Sumedang (35)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `sumedang-atcs-samojafix1` | ATCS Samoja Fix | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/samojafix1/s.m3u8` |
| 2 | `sumedang-atcs-abtji54tov` | ATCS Binokasih Arah Gunung Puyuh | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/ABtji54TOv/s.m3u8` |
| 3 | `sumedang-atcs-gcga8gq1bg` | ATCS Binokasih Fix | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/Gcga8Gq1Bg/s.m3u8` |
| 4 | `sumedang-atcs-anennaejvm` | ATCS Binokasih Arah Kota | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/AnenNAeJvm/s.m3u8` |
| 5 | `sumedang-atcs-y2jdzs2w4t` | ATCS Binokasih Arah Cirebon | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/Y2JdzS2W4t/s.m3u8` |
| 6 | `sumedang-atcs-tkvpvkacvd` | ATCS Padasuka | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/tkvPVkAcVD/s.m3u8` |
| 7 | `sumedang-atcs-ksdjqkylya80` | ATCS MPP 1 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/ksdJQKylYA80/s.m3u8` |
| 8 | `sumedang-atcs-lapasfix1` | ATCS Lapas Fix | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/LAPASFIX1/s.m3u8` |
| 9 | `sumedang-atcs-kejaksaanfix2` | ATCS Kejaksaan Fix 2 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/KEJAKSAANFIX2/s.m3u8` |
| 10 | `sumedang-atcs-skejaksaanfix1` | ATCS Kejaksaan Fix 1 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/SKEJAKSAANFIX1/s.m3u8` |
| 11 | `sumedang-atcs-mg49wvxdqj` | ATCS RSUD Arah Bandung | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/mG49WVXDqJ/s.m3u8` |
| 12 | `sumedang-atcs-0j7lrn9dje` | ATCS RSUD Arah Cirebon | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/0j7lrn9dje/s.m3u8` |
| 13 | `sumedang-atcs-bjbfix1` | ATCS BJB | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/BJBFIX1/s.m3u8` |
| 14 | `sumedang-atcs-bnifix1` | ATCS Simpang BNI | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/BNIFIX1/s.m3u8` |
| 15 | `sumedang-atcs-bnifix2` | ATCS Simpang GIM | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/BNIFIX2/s.m3u8` |
| 16 | `sumedang-atcs-pajajifix2` | ATCS Simpang Pajaji | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/PAJAJIFIX2/s.m3u8` |
| 17 | `sumedang-atcs-pajajifix1` | ATCS Pajaji Arah Cirebon | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/PAJAJIFIX1/s.m3u8` |
| 18 | `sumedang-atcs-alunalunutarafix1` | ATCS Alun-Alun Utara Arah Taman Endog | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/ALUNALUNUTARAFIX1/s.m3u8` |
| 19 | `sumedang-atcs-tendogfix2` | ATCS Taman Endog Arah Tegalkalong | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/TENDOGFIX2/s.m3u8` |
| 20 | `sumedang-atcs-tendogfix1` | ATCS Taman Endog Arah Bandung | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/TENDOGFIX1/s.m3u8` |
| 21 | `sumedang-atcs-tendogfix4` | ATCS Taman Endog Arah Alamsari | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/TENDOGFIX4/s.m3u8` |
| 22 | `sumedang-atcs-tendog2fix1` | ATCS Taman Endog Fix 1 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/TENDOG2FIX1/s.m3u8` |
| 23 | `sumedang-atcs-tendog2fix2` | ATCS Taman Endog Fix 2 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/TENDOG2FIX2/s.m3u8` |
| 24 | `sumedang-atcs-btnfix1` | ATCS Seni Abadi | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/BTNFIX1/s.m3u8` |
| 25 | `sumedang-atcs-ojolalifix2` | ATCS Ojolali Arah Alamsari | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/OJOLALIFIX2/s.m3u8` |
| 26 | `sumedang-atcs-ojolalifix1` | ATCS Ojolali Arah Taman Endog | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/OJOLALIFIX1/s.m3u8` |
| 27 | `sumedang-atcs-griyafix2` | ATCS Griya Arah Ojolali | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/GRIYAFIX2/s.m3u8` |
| 28 | `sumedang-atcs-griyafix1` | ATCS Griya Arah Alamsari | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/GRIYAFIX1/s.m3u8` |
| 29 | `sumedang-atcs-2pzeei5hr6` | ATCS Angkrek Arah Ojolali | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/2PzEEi5hR6/s.m3u8` |
| 30 | `sumedang-atcs-upifix2` | ATCS UPI Arah Bandung | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/UPIFIX2/s.m3u8` |
| 31 | `sumedang-atcs-upifix1` | ATCS UPI Arah Cirebon | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/UPIFIX1/s.m3u8` |
| 32 | `sumedang-atcs-asitoxoqvc` | ATCS Alamsari Arah Wado | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/AsIToXoQVc/s.m3u8` |
| 33 | `sumedang-atcs-ciuyb6jrwp` | ATCS Alamsari Arah Kota | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/CiUyB6JrWp/s.m3u8` |
| 34 | `sumedang-atcs-23ytwcxa5h` | ATCS Alamsari Fix 1 | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/23YtWcxa5H/s.m3u8` |
| 35 | `sumedang-atcs-17raodnkwr80` | ATCS Alamsari Arah Terminal Ciakar | HLS | `https://shinobi.sumedangkab.go.id/lKaKTqOjXLc1NAgDUqhqEBhFV4n8bh/hls/fMXW29kaZd/17rAoDNKWr80/s.m3u8` |

### Banjarmasin (33)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `banjarmasin-atcs-simpang-mentari` | Simpang Mentari | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_mentari/index.m3u8` |
| 2 | `banjarmasin-atcs-jembatan-alalak-arah-luar-kota` | Jembatan Alalak Arah Luar Kota | HLS | `https://atcs.banjarmasinkota.go.id/stream/jembatan_alalak_arah_luar_kota/index.m3u8` |
| 3 | `banjarmasin-atcs-jembatan-sungai-andai` | Jembatan Sungai Andai | HLS | `https://atcs.banjarmasinkota.go.id/stream/jembatan_sungai_andai/index.m3u8` |
| 4 | `banjarmasin-atcs-jalan-lambung-mangkurat-depan-bank-indonesia` | Jalan Lambung Mangkurat | HLS | `https://atcs.banjarmasinkota.go.id/stream/jalan_lambung_mangkurat_bank_bi/index.m3u8` |
| 5 | `banjarmasin-atcs-simpang-a-yani-gatot-fly-over-km-3` | Simpang A Yani Gatot / Fly Over KM 3 | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_a_yani_gatot_fly_over_km_3/index.m3u8` |
| 6 | `banjarmasin-atcs-simpang-a-yani-antasari-km-3` | Simpang A Yani - Antasari KM 3 | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_a_yani_antasari_km_3/index.m3u8` |
| 7 | `banjarmasin-atcs-jembatan-mesjid-jami` | Jembatan Mesjid Jami | HLS | `https://atcs.banjarmasinkota.go.id/stream/jembatan_mesjid_jami_arah_mesjid/index.m3u8` |
| 8 | `banjarmasin-atcs-simpang-hasan-basri-cemara` | Simpang Hasan Basri - Cemara | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_hasan_basri_cemara/index.m3u8` |
| 9 | `banjarmasin-atcs-simpang-a-yani-kuripan-km-2` | Simpang A Yani - Kuripan KM 2 | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_a_yani_kuripan_km_2/index.m3u8` |
| 10 | `banjarmasin-atcs-u-turn-jalan-a-yani-km-5` | U-Turn Jalan A Yani KM 5 | HLS | `https://atcs.banjarmasinkota.go.id/stream/u_turn_jalan_a_yani_km_5/index.m3u8` |
| 11 | `banjarmasin-atcs-jembatan-phb-sutoyo` | Jembatan PHB Sutoyo | HLS | `https://atcs.banjarmasinkota.go.id/stream/jl_ujung_murung_1/index.m3u8` |
| 12 | `banjarmasin-atcs-simpang-a-yani-pramuka-km-6` | Simpang A Yani - Pramuka KM 6 | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_a_yani_pramuka_km_6/index.m3u8` |
| 13 | `banjarmasin-atcs-u-turn-jalan-s-parman-arah-luar-kota` | U-Turn Jalan S. Parman Arah Luar Kota | HLS | `https://atcs.banjarmasinkota.go.id/stream/u_turn_jalan_s_parman_arah_luar_kota/index.m3u8` |
| 14 | `banjarmasin-atcs-jalan-gubernur-soebardjo-jembatan-tatah-bangkal-keluar-kota` | Jalan Gubernur Soebardjo Jembatan Tatah Bangkal Keluar Kota | HLS | `https://atcs.banjarmasinkota.go.id/stream/jalan_gubernur_soebardjo_jembatan_tatah_bangkal_keluar_kota/index.m3u8` |
| 15 | `banjarmasin-atcs-jembatan-pangeran-samudera-antasari` | Jembatan Pangeran Samudera | HLS | `https://atcs.banjarmasinkota.go.id/stream/jalan_pangeran_samudera_antasari/index.m3u8` |
| 16 | `banjarmasin-atcs-simpang-gerilya` | Simpang Gerilya | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_gerilya/index.m3u8` |
| 17 | `banjarmasin-atcs-simpang-cemara` | Simpang Cemara | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_cemara/index.m3u8` |
| 18 | `banjarmasin-atcs-jalan-a-yani-km-3-depan-pdam` | Jalan A Yani KM 3 | HLS | `https://atcs.banjarmasinkota.go.id/stream/jalan_a_yani_km_3/index.m3u8` |
| 19 | `banjarmasin-atcs-u-turn-a-yani-km-2` | U-Turn A Yani KM 2 | HLS | `https://atcs.banjarmasinkota.go.id/stream/u_turn_a_yani_km_2/index.m3u8` |
| 20 | `banjarmasin-atcs-simpang-s-parman-tarakan` | Simpang S. Parman - Tarakan | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_s_parman_tarakan/index.m3u8` |
| 21 | `banjarmasin-atcs-simpang-s-parman-arah-tarakan` | Simpang S. Parman Arah Tarakan | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_s_parman_arah_tarakan/index.m3u8` |
| 22 | `banjarmasin-atcs-simpang-sultan-adam-sungai-andai` | Simpang Sultan Adam - Sungai Andai | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_sultan_adam_sungai_andai/index.m3u8` |
| 23 | `banjarmasin-atcs-simpang-antasari` | Simpang Antasari | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_antasari/index.m3u8` |
| 24 | `banjarmasin-atcs-simpang-rk-ilir-teluk-tiram-darat` | Simpang RK Ilir / Teluk Tiram Darat | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_rk_ilir_teluk_tiram_darat/index.m3u8` |
| 25 | `banjarmasin-atcs-simpang-s-parman-belitung` | Simpang S. Parman - Belitung | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_s_parman_belitung/index.m3u8` |
| 26 | `banjarmasin-atcs-simpang-jembatan-merdeka-mesjid-raya` | Simpang Jembatan Merdeka / Mesjid Raya | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_jembatan_merdeka_mesjid_raya/index.m3u8` |
| 27 | `banjarmasin-atcs-simpang-kamboja` | Simpang Kamboja | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_kamboja/index.m3u8` |
| 28 | `banjarmasin-atcs-simpang-mulawarman` | Simpang Mulawarman | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_mulawarman/index.m3u8` |
| 29 | `banjarmasin-atcs-jalan-gubernur-soebardjo-jembatan-tatah-bangkal-masuk-kota` | Jalan Gubernur Soebardjo Jembatan Tatah Bangkal Masuk Kota | HLS | `https://atcs.banjarmasinkota.go.id/stream/jalan_gubernur_soebardjo_jembatan_tatah_bangkal_masuk_kota/index.m3u8` |
| 30 | `banjarmasin-atcs-simpang-3-piston-jembatan-merdeka` | Simpang 3 Piston Jembatan Merdeka | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_3_piston_jembatan_merdeka/index.m3u8` |
| 31 | `banjarmasin-atcs-simpang-pasar-lama` | Simpang Pasar Lama | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_pasar_lama/index.m3u8` |
| 32 | `banjarmasin-atcs-simpang-sutoyo-jafri-zam-zam` | Simpang Sutoyo / Jafri Zam Zam | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_sutoyo_jafri_zam_zam/index.m3u8` |
| 33 | `banjarmasin-atcs-simpang-kol-sugiono` | Simpang Kol. Sugiono | HLS | `https://atcs.banjarmasinkota.go.id/stream/simpang_kol_sugiono/index.m3u8` |

### Pasuruan (31)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `pasuruan-atcs-pasar-nguling` | ATCS Pasar Nguling | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PASAR_NGULING.m3u8` |
| 2 | `pasuruan-atcs-sumurwaru` | ATCS Sumurwaru | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/SUMURWARU.m3u8` |
| 3 | `pasuruan-atcs-semambung` | ATCS Semambung | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/SEMAMBUNG.m3u8` |
| 4 | `pasuruan-atcs-exit-tol-grati` | ATCS Exit Tol Grati | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/EXIT_TOL_GRATI.m3u8` |
| 5 | `pasuruan-atcs-ngopak` | ATCS Ngopak | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/NGOPAK.m3u8` |
| 6 | `pasuruan-atcs-rejoso` | ATCS Rejoso | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/REJOSO.m3u8` |
| 7 | `pasuruan-atcs-ranggehtimur` | ATCS Ranggeh Timur | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/RANGGEHTIMUR.m3u8` |
| 8 | `pasuruan-atcs-warungdowo-wetan` | ATCS Warungdowo Wetan | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/WARUNGDOWO_WETAN.m3u8` |
| 9 | `pasuruan-atcs-warungdowo-tengah` | ATCS Warungdowo Tengah | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/WARUNGDOWO_TENGAH.m3u8` |
| 10 | `pasuruan-atcs-contong` | ATCS Contong | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/CONTONG.m3u8` |
| 11 | `pasuruan-atcs-al-yasini` | ATCS Al-Yasini | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/AL-YASINI.m3u8` |
| 12 | `pasuruan-atcs-pasar-wonorejo1` | ATCS Pasar Wonorejo 1 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PASAR_WONOREJO1.m3u8` |
| 13 | `pasuruan-atcs-kantor-dishub-arah-pasuruan` | ATCS Kantor Dishub (arah Pasuruan) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/KANTOR_DISHUB_ARAH_PASURUAN.m3u8` |
| 14 | `pasuruan-atcs-kantor-dishub-arah-malang` | ATCS Kantor Dishub (arah Malang) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/KANTOR_DISHUB_ARAH_MALANG.m3u8` |
| 15 | `pasuruan-atcs-purwosari-mlg` | ATCS Purwosari (arah Malang) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PURWOSARI_MLG.m3u8` |
| 16 | `pasuruan-atcs-purwosari-sby` | ATCS Purwosari (arah Surabaya) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PURWOSARI_SBY.m3u8` |
| 17 | `pasuruan-atcs-pwd-sby` | ATCS Purwodadi (arah Surabaya) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PWD_SBY.m3u8` |
| 18 | `pasuruan-atcs-pwd-mlg` | ATCS Purwodadi (arah Malang) | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PWD_MLG.m3u8` |
| 19 | `pasuruan-atcs-jetak2` | ATCS Jetak 2 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/JETAK2.m3u8` |
| 20 | `pasuruan-atcs-jetak1` | ATCS Jetak 1 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/JETAK1.m3u8` |
| 21 | `pasuruan-atcs-tamandayu` | ATCS Tamandayu | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/TAMANDAYU.m3u8` |
| 22 | `pasuruan-atcs-p21-bangil` | ATCS P21 Bangil | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/P21_BANGIL.m3u8` |
| 23 | `pasuruan-atcs-polsekpdn-1` | ATCS Polsek Pandaan 1 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/POLSEKPDN_1.m3u8` |
| 24 | `pasuruan-atcs-sp3-gempol` | ATCS Simpang 3 Gempol | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/SP3_GEMPOL.m3u8` |
| 25 | `pasuruan-atcs-bejibarat` | ATCS Beji Barat | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/BEJIBARAT.m3u8` |
| 26 | `pasuruan-atcs-exit-tol-bangil` | ATCS Exit Tol Bangil | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/EXIT_TOL_BANGIL.m3u8` |
| 27 | `pasuruan-atcs-gaden-bangil2` | ATCS Gaden Bangil 2 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/GADEN_BANGIL2.m3u8` |
| 28 | `pasuruan-atcs-kancilmas-2` | ATCS Kancilmas 2 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/KANCILMAS_2.m3u8` |
| 29 | `pasuruan-atcs-sp4-stbangil-1` | ATCS Simpang 4 Stasiun Bangil 1 | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/SP4_STBANGIL_1.m3u8` |
| 30 | `pasuruan-atcs-pier-raci` | ATCS Pier Raci | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/PIER_RACI.m3u8` |
| 31 | `pasuruan-atcs-tambakrejo` | ATCS Tambakrejo | HLS | `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/TAMBAKREJO.m3u8` |

### Pekanbaru (32)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `pekanbaru-atcs-sudirman-harapan-raya-announcer` | ATCS SUDIRMAN - HARAPAN RAYA (Announcer) | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.2.6/index.m3u8` |
| 2 | `pekanbaru-atcs-simpang-pasir-putih-1` | ATCS SIMPANG PASIR PUTIH 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.6.2/index.m3u8` |
| 3 | `pekanbaru-atcs-simpang-baterai-a-1` | ATCS SIMPANG BATERAI A 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.7.2/index.m3u8` |
| 4 | `pekanbaru-atcs-simpang-baterai-a-2` | ATCS SIMPANG BATERAI A 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.7.3/index.m3u8` |
| 5 | `pekanbaru-atcs-simpang-parit-indah` | ATCS SIMPANG PARIT INDAH | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.8.2/index.m3u8` |
| 6 | `pekanbaru-atcs-kh-ahmad-dahlan-durian` | ATCS KH AHMAD DAHLAN - DURIAN | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.13.2/index.m3u8` |
| 7 | `pekanbaru-atcs-lobak-delima` | ATCS LOBAK - DELIMA | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.14.2/index.m3u8` |
| 8 | `pekanbaru-atcs-simpang-bandara` | ATCS SIMPANG BANDARA | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.23.2/index.m3u8` |
| 9 | `pekanbaru-atcs-pasar-pagi` | ATCS PASAR PAGI | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.25.2/index.m3u8` |
| 10 | `pekanbaru-atcs-depan-mpp-1` | ATCS DEPAN MPP 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.43.2/index.m3u8` |
| 11 | `pekanbaru-atcs-depan-mpp-2` | ATCS DEPAN MPP 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.43.3/index.m3u8` |
| 12 | `pekanbaru-atcs-seberang-mpp-2` | ATCS SEBERANG MPP 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.43.5/index.m3u8` |
| 13 | `pekanbaru-atcs-stadion-rumbai-1` | ATCS STADION RUMBAI 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.45.2/index.m3u8` |
| 14 | `pekanbaru-atcs-stadion-rumbai-3` | ATCS STADION RUMBAI 3 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.45.4/index.m3u8` |
| 15 | `pekanbaru-atcs-hangtuah-dr-sutomo` | ATCS HANGTUAH - DR SUTOMO | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.47.2/index.m3u8` |
| 16 | `pekanbaru-atcs-sudirman-gajah-mada-1` | ATCS SUDIRMAN - GAJAH MADA 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.49.2/index.m3u8` |
| 17 | `pekanbaru-atcs-sudirman-tuanku-tambusai-2` | ATCS SUDIRMAN - TUANKU TAMBUSAI 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.3/index.m3u8` |
| 18 | `pekanbaru-atcs-sudirman-tuanku-tambusai-3` | ATCS SUDIRMAN - TUANKU TAMBUSAI 3 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.4/index.m3u8` |
| 19 | `pekanbaru-atcs-flyover-sudirman-nangka-51-5` | ATCS Flyover Sudirman - Nangka | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.5/index.m3u8` |
| 20 | `pekanbaru-atcs-flyover-sudirman-nangka-51-6` | ATCS Flyover Sudirman - Nangka | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.6/index.m3u8` |
| 21 | `pekanbaru-atcs-simpang-sudirman-nangka-announcer` | ATCS Simpang Sudirman- Nangka (Announcer) | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.7/index.m3u8` |
| 22 | `pekanbaru-atcs-tuanku-tambusai-paus-1` | ATCS TUANKU TAMBUSAI - PAUS 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.52.2/index.m3u8` |
| 23 | `pekanbaru-atcs-depan-lw` | ATCS DEPAN LW | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.53.2/index.m3u8` |
| 24 | `pekanbaru-atcs-riau-kayu-manis` | ATCS RIAU - KAYU MANIS | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.55.2/index.m3u8` |
| 25 | `pekanbaru-atcs-simpang-tabek-gadang-1` | ATCS SIMPANG TABEK GADANG 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.57.2/index.m3u8` |
| 26 | `pekanbaru-atcs-simpang-tabek-gadang-2` | ATCS SIMPANG TABEK GADANG 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.57.3/index.m3u8` |
| 27 | `pekanbaru-atcs-simpang-tabek-gadang-3` | ATCS SIMPANG TABEK GADANG 3 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.57.4/index.m3u8` |
| 28 | `pekanbaru-atcs-simpang-stadion-utama` | ATCS SIMPANG STADION UTAMA | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.59.2/index.m3u8` |
| 29 | `pekanbaru-atcs-rth-tunjuk-ajar-arah-rumah-dinas` | ATCS RTH TUNJUK AJAR (ARAH RUMAH DINAS) | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.60.2/index.m3u8` |
| 30 | `pekanbaru-atcs-sudirman-tuanku-tambusai-1` | ATCS SUDIRMAN - TUANKU TAMBUSAI 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.51.2/index.m3u8` |
| 31 | `pekanbaru-atcs-jpo-mtq-1` | ATCS JPO - MTQ 1 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.24.2/index.m3u8` |
| 32 | `pekanbaru-atcs-jpo-mtq-2` | ATCS JPO - MTQ 2 | HLS | `https://cctv.pekanbaru.go.id/hls/cam-10.200.24.3/index.m3u8` |

### Kabupaten Tangerang (28)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `tangerangkab-atcs-jayanti-1-arah-serang` | ATCS JAYANTI 1 ARAH SERANG | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzn18d0ca1m7p4ctvx1/01jsnyfnzn18d0ca1m7p4ctvx1.m3u8` |
| 2 | `tangerangkab-atcs-jayanti-2-arah-gembong` | ATCS JAYANTI 2 ARAH GEMBONG | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzqgp8ey0jpz4hec4xa/01jsnyfnzqgp8ey0jpz4hec4xa.m3u8` |
| 3 | `tangerangkab-atcs-cikupa-kedaton-1` | ATCS CIKUPA KEDATON 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzs6e5818bdsed2jppp/01jsnyfnzs6e5818bdsed2jppp.m3u8` |
| 4 | `tangerangkab-atcs-cikupa-mas` | ATCS CIKUPA MAS | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzt5nxdn9t5fzt0265r/01jsnyfnzt5nxdn9t5fzt0265r.m3u8` |
| 5 | `tangerangkab-atcs-cisauk-1` | ATCS CISAUK 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzv75f3w6m701qt8rn5/01jsnyfnzv75f3w6m701qt8rn5.m3u8` |
| 6 | `tangerangkab-atcs-cisauk-2` | ATCS CISAUK 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsnyfnzwk8thm9m03a4prrfh/01jsnyfnzwk8thm9m03a4prrfh.m3u8` |
| 7 | `tangerangkab-atcs-simpang-rajeg-kukun-1` | ATCS SIMPANG RAJEG KUKUN 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr079n4btzjemf6r9br473w/01jsr079n4btzjemf6r9br473w.m3u8` |
| 8 | `tangerangkab-atcs-simpang-rajeg-kukun-2` | ATCS SIMPANG RAJEG KUKUN 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr0j5nwjcbthcb6aypa6dcr/01jsr0j5nwjcbthcb6aypa6dcr.m3u8` |
| 9 | `tangerangkab-atcs-simpang-pasar-kemis-1` | ATCS SIMPANG PASAR KEMIS 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr0t8vyed4mcezqccqfngha/01jsr0t8vyed4mcezqccqfngha.m3u8` |
| 10 | `tangerangkab-atcs-simpang-pasar-kemis-2` | ATCS SIMPANG PASAR KEMIS 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr3dmjxav35pvcja8j4c6ac/01jsr3dmjxav35pvcja8j4c6ac.m3u8` |
| 11 | `tangerangkab-atcs-simpang-sepatan-1` | ATCS SIMPANG SEPATAN 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr485tfw1cwwa1v6c3jpgfd/01jsr485tfw1cwwa1v6c3jpgfd.m3u8` |
| 12 | `tangerangkab-atcs-simpang-sepatan-2` | ATCS SIMPANG SEPATAN 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsr4h8jwz9f0akrk9bd48qt7/01jsr4h8jwz9f0akrk9bd48qt7.m3u8` |
| 13 | `tangerangkab-atcs-simpang-islamic-1` | ATCS SIMPANG ISLAMIC 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrc5g3cz9wsb0305zte4h04/01jsrc5g3cz9wsb0305zte4h04.m3u8` |
| 14 | `tangerangkab-atcs-simpang-dadap-1` | ATCS SIMPANG DADAP 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrcpqn62mej02bc0h565epz/01jsrcpqn62mej02bc0h565epz.m3u8` |
| 15 | `tangerangkab-atcs-jembatan-dadap` | ATCS JEMBATAN DADAP | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrctg4pc3xdf5vkjjg4pcfd/01jsrctg4pc3xdf5vkjjg4pcfd.m3u8` |
| 16 | `tangerangkab-atcs-simpang-legok-1` | ATCS SIMPANG LEGOK 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrdvkp3ssgqrtemf8kn8gv6/01jsrdvkp3ssgqrtemf8kn8gv6.m3u8` |
| 17 | `tangerangkab-atcs-simpang-adiyasa-1` | ATCS SIMPANG ADIYASA 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrefb2z1e8y217vqdn6q60f/01jsrefb2z1e8y217vqdn6q60f.m3u8` |
| 18 | `tangerangkab-atcs-simpang-adiyasa-2` | ATCS SIMPANG ADIYASA 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrepbfdrenxw1k42nxw94c5/01jsrepbfdrenxw1k42nxw94c5.m3u8` |
| 19 | `tangerangkab-atcs-pemda-tigaraksa` | ATCS PEMDA TIGARAKSA | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jsrev0qphd8m3v37rqf1xf9y/01jsrev0qphd8m3v37rqf1xf9y.m3u8` |
| 20 | `tangerangkab-atcs-simpang-alun-alun-tigaraksa` | ATCS SIMPANG ALUN ALUN TIGARAKSA | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jv64k58jgtdzt54ywvxyr134/01jv64k58jgtdzt54ywvxyr134.m3u8` |
| 21 | `tangerangkab-atcs-jl-pemda-tigaraksa` | ATCS JL.PEMDA TIGARAKSA | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvpeyhgex8qb9j5h2dct3a7/01jzvpeyhgex8qb9j5h2dct3a7.m3u8` |
| 22 | `tangerangkab-atcs-jl-pemda-tigaraksa-2` | ATCS JL. PEMDA TIGARAKSA 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvpwyqcs2g5kk9rc1s37e4y/01jzvpwyqcs2g5kk9rc1s37e4y.m3u8` |
| 23 | `tangerangkab-atcs-kecamatan-mauk` | ATCS KECAMATAN MAUK | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvqax0cms7wh04jqhw61t3r/01jzvqax0cms7wh04jqhw61t3r.m3u8` |
| 24 | `tangerangkab-atcs-tugu-mauk` | ATCS TUGU MAUK | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvqg6wswbn9vc37nyyf0qg1/01jzvqg6wswbn9vc37nyyf0qg1.m3u8` |
| 25 | `tangerangkab-atcs-jl-pantura-bitung-1` | ATCS JL. PANTURA BITUNG 1 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvqtpxmrvd9pcbbsh2jq61q/01jzvqtpxmrvd9pcbbsh2jq61q.m3u8` |
| 26 | `tangerangkab-atcs-jl-pantura-bitung-2` | ATCS JL. PANTURA BITUNG 2 | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01jzvr0hphd8c104283f8g1d9n/01jzvr0hphd8c104283f8g1d9n.m3u8` |
| 27 | `tangerangkab-atcs-simpang-bugel-tigaraksa` | ATCS SIMPANG BUGEL TIGARAKSA | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01k4mapmw669p23ks3dkpkb066/01k4mapmw669p23ks3dkpkb066.m3u8` |
| 28 | `tangerangkab-atcs-simpang-bugel-arah-puspem` | ATCS SIMPANG BUGEL ARAH PUSPEM | HLS | `https://cctv-dishub.tangerangkab.go.id/storage/video/01k4p20xkjzafpgg5bayy3kj8q/01k4p20xkjzafpgg5bayy3kj8q.m3u8` |

### Padang (28)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `padang-atcs-uptd-pasar-alai-1` | ATCS UPTD Pasar Alai 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/8s3Tozcz-txQo-Tnb8-AF6r-49WaCG3aP2is/channel/0/hlsll/live/index.m3u8` |
| 2 | `padang-atcs-uptd-pasar-alai-2` | ATCS UPTD Pasar Alai 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/HaA7Kyfr-kD8H-8Das-L8Xi-KAbCnhJOIj4r/channel/0/hlsll/live/index.m3u8` |
| 3 | `padang-atcs-uptd-pasar-alai-3` | ATCS UPTD Pasar Alai 3 | HLS | `https://streamcctv.padang.go.id:3000/stream/gbDCn1H5-5O1X-nGiw-oFbk-hoi8iccOfAyf/channel/0/hlsll/live/index.m3u8` |
| 4 | `padang-atcs-uptd-pasar-alai-4` | ATCS UPTD Pasar Alai 4 | HLS | `https://streamcctv.padang.go.id:3000/stream/tswPljNS-izXr-70K4-T0AB-wBcTsNuePkQy/channel/0/hlsll/live/index.m3u8` |
| 5 | `padang-atcs-puskesmas-pemancungan-1` | ATCS Puskesmas Pemancungan 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/BvkRcg6x-iAEe-oL0A-UFqk-NhVythgOra3x/channel/0/hlsll/live/index.m3u8` |
| 6 | `padang-atcs-puskesmas-pemancungan-2` | ATCS Puskesmas Pemancungan 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/CN9uygIX-8h5q-rAIw-x5zR-3NT6P4MPduuO/channel/0/hlsll/live/index.m3u8` |
| 7 | `padang-atcs-uptd-pasar-nanggalo-1` | ATCS UPTD Pasar Nanggalo 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/DKYYSz9I-TifQ-AMEx-ODQ0-SMnaxa25oFHu/channel/0/hlsll/live/index.m3u8` |
| 8 | `padang-atcs-uptd-pasar-nanggalo-2` | ATCS UPTD Pasar Nanggalo 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/ITYquU2X-L23y-4CWs-JhhL-A69xcNtwkG1T/channel/0/hlsll/live/index.m3u8` |
| 9 | `padang-atcs-uptd-pasar-nanggalo-3` | ATCS UPTD Pasar Nanggalo 3 | HLS | `https://streamcctv.padang.go.id:3000/stream/OjEAGH6L-kVMK-j6q8-UEde-Cmub6yVqBEio/channel/0/hlsll/live/index.m3u8` |
| 10 | `padang-atcs-uptd-pasar-nanggalo-4` | ATCS UPTD Pasar Nanggalo 4 | HLS | `https://streamcctv.padang.go.id:3000/stream/YaGqI6yZ-shWQ-dcj4-Knxf-gpqNhH5664XL/channel/0/hlsll/live/index.m3u8` |
| 11 | `padang-atcs-mpp-plaza-andalas-1` | ATCS MPP Plaza Andalas 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/EbjNcrLc-dwc7-nTcp-6BDo-21RlOefC33gs/channel/0/hlsll/live/index.m3u8` |
| 12 | `padang-atcs-mpp-plaza-andalas-2` | ATCS MPP Plaza Andalas 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/VRRT6WdZ-hPxA-cOE3-xnWd-0Ly6xYi3ImYX/channel/0/hlsll/live/index.m3u8` |
| 13 | `padang-atcs-uptd-pasar-belimbing-1` | ATCS UPTD Pasar Belimbing 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/Ilnm4lTw-fp5C-EtQn-SOqq-4RYFC3t6XosT/channel/0/hlsll/live/index.m3u8` |
| 14 | `padang-atcs-uptd-pasar-belimbing-2` | ATCS UPTD Pasar Belimbing 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/S1SEA7I7-HIw2-WwG5-9qKn-fLAfNk9ni7qI/channel/0/hlsll/live/index.m3u8` |
| 15 | `padang-atcs-uptd-pasar-belimbing-3` | ATCS UPTD Pasar Belimbing 3 | HLS | `https://streamcctv.padang.go.id:3000/stream/bk53IoWu-Ehxi-N4ZP-RzQ7-xbivBJ1fbCLb/channel/0/hlsll/live/index.m3u8` |
| 16 | `padang-atcs-uptd-pasar-bandar-buat-1` | ATCS UPTD Pasar Bandar Buat 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/JTeBW63A-JbNf-aCwi-2GKO-4XypAEmI0lTB/channel/0/hlsll/live/index.m3u8` |
| 17 | `padang-atcs-uptd-pasar-bandar-buat-2` | ATCS UPTD Pasar Bandar Buat 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/U5nRqozZ-ptJE-zMsg-jlcm-wIoEs1ZgQ9fT/channel/0/hlsll/live/index.m3u8` |
| 18 | `padang-atcs-uptd-pasar-bandar-buat-3` | ATCS UPTD Pasar Bandar Buat 3 | HLS | `https://streamcctv.padang.go.id:3000/stream/l90euajC-qLnI-87fg-W9H7-XYS1vogJI34H/channel/0/hlsll/live/index.m3u8` |
| 19 | `padang-atcs-uptd-pasar-bandar-buat-4` | ATCS UPTD Pasar Bandar Buat 4 | HLS | `https://streamcctv.padang.go.id:3000/stream/yoG5OeMU-oR9h-fIt4-vtyS-C3rtrmAIGn5s/channel/0/hlsll/live/index.m3u8` |
| 20 | `padang-atcs-puskesmas-ulak-karang-1` | ATCS Puskesmas Ulak Karang 1 | HLS | `https://streamcctv.padang.go.id:3000/stream/TDuUtIxG-z4eP-9cLi-zWYN-I91O6KeSXeJX/channel/0/hlsll/live/index.m3u8` |
| 21 | `padang-atcs-puskesmas-ulak-karang-2` | ATCS Puskesmas Ulak Karang 2 | HLS | `https://streamcctv.padang.go.id:3000/stream/uRkmNtLk-CUZz-nxUY-bFeS-C6FtmRZSKBMf/channel/0/hlsll/live/index.m3u8` |
| 22 | `padang-atcs-balaikota-belakang-pos-masuk` | ATCS Balaikota - Belakang Pos Masuk | HLS | `https://streamcctv.padang.go.id:3000/stream/wKejugE6-n9TW-Qxl1-tsE0-tbZ6BE0kBS2T/channel/0/hlsll/live/index.m3u8` |
| 23 | `padang-atcs-balaikota-bundaran` | ATCS Balaikota - Bundaran | HLS | `https://streamcctv.padang.go.id:3000/stream/rFcDZXdD-eg40-9TI8-ch2t-T7XDYGwi5bje/channel/0/hlsll/live/index.m3u8` |
| 24 | `padang-atcs-balaikota-gerbang-masuk` | ATCS Balaikota - Gerbang Masuk | HLS | `https://streamcctv.padang.go.id:3000/stream/eapqWwwq-Zrt5-RZjS-ou4E-aEZRybsjb1MN/channel/0/hlsll/live/index.m3u8` |
| 25 | `padang-atcs-balaikota-lapangan-apeksi` | ATCS Balaikota - Lapangan Apeksi | HLS | `https://streamcctv.padang.go.id:3000/stream/rnl0x2Ip-TMJz-nAud-ZdCX-ILoj6TqkISWP/channel/0/hlsll/live/index.m3u8` |
| 26 | `padang-atcs-balaikota-lapangan-apel` | ATCS Balaikota - Lapangan Apel | HLS | `https://streamcctv.padang.go.id:3000/stream/YPINFGp4-kY32-VwVF-VcFl-ZCiK0Gqe1Iud/channel/0/hlsll/live/index.m3u8` |
| 27 | `padang-atcs-balaikota-pintu-keluar` | ATCS Balaikota - Pintu Keluar | HLS | `https://streamcctv.padang.go.id:3000/stream/oenBR9SL-2hAp-HFPP-30KG-sjLChXQ9pyDj/channel/0/hlsll/live/index.m3u8` |
| 28 | `padang-atcs-bapenda` | ATCS Bapenda | HLS | `https://streamcctv.padang.go.id:3000/stream/dou2UFBz-QFaX-J6ac-IWxD-x7Y2zDyH4rgO/channel/0/hlsll/live/index.m3u8` |

### Kotawaringin Barat (22)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `kobar-atcs-bundaran-misbar` | Bundaran Misbar | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv1/a1.m3u8` |
| 2 | `kobar-atcs-simpang-3-smpn-1-arsel` | Simpang 3 SMPN 1 Arsel | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv2/a2.m3u8` |
| 3 | `kobar-atcs-simpang-3-gereja-imanuel` | Simpang 3 Gereja Imanuel | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv3/a3.m3u8` |
| 4 | `kobar-atcs-simpang-3-bank-kalteng` | Simpang 3 Bank Kalteng | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv4/a4.m3u8` |
| 5 | `kobar-atcs-simpang-3-rssi` | Simpang 3 RSSI | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv6/a6.m3u8` |
| 6 | `kobar-atcs-depan-rssi` | Depan RSSI | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv7/a7.m3u8` |
| 7 | `kobar-atcs-simpang-4-perkim` | Simpang 4 Perkim | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv8/a8.m3u8` |
| 8 | `kobar-atcs-bundaran-pancasila` | Bundaran Pancasila | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv9/a9.m3u8` |
| 9 | `kobar-atcs-simpang-pdam` | Simpang PDAM | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv10/a10.m3u8` |
| 10 | `kobar-atcs-simpang-4-pasar-baru` | Simpang 4 Pasar Baru | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv11/a11.m3u8` |
| 11 | `kobar-atcs-simpang-4-a-yani` | Simpang 4 A. Yani | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv12/a12.m3u8` |
| 12 | `kobar-atcs-simpang-3-city-mall` | Simpang 3 City Mall | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv13/a13.m3u8` |
| 13 | `kobar-atcs-bundaran-pramuka` | Bundaran Pramuka | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv14/a14.m3u8` |
| 14 | `kobar-atcs-simpang-3-terminal-lama` | Simpang 3 Terminal Lama | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv15/a15.m3u8` |
| 15 | `kobar-atcs-bundaran-tudung-saji` | Bundaran Tudung Saji | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv16/a16.m3u8` |
| 16 | `kobar-atcs-simpang-3-natai-palingkau` | Simpang 3 Natai Palingkau | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv17/a17.m3u8` |
| 17 | `kobar-atcs-bundaran-pancasila-2` | Bundaran Pancasila 2 | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv18/a18.m3u8` |
| 18 | `kobar-atcs-simpang-4-samari` | Simpang 4 Samari | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv19/a19.m3u8` |
| 19 | `kobar-atcs-bundaran-pangkalan-lima` | Bundaran Pangkalan Lima | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv20/a20.m3u8` |
| 20 | `kobar-atcs-kampung-sega` | Kampung Sega | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv21/a21.m3u8` |
| 21 | `kobar-atcs-bundaran-bahari` | Bundaran Bahari | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv31/a31.m3u8` |
| 22 | `kobar-atcs-bundaran-gentong` | Bundaran Gentong | HLS | `https://cctv.kotawaringinbaratkab.go.id/storage/stream/cctv32/a32.m3u8` |

### Banjar (20)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `banjar-atcs-setda-kota-banjar` | ATCS SETDA KOTA BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/setdabanjar.m3u8` |
| 2 | `banjar-atcs-garuda` | ATCS GARUDA | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/Garuda.m3u8` |
| 3 | `banjar-atcs-soponyono` | ATCS SOPONYONO | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/SUPOYONO1.m3u8` |
| 4 | `banjar-atcs-tugu-pahlawan-viaduct` | ATCS TUGU PAHLAWAN VIADUCT | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/piadeviaduc.m3u8` |
| 5 | `banjar-atcs-cikabuyutan` | ATCS CIKABUYUTAN | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/viar.m3u8` |
| 6 | `banjar-atcs-gang-holil-cimenyan` | ATCS GANG HOLIL CIMENYAN | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/holil1.m3u8` |
| 7 | `banjar-atcs-sman-1-banjar` | ATCS SMAN 1 BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/sman1.m3u8` |
| 8 | `banjar-atcs-singaperbangsa` | ATCS SINGAPERBANGSA | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/singaperbangsa.m3u8` |
| 9 | `banjar-atcs-alun-alun-arah-cimaragas` | ATCS ALUN ALUN ARAH CIMARAGAS | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/PTZ1alun-alunkota.m3u8` |
| 10 | `banjar-atcs-tugu-batas-jabar-arah-banjar` | ATCS TUGU BATAS JABAR ARAH BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/cijolang1.m3u8` |
| 11 | `banjar-atcs-langensari` | ATCS LANGENSARI | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/langensari1.m3u8` |
| 12 | `banjar-atcs-tugu-batas-jabar-arah-jateng` | ATCS TUGU BATAS JABAR ARAH JATENG | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/cijolang2.m3u8` |
| 13 | `banjar-atcs-pendopo-kota-banjar` | ATCS PENDOPO KOTA BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/ptzpendopo.m3u8` |
| 14 | `banjar-atcs-dobo-bbws` | ATCS DOBO BBWS | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/sumanding1.m3u8` |
| 15 | `banjar-atcs-rca-lama` | ATCS RCA LAMA | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/rcalama2.m3u8` |
| 16 | `banjar-atcs-simpang-gardu-arah-cimaragas` | ATCS SIMPANG GARDU ARAH CIMARAGAS | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/arahcimaragas.m3u8` |
| 17 | `banjar-atcs-tanjungsukur-dari-banjar` | ATCS TANJUNGSUKUR DARI BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/Tanjungsukur1.m3u8` |
| 18 | `banjar-atcs-tanjungsukur-arah-pangandaran` | ATCS TANJUNGSUKUR ARAH PANGANDARAN | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/arahpangandaran.m3u8` |
| 19 | `banjar-atcs-simpang-gardu-arah-banjar` | ATCS SIMPANG GARDU ARAH BANJAR | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/spgardu.m3u8` |
| 20 | `banjar-atcs-singaperbangsa-2` | ATCS SINGAPERBANGSA 2 | HLS | `https://atcs.banjarkota.go.id:5443/LiveApp/streams/singaperbangsa2.m3u8` |

### Situbondo (19)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `situbondo-atcs-pantai-blitok` | Pantai Blitok | HLS | `https://cctvstream.situbondokab.go.id/cctv8/index.m3u8` |
| 2 | `situbondo-atcs-depan-kominfo` | Depan Kominfo | HLS | `https://cctvstream.situbondokab.go.id/cctv6/index.m3u8` |
| 3 | `situbondo-atcs-paseban-alun-alun-situbondo` | Paseban Alun-Alun Situbondo | HLS | `https://cctvstream.situbondokab.go.id/cctv1/index.m3u8` |
| 4 | `situbondo-atcs-pdam-selatan-alun-alun-situbondo` | PDAM Selatan Alun-Alun Situbondo | HLS | `https://cctvstream.situbondokab.go.id/cctv3/index.m3u8` |
| 5 | `situbondo-atcs-simpang-buduan` | Simpang Buduan | HLS | `https://cctvstream.situbondokab.go.id/cctv109/index.m3u8` |
| 6 | `situbondo-atcs-simpang-tiga-panarukan` | Simpang Tiga Panarukan | HLS | `https://cctvstream.situbondokab.go.id/cctv110/index.m3u8` |
| 7 | `situbondo-atcs-simpang-tiga-wringinanom` | Simpang Tiga Wringinanom | HLS | `https://cctvstream.situbondokab.go.id/cctv105/index.m3u8` |
| 8 | `situbondo-atcs-simpang-tugu-jam` | Simpang Tugu Jam | HLS | `https://cctvstream.situbondokab.go.id/cctv118/index.m3u8` |
| 9 | `situbondo-atcs-simpang-bhayangkara` | Simpang Bhayangkara | HLS | `https://cctvstream.situbondokab.go.id/cctv119/index.m3u8` |
| 10 | `situbondo-atcs-simpang-alun-alun-situbondo` | Simpang Alun-Alun Situbondo | HLS | `https://cctvstream.situbondokab.go.id/cctv117/index.m3u8` |
| 11 | `situbondo-atcs-simpang-ab-timur` | Simpang AB Timur | HLS | `https://cctvstream.situbondokab.go.id/cctv115/index.m3u8` |
| 12 | `situbondo-atcs-dam-pintu-lima` | Dam Pintu Lima | HLS | `https://cctvstream.situbondokab.go.id/cctv101/index.m3u8` |
| 13 | `situbondo-atcs-simpang-smea-ptz` | Simpang SMEA PTZ | HLS | `https://cctvstream.situbondokab.go.id/cctv122/index.m3u8` |
| 14 | `situbondo-atcs-simpang-smea` | Simpang SMEA | HLS | `https://cctvstream.situbondokab.go.id/cctv104/index.m3u8` |
| 15 | `situbondo-atcs-simpang-man` | Simpang MAN | HLS | `https://cctvstream.situbondokab.go.id/cctv102/index.m3u8` |
| 16 | `situbondo-atcs-simpang-tiga-pg-panji` | Simpang Tiga PG Panji | HLS | `https://cctvstream.situbondokab.go.id/cctv106/index.m3u8` |
| 17 | `situbondo-atcs-simpang-kapongan` | Simpang Kapongan | HLS | `https://cctvstream.situbondokab.go.id/cctv107/index.m3u8` |
| 18 | `situbondo-atcs-simpang-tiga-ps-kampung` | Simpang Tiga Ps. Kampung | HLS | `https://cctvstream.situbondokab.go.id/cctv113/index.m3u8` |
| 19 | `situbondo-atcs-simpang-tiga-ps-asembagus` | Simpang Tiga Ps. Asembagus | HLS | `https://cctvstream.situbondokab.go.id/cctv112/index.m3u8` |

### Solok (18)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `solok-atcs-kamera-2-tamkot` | ATCS Kamera 2 Tamkot | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/w7yqaxXcMN/s.m3u8` |
| 2 | `solok-atcs-kamera-1-tamkot` | ATCS Kamera 1 Tamkot | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/1HeP8CqelC/s.m3u8` |
| 3 | `solok-atcs-simpang-surya-1` | ATCS Simpang Surya 1 | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/wGQCDSehHZ/s.m3u8` |
| 4 | `solok-atcs-simpang-surya-2` | ATCS Simpang Surya 2 | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/RRZ8t7eDoj/s.m3u8` |
| 5 | `solok-atcs-kamera-3-tamkot` | ATCS Kamera 3 Tamkot | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/usxJ4SBBQm/s.m3u8` |
| 6 | `solok-atcs-simpang-denpal-1` | ATCS Simpang Denpal 1 | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/d8r3Eiz0HR/s.m3u8` |
| 7 | `solok-atcs-simpang-denpal-2` | ATCS Simpang Denpal 2 | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/rxYwsm9QxE/s.m3u8` |
| 8 | `solok-atcs-pandan-ujung` | ATCS Pandan Ujung | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/vYLBXTKGU4/s.m3u8` |
| 9 | `solok-atcs-kamera-1-batas-selayo` | ATCS Kamera 1 Batas Selayo | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/NP1CmZyRwn/s.m3u8` |
| 10 | `solok-atcs-kamera-1-simp-ambacang` | ATCS Kamera 1 Simp Ambacang | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/QL27Ntzsq0/s.m3u8` |
| 11 | `solok-atcs-kamera-1-taman-poliguna` | ATCS Kamera 1 Taman Poliguna | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/sc6gy5gpqR/s.m3u8` |
| 12 | `solok-atcs-simpang-kemenag` | ATCS Simpang Kemenag | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/JPK7VjJT29/s.m3u8` |
| 13 | `solok-atcs-kamera-1-simp-rumbio` | ATCS Kamera 1 Simp Rumbio | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/AH1QKjwNk6/s.m3u8` |
| 14 | `solok-atcs-tugu-latsitarda-laing` | ATCS Tugu Latsitarda Laing | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/WsuKNR8XvU/s.m3u8` |
| 15 | `solok-atcs-simpang-smpn-1` | ATCS Simpang SMPN 1 | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/0F8nAlc4MM/s.m3u8` |
| 16 | `solok-atcs-rsud-serambi-madinah` | ATCS RSUD Serambi Madinah | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/b54OfjWyr1/s.m3u8` |
| 17 | `solok-atcs-gerbang-balai-kota-solok` | ATCS Gerbang Balai Kota Solok | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/x7YnhOLdlN/s.m3u8` |
| 18 | `solok-atcs-simpang-sma-muhammadiyah` | ATCS Simpang SMA Muhammadiyah | HLS | `https://cctv.solokkota.go.id/dzangPmUdufLge4NPUBaUcS7hhC4mn/hls/EvK5Hygy0I/2YMQFOF2ex/s.m3u8` |

### Tasikmalaya (18)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `tasikmalaya-atcs-simpang-jati` | ATCS SIMPANG JATI | HLS | `https://atcs.tasikmalayakota.go.id/camera/jati.m3u8` |
| 2 | `tasikmalaya-atcs-simpang-rancabango-arah-simpang-bantar` | ATCS SIMPANG RANCABANGO ARAH SIMPANG BANTAR | HLS | `https://atcs.tasikmalayakota.go.id/camera/rancabangoptz.m3u8` |
| 3 | `tasikmalaya-atcs-simpang-rancabango-arah-letnan-harun` | ATCS SIMPANG RANCABANGO ARAH LETNAN HARUN | HLS | `https://atcs.tasikmalayakota.go.id/camera/rancabangoarahletnanharun.m3u8` |
| 4 | `tasikmalaya-atcs-simpang-mitra-batik` | ATCS SIMPANG MITRA BATIK | HLS | `https://atcs.tasikmalayakota.go.id/camera/mitrabatik.m3u8` |
| 5 | `tasikmalaya-atcs-simpang-lima` | ATCS SIMPANG LIMA | HLS | `https://atcs.tasikmalayakota.go.id/camera/simpanglima.m3u8` |
| 6 | `tasikmalaya-atcs-simpang-cimulu` | ATCS SIMPANG CIMULU | HLS | `https://atcs.tasikmalayakota.go.id/camera/cimulu.m3u8` |
| 7 | `tasikmalaya-atcs-simpang-dewi-sartika-arah-masjid-agung` | ATCS SIMPANG DEWI SARTIKA ARAH MASJID AGUNG | HLS | `https://atcs.tasikmalayakota.go.id/camera/dewisartikaarahmasjidagung.m3u8` |
| 8 | `tasikmalaya-atcs-simpang-masjid-agung` | ATCS SIMPANG MASJID AGUNG | HLS | `https://atcs.tasikmalayakota.go.id/camera/masjidagungptz.m3u8` |
| 9 | `tasikmalaya-atcs-simpang-nagarawangi` | ATCS SIMPANG NAGARAWANGI | HLS | `https://atcs.tasikmalayakota.go.id/camera/nagarawangi.m3u8` |
| 10 | `tasikmalaya-atcs-simpang-alun-alun-arah-otista` | ATCS SIMPANG ALUN-ALUN ARAH OTISTA | HLS | `https://atcs.tasikmalayakota.go.id/camera/alunalunarahotista.m3u8` |
| 11 | `tasikmalaya-atcs-simpang-alun-alun-arah-sutisna-senjaya` | ATCS SIMPANG ALUN-ALUN ARAH SUTISNA SENJAYA | HLS | `https://atcs.tasikmalayakota.go.id/camera/alunalunarahsutsen.m3u8` |
| 12 | `tasikmalaya-atcs-simpang-pataruman-ptz` | ATCS SIMPANG PATARUMAN PTZ | HLS | `https://atcs.tasikmalayakota.go.id/camera/patarumanptz.m3u8` |
| 13 | `tasikmalaya-atcs-simpang-pataruman-fix` | ATCS SIMPANG PATARUMAN FIX | HLS | `https://atcs.tasikmalayakota.go.id/camera/patarumanarahnagarawangi.m3u8` |
| 14 | `tasikmalaya-atcs-simpang-panyerutan-ptz` | ATCS SIMPANG PANYERUTAN PTZ | HLS | `https://atcs.tasikmalayakota.go.id/camera/panyerutanptz.m3u8` |
| 15 | `tasikmalaya-atcs-simpang-panyerutan-fix` | ATCS SIMPANG PANYERUTAN FIX | HLS | `https://atcs.tasikmalayakota.go.id/camera/panyerutanarahnagarawangi.m3u8` |
| 16 | `tasikmalaya-atcs-simpang-paseh` | ATCS SIMPANG PASEH | HLS | `https://atcs.tasikmalayakota.go.id/camera/pasehptz.m3u8` |
| 17 | `tasikmalaya-atcs-simpang-padayungan` | ATCS SIMPANG PADAYUNGAN | HLS | `https://atcs.tasikmalayakota.go.id/camera/padayunganarahkawalu.m3u8` |
| 18 | `tasikmalaya-atcs-simpang-rumah-sakit` | ATCS SIMPANG RUMAH SAKIT | HLS | `https://atcs.tasikmalayakota.go.id/camera/rumahsakit.m3u8` |

### Kediri (17)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `kediri-atcs-jetis` | ATCS Jetis | HLS | `https://pplterpadu.kedirikota.go.id:8888/jetis/index.m3u8` |
| 2 | `kediri-atcs-tosaren` | ATCS Tosaren | HLS | `https://pplterpadu.kedirikota.go.id:8888/tosaren/index.m3u8` |
| 3 | `kediri-atcs-baruna` | ATCS Baruna | HLS | `https://pplterpadu.kedirikota.go.id:8888/baruna/index.m3u8` |
| 4 | `kediri-atcs-alun-alun` | ATCS Alun-Alun | HLS | `https://pplterpadu.kedirikota.go.id:8888/alun_alun/index.m3u8` |
| 5 | `kediri-atcs-bandar-ngalim` | ATCS Bandar Ngalim | HLS | `https://pplterpadu.kedirikota.go.id:8888/bandar_ngalim/index.m3u8` |
| 6 | `kediri-atcs-mrican` | ATCS Mrican | HLS | `https://pplterpadu.kedirikota.go.id:8888/mrican/index.m3u8` |
| 7 | `kediri-atcs-iskandar-muda` | ATCS Iskandar Muda | HLS | `https://pplterpadu.kedirikota.go.id:8888/iskandar_muda/index.m3u8` |
| 8 | `kediri-atcs-muning` | ATCS Muning | HLS | `https://pplterpadu.kedirikota.go.id:8888/muning/index.m3u8` |
| 9 | `kediri-atcs-semampir` | ATCS Semampir | HLS | `https://pplterpadu.kedirikota.go.id:8888/semampir/index.m3u8` |
| 10 | `kediri-atcs-nabatiasa` | ATCS Nabatiasa | HLS | `https://pplterpadu.kedirikota.go.id:8888/nabatiasa/index.m3u8` |
| 11 | `kediri-atcs-dandangan` | ATCS Dandangan | HLS | `https://pplterpadu.kedirikota.go.id:8888/dandangan/index.m3u8` |
| 12 | `kediri-atcs-water-tower` | ATCS Water Tower | HLS | `https://pplterpadu.kedirikota.go.id:8888/water_torn/index.m3u8` |
| 13 | `kediri-atcs-tamanan` | ATCS Tamanan | HLS | `https://pplterpadu.kedirikota.go.id:8888/tamanan/index.m3u8` |
| 14 | `kediri-atcs-a-yani-utara` | ATCS A. Yani Utara | HLS | `https://pplterpadu.kedirikota.go.id:8888/a_yani_utara/index.m3u8` |
| 15 | `kediri-atcs-kawi` | ATCS Kawi | HLS | `https://pplterpadu.kedirikota.go.id:8888/kawi/index.m3u8` |
| 16 | `kediri-atcs-sukorame` | ATCS Sukorame | HLS | `https://pplterpadu.kedirikota.go.id:8888/sukorame/index.m3u8` |
| 17 | `kediri-atcs-a-yani-selatan` | ATCS A. Yani Selatan | HLS | `https://pplterpadu.kedirikota.go.id:8888/a_yani_selatan/index.m3u8` |

### Banyumas (20)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `banyumas-atcs-cctv-simpang-gor-satria` | ATCS CCTV SIMPANG GOR SATRIA | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_gor_satria/index.m3u8` |
| 2 | `banyumas-atcs-cctv-simpang-kebondalem` | ATCS CCTV SIMPANG KEBONDALEM | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_kebondalem/index.m3u8` |
| 3 | `banyumas-atcs-cctv-simpang-kebondalem-barat` | ATCS CCTV SIMPANG KEBONDALEM BARAT | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_kebondalem_barat/index.m3u8` |
| 4 | `banyumas-atcs-cctv-simpang-karang-bawang-timur` | ATCS CCTV SIMPANG KARANG BAWANG TIMUR | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_karang_bawang_timur/index.m3u8` |
| 5 | `banyumas-atcs-cctv-ruas-patriot` | ATCS CCTV RUAS PATRIOT | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_ruas_patriot/index.m3u8` |
| 6 | `banyumas-atcs-cctv-simpang-museum-bri` | ATCS CCTV SIMPANG MUSEUM-BRI | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_museum_bri/index.m3u8` |
| 7 | `banyumas-atcs-cctv-simpang-alun-alun` | ATCS CCTV SIMPANG ALUN ALUN | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_alun_alun/index.m3u8` |
| 8 | `banyumas-atcs-cctv-simpang-kebon-dalem-timur` | ATCS CCTV SIMPANG KEBON DALEM TIMUR | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_kebon_dalem_timur/index.m3u8` |
| 9 | `banyumas-atcs-cctv-simpang-jl-masjid` | ATCS CCTV SIMPANG JL MASJID | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_jl_masjid/index.m3u8` |
| 10 | `banyumas-atcs-cctv-simpang-sangkal-putung` | ATCS CCTV SIMPANG SANGKAL PUTUNG | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_sangkal_putung/index.m3u8` |
| 11 | `banyumas-atcs-cctv-simpang-situmpur` | ATCS CCTV SIMPANG SITUMPUR | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_situmpur/index.m3u8` |
| 12 | `banyumas-atcs-cctv-underpass` | ATCS CCTV UNDERPASS | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_underpass/index.m3u8` |
| 13 | `banyumas-atcs-cctv-simpang-karanglo` | ATCS CCTV SIMPANG KARANGLO | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_karanglo/index.m3u8` |
| 14 | `banyumas-atcs-cctv-simpang-ajibarang` | ATCS CCTV SIMPANG AJIBARANG | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_ajibarang/index.m3u8` |
| 15 | `banyumas-atcs-cctv-simpang-simpang-patriot` | ATCS CCTV SIMPANG SIMPANG PATRIOT | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_simpang_patriot/index.m3u8` |
| 16 | `banyumas-atcs-cctv-simpang-patriot` | ATCS CCTV SIMPANG PATRIOT | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_patriot/index.m3u8` |
| 17 | `banyumas-atcs-cctv-simpang-karang-bawang` | ATCS CCTV SIMPANG KARANG BAWANG | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_karang_bawang/index.m3u8` |
| 18 | `banyumas-atcs-cctv-simpang-karang-bawang-barat` | ATCS CCTV SIMPANG KARANG BAWANG BARAT | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_karang_bawang_barat/index.m3u8` |
| 19 | `banyumas-atcs-cctv-simpang-tanjung-utara` | ATCS CCTV SIMPANG TANJUNG UTARA | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_simpang_tanjung_utara/index.m3u8` |
| 20 | `banyumas-atcs-cctv-ruas-tugu-adipura` | ATCS CCTV RUAS TUGU ADIPURA | HLS | `https://cctv.dev.banyumaskab.go.id/cctv_ruas_tugu_adipura/index.m3u8` |

### Jakarta (15)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `jakarta-unofficial-gatot-subroto-jpo-02` | JPO Jl. Gatot Subroto | HLS | `https://dki-jkt.balitower.co.id:7028/502045_JKP_POLDA_JPO-JL.-GATOT-SUBROTO-7_CCTV-02/index.fmp4.m3u8` |
| 2 | `binamarga-unofficial-atp-atp-km-58-400-a` | Akses Tanjung Priok ATP KM 58+400 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/687489889091511277827377.m3u8` |
| 3 | `binamarga-unofficial-atp-atp-km-61-400-a` | Akses Tanjung Priok ATP KM 61+400 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/756751654695732090756915.m3u8` |
| 4 | `binamarga-unofficial-atp-atp-km-63-000-a` | Akses Tanjung Priok ATP KM 63+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/167891762725762261014120.m3u8` |
| 5 | `binamarga-unofficial-atp-atp-km-65-000-a` | Akses Tanjung Priok ATP KM 65+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/359581681833174683835659.m3u8` |
| 6 | `binamarga-unofficial-atp-atp-km-67-200-a` | Akses Tanjung Priok ATP KM 67+200 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/806970033882204083458834.m3u8` |
| 7 | `binamarga-unofficial-becakayu-km-02-000-a` | Tol Becakayu KM 02+000 A | HLS | `https://cctv.kkdm.co.id/api/cctv/1/3/index.m3u8` |
| 8 | `binamarga-unofficial-becakayu-km-03-000-a` | Tol Becakayu KM 03+000 A | HLS | `https://cctv.kkdm.co.id/api/cctv/1/4/index.m3u8` |
| 9 | `binamarga-unofficial-becakayu-km-12-000-a` | Tol Becakayu KM 12+000 A | HLS | `https://cctv.kkdm.co.id/api/cctv/1/1/index.m3u8` |
| 10 | `binamarga-unofficial-becakayu-km-14-000-a` | Tol Becakayu KM 14+000 A | HLS | `https://cctv.kkdm.co.id/api/cctv/1/40/index.m3u8` |
| 11 | `binamarga-unofficial-becakayu-km-15-000-a` | Tol Becakayu KM 15+000 A | HLS | `https://cctv.kkdm.co.id/api/cctv/1/50/index.m3u8` |
| 12 | `binamarga-unofficial-becakayu-on-ramp-wiyoto-wiyono` | Tol Becakayu On Ramp Wiyoto Wiyono | HLS | `https://cctv.kkdm.co.id/api/cctv/1/39/index.m3u8` |
| 13 | `binamarga-unofficial-becakayu-loop-pasar-gembrong` | Tol Becakayu Loop Pasar Gembrong | HLS | `https://cctv.kkdm.co.id/api/cctv/1/37/index.m3u8` |
| 14 | `binamarga-unofficial-becakayu-on-ramp-cassablanca` | Tol Becakayu On Ramp Cassablanca | HLS | `https://cctv.kkdm.co.id/api/cctv/1/35/index.m3u8` |
| 15 | `binamarga-unofficial-becakayu-off-ramp-cipinang` | Tol Becakayu Off Ramp Cipinang | HLS | `https://cctv.kkdm.co.id/api/cctv/1/47/index.m3u8` |

### Banten (37)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `banten-atcs-bapenda-lantai-1` | ATCS BAPENDA LANTAI 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/3f0e8fb8-7271-4c78-bf9d-8d766b4962a5/index.m3u8` |
| 2 | `banten-atcs-bapenda-lantai-2` | ATCS BAPENDA LANTAI 2 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/e4019c7f-7960-435d-960c-cacdf4afe157/index.m3u8` |
| 3 | `banten-atcs-kp3b-gerbang-2-dprd` | ATCS KP3B GERBANG 2 DPRD | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/83856d86-2982-44c9-b529-6665ccadea12/index.m3u8` |
| 4 | `banten-atcs-lebak-jl-kaum-1` | ATCS LEBAK JL. KAUM - 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/a895f202-ca7e-457f-bce0-ea95076b093b/index.m3u8` |
| 5 | `banten-atcs-lebak-jl-kaum-1-2` | ATCS LEBAK JL. KAUM - 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/c878505f-5104-45e7-b4db-5ed348414274/index.m3u8` |
| 6 | `banten-atcs-lebak-jl-kaum-2` | ATCS LEBAK JL. KAUM - 2 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/6ff089e1-c655-4496-ad53-86e76b14d442/index.m3u8` |
| 7 | `banten-atcs-lebak-jl-alun-alun-selatan-1` | ATCS LEBAK JL. ALUN-ALUN SELATAN 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/b728076e-c704-426f-8435-931aade6a6ca/index.m3u8` |
| 8 | `banten-atcs-lebak-jl-alun-alun-selatan-2` | ATCS LEBAK JL. ALUN-ALUN SELATAN 2 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/2573b9f6-6591-4e3d-be73-585e5a875eb8/index.m3u8` |
| 9 | `banten-atcs-lebak-jl-alun-alun-selatan-3` | ATCS LEBAK JL. ALUN-ALUN SELATAN 3 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/d72fbd4c-ead6-4c9d-b796-3e61249a0fe7/index.m3u8` |
| 10 | `banten-atcs-lebak-jl-r-m-nata-atmaja-1` | ATCS LEBAK JL. R.M. NATA ATMAJA - 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/286bfabf-cdf2-460c-b429-d95cbfa19004/index.m3u8` |
| 11 | `banten-atcs-lebak-jl-r-m-nata-atmaja-2` | ATCS LEBAK JL. R.M. NATA ATMAJA - 2 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/988f9611-c898-44d1-a100-06797f792c8c/index.m3u8` |
| 12 | `banten-atcs-lebak-jl-r-m-nata-atmaja-3` | ATCS LEBAK JL. R.M. NATA ATMAJA - 3 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/41d33aa8-dd48-45a8-bc38-476de213d1b9/index.m3u8` |
| 13 | `banten-atcs-lebak-jl-r-t-hardiwinangun-1` | ATCS LEBAK JL R.T. HARDIWINANGUN - 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/8baaab58-7f4f-40f9-a8c6-1d0fe96691c4/index.m3u8` |
| 14 | `banten-atcs-lebak-jl-r-t-hardiwinangun-2` | ATCS LEBAK JL R.T. HARDIWINANGUN - 2 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/618e6d19-fd4a-48e3-a5cb-5c40ef95827d/index.m3u8` |
| 15 | `banten-atcs-banten-pal-lima-timur` | ATCS BANTEN PAL LIMA TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/65be9f99-c9ce-4045-a722-a51ad11aafd4/index.m3u8` |
| 16 | `banten-atcs-banten-pal-lima-barat` | ATCS BANTEN PAL LIMA BARAT | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/db52373d-894f-4279-9c2f-c9d50d3bc2b1/index.m3u8` |
| 17 | `banten-atcs-banten-kebun-jahe-timur` | ATCS BANTEN KEBUN JAHE TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/a8a5eed6-d340-4002-89b8-89cd445c9210/index.m3u8` |
| 18 | `banten-atcs-banten-kebun-jahe-selatan` | ATCS BANTEN KEBUN JAHE SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/f4901c8e-e3b2-4356-969d-ca5762d1f699/index.m3u8` |
| 19 | `banten-atcs-banten-sayabulu-utara` | ATCS BANTEN SAYABULU UTARA | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/70dd78e7-741b-4fb9-a0a1-7ceb6ba2f80d/index.m3u8` |
| 20 | `banten-atcs-banten-batok-bali-timur` | ATCS BANTEN BATOK BALI TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/d9b5c4af-23f4-411c-b0af-b2c263a65e1f/index.m3u8` |
| 21 | `banten-atcs-banten-brimob-utara` | ATCS BANTEN BRIMOB UTARA | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/fcf9d25c-12f4-49d5-9ff5-48336e5dbad7/index.m3u8` |
| 22 | `banten-atcs-banten-brimob-timur` | ATCS BANTEN BRIMOB TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/5301c3c5-f007-4ce2-88a1-220ccfd20a7c/index.m3u8` |
| 23 | `banten-atcs-banten-brimob-barat` | ATCS BANTEN BRIMOB BARAT | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/16cd60dc-c7ad-425e-bd7d-6b96ed5e1a5b/index.m3u8` |
| 24 | `banten-atcs-banten-pisang-mas-utara` | ATCS BANTEN PISANG MAS UTARA | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/ffc44a84-39c5-4c94-92d7-c4121a4426db/index.m3u8` |
| 25 | `banten-atcs-banten-pisang-mas-timur` | ATCS BANTEN PISANG MAS TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/7b5a6593-ad43-491c-ae85-192f7744d4c3/index.m3u8` |
| 26 | `banten-atcs-banten-pisang-mas-selatan` | ATCS BANTEN PISANG MAS SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/785bb760-4398-43c9-a08f-b054d9bd651d/index.m3u8` |
| 27 | `banten-atcs-banten-pisang-mas-barat` | ATCS BANTEN PISANG MAS BARAT | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/89e2c32e-6782-499e-a7f2-877ec8100a19/index.m3u8` |
| 28 | `banten-atcs-banten-pisang-mas-barat-2` | ATCS BANTEN PISANG MAS BARAT | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/0aa5daf2-3108-4e8b-a932-02a649e483d2/index.m3u8` |
| 29 | `banten-atcs-banten-ciceri-utara` | ATCS BANTEN CICERI UTARA | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/6707cf59-2bd0-4849-90d6-24e7ef0e4b96/index.m3u8` |
| 30 | `banten-atcs-banten-pal-lima-selatan` | ATCS BANTEN PAL LIMA SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/2c118679-fefa-4f8b-9c72-a48a9fe5c4c4/index.m3u8` |
| 31 | `banten-atcs-banten-ciceri-selatan` | ATCS BANTEN CICERI SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/ebbfacb6-525d-423a-a1dc-239cc01fcf8f/index.m3u8` |
| 32 | `banten-atcs-banten-sempu-selatan` | ATCS BANTEN SEMPU SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/f7a5eca7-f07f-4726-8550-9c9aea4c66b5/index.m3u8` |
| 33 | `banten-atcs-gerbang-1` | ATCS GERBANG 1 | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/9ccff807-bbfe-44a2-b27a-80450fd8471b/index.m3u8` |
| 34 | `banten-atcs-banten-kebun-jahe-barat` | ATCS BANTEN KEBUN JAHE BARAT | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/d5999b43-3161-4c7d-b87b-7ad417149d30/index.m3u8` |
| 35 | `banten-atcs-banten-kepandean-timur` | ATCS BANTEN KEPANDEAN TIMUR | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/e2e72734-e1b0-412e-8dd1-7eecfea6f778/index.m3u8` |
| 36 | `banten-atcs-banten-ciceri-utara-2` | ATCS BANTEN CICERI UTARA | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/87ccf2f1-d66f-4e77-a6c8-8a2d9471bbeb/index.m3u8` |
| 37 | `banten-atcs-banten-brimob-selatan` | ATCS BANTEN BRIMOB SELATAN | HLS | `https://cctv.bantenprov.go.id/service/stream-cctv/7c91385c-ed15-499b-8c07-e5f25b3d8228/index.m3u8` |

### Padang Panjang (14)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `padangpanjang-atcs-simpang-pasar-kamera-1` | ATCS Simpang Pasar Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam15/index.m3u8` |
| 2 | `padangpanjang-atcs-simpang-8-kamera-1` | ATCS Simpang 8 Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam13/index.m3u8` |
| 3 | `padangpanjang-atcs-simpang-8-kamera-2` | ATCS Simpang 8 Kamera 2 | HLS | `https://mtx.padangpanjang.go.id:3443/cam14/index.m3u8` |
| 4 | `padangpanjang-atcs-simpang-m-syafe-i-kamera-1` | ATCS Simpang M.Syafe'i Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam2/index.m3u8` |
| 5 | `padangpanjang-atcs-simpang-ab-mart-kamera-1` | ATCS Simpang AB Mart Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam8/index.m3u8` |
| 6 | `padangpanjang-atcs-simpang-ab-mart-kamera-2` | ATCS Simpang AB Mart Kamera 2 | HLS | `https://mtx.padangpanjang.go.id:3443/cam9/index.m3u8` |
| 7 | `padangpanjang-atcs-simpang-kacang-kayu-kamera-1` | ATCS Simpang Kacang Kayu Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam6/index.m3u8` |
| 8 | `padangpanjang-atcs-simpang-kacang-kayu-kamera-2` | ATCS Simpang Kacang Kayu Kamera 2 | HLS | `https://mtx.padangpanjang.go.id:3443/cam7/index.m3u8` |
| 9 | `padangpanjang-atcs-simpang-ekor-lubuk-kamera-1` | ATCS Simpang Ekor Lubuk Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam3/index.m3u8` |
| 10 | `padangpanjang-atcs-simpang-mtsn-ganting-kamera-1` | ATCS Simpang MTSN Ganting Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam4/index.m3u8` |
| 11 | `padangpanjang-atcs-simpang-mtsn-ganting-kamera-2` | ATCS Simpang MTSN Ganting Kamera 2 | HLS | `https://mtx.padangpanjang.go.id:3443/cam5/index.m3u8` |
| 12 | `padangpanjang-atcs-simpang-pdam-kamera-2` | ATCS Simpang PDAM Kamera 2 | HLS | `https://mtx.padangpanjang.go.id:3443/cam10/index.m3u8` |
| 13 | `padangpanjang-atcs-simpang-pdam-kamera-1` | ATCS Simpang PDAM Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam11/index.m3u8` |
| 14 | `padangpanjang-atcs-simpang-serambi-kamera-1` | ATCS Simpang Serambi Kamera 1 | HLS | `https://mtx.padangpanjang.go.id:3443/cam1/index.m3u8` |

### Mataram (12)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `mataram-atcs-sp4-tanaaji-fix-selatan` | ATCS Simpang 4 Tanah Aji Selatan (fixed) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-tanaaji-fix-selatan/video1_stream.m3u8` |
| 2 | `mataram-atcs-jl-gajahmada-utara` | ATCS Jl. Gajah Mada Utara | HLS | `https://relay-cctv.mataramkota.go.id/jl-gajahmada-utara/video1_stream.m3u8` |
| 3 | `mataram-atcs-pelican-udayana-ptz` | ATCS Pelican Udayana (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/pelican-udayana-ptz/video1_stream.m3u8` |
| 4 | `mataram-atcs-sp4-sweta-ptz` | ATCS Simpang 4 Sweta (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-sweta-ptz/video1_stream.m3u8` |
| 5 | `mataram-atcs-sp4-bi-ptz` | ATCS Simpang 4 BI (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-bi-ptz/video1_stream.m3u8` |
| 6 | `mataram-atcs-sp3-turide-ptz` | ATCS Simpang 3 Turide (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp3-turide-ptz/video1_stream.m3u8` |
| 7 | `mataram-atcs-sp4-taman-utara-ptz` | ATCS Simpang 4 Taman Utara (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-taman-utara-ptz/video1_stream.m3u8` |
| 8 | `mataram-atcs-sp4-golkar-ptz` | ATCS Simpang 4 Golkar (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-golkar-ptz/video1_stream.m3u8` |
| 9 | `mataram-atcs-sp4-golkar-fix-selatan` | ATCS Simpang 4 Golkar Selatan (fixed) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-golkar-fix-selatan/video1_stream.m3u8` |
| 10 | `mataram-atcs-sp4-golkar-fix-utara` | ATCS Simpang 4 Golkar Utara (fixed) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-golkar-fix-utara/video1_stream.m3u8` |
| 11 | `mataram-atcs-sp4-pagesangan-ptz` | ATCS Simpang 4 Pagesangan (PTZ) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-pagesangan-ptz/video1_stream.m3u8` |
| 12 | `mataram-atcs-sp4-pagesangan-fix-selatan` | ATCS Simpang 4 Pagesangan Selatan (fixed) | HLS | `https://relay-cctv.mataramkota.go.id/sp4-pagesangan-fix-selatan/video1_stream.m3u8` |

### Tanah Bumbu (11)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `tanahbumbu-atcs-batulicin-arah-utara` | Batulicin Arah Utara | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch06/index.m3u8` |
| 2 | `tanahbumbu-atcs-kecamatan-satui-simp-4-sumpul` | Kecamatan Satui / Simp. 4 Sumpul | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch04/index.m3u8` |
| 3 | `tanahbumbu-atcs-lapangan-7-februari-pagatan-arah-timur` | Lapangan 7 Februari Pagatan Arah Timur | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch05/index.m3u8` |
| 4 | `tanahbumbu-atcs-lapangan-7-februari-pagatan-arah-utara` | Lapangan 7 Februari Pagatan Arah Utara | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch03/index.m3u8` |
| 5 | `tanahbumbu-atcs-masjid-apung` | Masjid Apung | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch02/index.m3u8` |
| 6 | `tanahbumbu-atcs-satui-barat` | Satui Barat | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch01/index.m3u8` |
| 7 | `tanahbumbu-atcs-simpang-3-kodeco-selatan` | Simpang 3 Kodeco Selatan | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch14/index.m3u8` |
| 8 | `tanahbumbu-atcs-simpang-4-lampu-merah-barat` | Simpang 4 Lampu Merah Barat | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch10/index.m3u8` |
| 9 | `tanahbumbu-atcs-simpang-empat-kompi-arah-timur` | Simpang Empat Kompi Arah Timur | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch11/index.m3u8` |
| 10 | `tanahbumbu-atcs-simpang-empat-kompi-barat` | Simpang Empat Kompi Barat | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch12/index.m3u8` |
| 11 | `tanahbumbu-atcs-simpang-empat-lampu-merah-selatan` | Simpang Empat Lampu Merah Selatan | HLS | `https://atcs.tanahbumbukab.go.id/hls/cctv_ch08/index.m3u8` |

### Pesisir Selatan (7)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `pesisirselatan-atcs-kamera-carocok-2` | ATCS Kamera Carocok 2 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/YAdOkhEh2E/s.m3u8` |
| 2 | `pesisirselatan-atcs-kamera-carocok-3` | ATCS Kamera Carocok 3 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/1wbuTqepYN/s.m3u8` |
| 3 | `pesisirselatan-atcs-taman-spora-1` | ATCS Taman Spora 1 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/m7cQGqqNKo/s.m3u8` |
| 4 | `pesisirselatan-atcs-taman-spora-2` | ATCS Taman Spora 2 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/Vy91pQ56X7/s.m3u8` |
| 5 | `pesisirselatan-atcs-mesjid-terapung` | ATCS Mesjid Terapung | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/dXr6jrlx9s/s.m3u8` |
| 6 | `pesisirselatan-atcs-batas-kota-1` | ATCS Batas Kota 1 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/ttygSs99dy/s.m3u8` |
| 7 | `pesisirselatan-atcs-batas-kota-2` | ATCS Batas kota 2 | HLS | `https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/8poXDsVDvP/s.m3u8` |

### Pati (4)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `pati-atcs-dishub-terminal-1-pati` | ATCS Dishub Terminal 1 Pati | HLS | `https://streaming.patikab.go.id/memfs/22ab6501-63f2-43d6-af1b-ce6c1ed7cef0.m3u8` |
| 2 | `pati-atcs-dishub-terminal-2-pati` | ATCS Dishub Terminal 2 Pati | HLS | `https://streaming.patikab.go.id/memfs/dfd316df-7293-40d8-b523-0b2b7ddb79df.m3u8` |
| 3 | `pati-atcs-dishub-terminal-3-pati` | ATCS Dishub Terminal 3 Pati | HLS | `https://streaming.patikab.go.id/memfs/e74e945a-e872-4f35-9ebd-b25d78db0a8c.m3u8` |
| 4 | `pati-atcs-cctv-alun-alun-simpang-lima-pati` | CCTV Alun-Alun Simpang Lima Pati | HLS | `https://streaming.patikab.go.id/memfs/8eff05af-b414-41ef-b9fb-45102439095d.m3u8` |

### Gresik (55)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `gresik-atcs-perempatan-duduksampeyan-4` | PEREMPATAN DUDUKSAMPEYAN 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-duduksampeyan-4/index.m3u8` |
| 2 | `gresik-atcs-cctv-panoramic-putri-cempo` | CCTV PANORAMIC PUTRI CEMPO | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-panoramic-putri-cempo/index.m3u8` |
| 3 | `gresik-atcs-bandara-bawean-3` | BANDARA BAWEAN 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/bandara-bawean-3/index.m3u8` |
| 4 | `gresik-atcs-perempatan-duduksampeyan-1` | PEREMPATAN DUDUKSAMPEYAN 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-duduksampeyan-1/index.m3u8` |
| 5 | `gresik-atcs-cctv-perempatan-legundi-1` | CCTV PEREMPATAN LEGUNDI 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-legundi-1/index.m3u8` |
| 6 | `gresik-atcs-perempatan-pasar-gresik-2` | PEREMPATAN PASAR GRESIK 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-pasar-gresik-2/index.m3u8` |
| 7 | `gresik-atcs-perempatan-pasar-gresik-4` | PEREMPATAN PASAR GRESIK 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-pasar-gresik-4/index.m3u8` |
| 8 | `gresik-atcs-kapal-cepat-bawean-1` | KAPAL CEPAT BAWEAN 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/kapal-cepat-bawean-1/index.m3u8` |
| 9 | `gresik-atcs-segoromadu-4` | SEGOROMADU 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/segoromadu-4/index.m3u8` |
| 10 | `gresik-atcs-perempatan-pasar-gresik-1` | PEREMPATAN PASAR GRESIK 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-pasar-gresik-1/index.m3u8` |
| 11 | `gresik-atcs-bandara-bawean-1` | BANDARA BAWEAN 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/bandara-bawean-1/index.m3u8` |
| 12 | `gresik-atcs-cctv-perempatan-wringinanom-1` | CCTV PEREMPATAN WRINGINANOM 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-wringinanom-1/index.m3u8` |
| 13 | `gresik-atcs-pelabuhan-bawean-1` | PELABUHAN BAWEAN 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pelabuhan-bawean-1/index.m3u8` |
| 14 | `gresik-atcs-segoromadu-1` | SEGOROMADU 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/segoromadu-1/index.m3u8` |
| 15 | `gresik-atcs-pasar-bungah-3` | PASAR BUNGAH 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-bungah-3/index.m3u8` |
| 16 | `gresik-atcs-cctv-panoramic-kantor-bupati` | CCTV PANORAMIC KANTOR BUPATI | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-panoramic-kantor-bupati/index.m3u8` |
| 17 | `gresik-atcs-pasar-gresik-3` | PASAR GRESIK 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-gresik-3/index.m3u8` |
| 18 | `gresik-atcs-cctv-perempatan-legundi-4` | CCTV PEREMPATAN LEGUNDI 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-legundi-4/index.m3u8` |
| 19 | `gresik-atcs-pasar-benjeng-4` | PASAR BENJENG 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-benjeng-4/index.m3u8` |
| 20 | `gresik-atcs-pasar-gresik-2` | PASAR GRESIK 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-gresik-2/index.m3u8` |
| 21 | `gresik-atcs-perempatan-ngepung-1` | PEREMPATAN NGEPUNG 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-ngepung-1/index.m3u8` |
| 22 | `gresik-atcs-cctv-pertigaan-bambe-2` | CCTV PERTIGAAN BAMBE 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-pertigaan-bambe-2/index.m3u8` |
| 23 | `gresik-atcs-cctv-perempatan-wringinanom-3` | CCTV PEREMPATAN WRINGINANOM 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-wringinanom-3/index.m3u8` |
| 24 | `gresik-atcs-cctv-perempatan-wringinanom-4` | CCTV PEREMPATAN WRINGINANOM 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-wringinanom-4/index.m3u8` |
| 25 | `gresik-atcs-cctv-pertigaan-bambe-3` | CCTV PERTIGAAN BAMBE 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-pertigaan-bambe-3/index.m3u8` |
| 26 | `gresik-atcs-perempatan-ngepung-3` | PEREMPATAN NGEPUNG 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-ngepung-3/index.m3u8` |
| 27 | `gresik-atcs-perempatan-ngepung-2` | PEREMPATAN NGEPUNG 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-ngepung-2/index.m3u8` |
| 28 | `gresik-atcs-pelabuhan-bawean-3` | PELABUHAN BAWEAN 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pelabuhan-bawean-3/index.m3u8` |
| 29 | `gresik-atcs-bandara-bawean-2` | BANDARA BAWEAN 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/bandara-bawean-2/index.m3u8` |
| 30 | `gresik-atcs-perempatan-pasar-gresik-3` | PEREMPATAN PASAR GRESIK 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-pasar-gresik-3/index.m3u8` |
| 31 | `gresik-atcs-cctv-perempatan-wringinanom-2` | CCTV PEREMPATAN WRINGINANOM 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-wringinanom-2/index.m3u8` |
| 32 | `gresik-atcs-pasar-benjeng-2` | PASAR BENJENG 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-benjeng-2/index.m3u8` |
| 33 | `gresik-atcs-pasar-benjeng-3` | PASAR BENJENG 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-benjeng-3/index.m3u8` |
| 34 | `gresik-atcs-yosowilangun-3` | YOSOWILANGUN 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/yosowilangun-3/index.m3u8` |
| 35 | `gresik-atcs-cctv-perempatan-legundi-3` | CCTV PEREMPATAN LEGUNDI 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-legundi-3/index.m3u8` |
| 36 | `gresik-atcs-cctv-perempatan-legundi-2` | CCTV PEREMPATAN LEGUNDI 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-perempatan-legundi-2/index.m3u8` |
| 37 | `gresik-atcs-jalan-desa-bedanten-1` | JALAN DESA BEDANTEN 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/jalan-desa-bedanten-1/index.m3u8` |
| 38 | `gresik-atcs-exit-tol-belahanrejo-1` | EXIT TOL BELAHANREJO 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/exit-tol-belahanrejo-1/index.m3u8` |
| 39 | `gresik-atcs-cctv-panoramic-masjid-jami` | CCTV PANORAMIC MASJID JAMI | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-panoramic-masjid-jami/index.m3u8` |
| 40 | `gresik-atcs-perempatan-duduksampeyan-3` | PEREMPATAN DUDUKSAMPEYAN 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-duduksampeyan-3/index.m3u8` |
| 41 | `gresik-atcs-kedungpring-3` | KEDUNGPRING 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/kedungpring-3/index.m3u8` |
| 42 | `gresik-atcs-kapal-cepat-bawean-3` | KAPAL CEPAT BAWEAN 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/kapal-cepat-bawean-3/index.m3u8` |
| 43 | `gresik-atcs-pasar-bungah-1` | PASAR BUNGAH 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-bungah-1/index.m3u8` |
| 44 | `gresik-atcs-cctv-panoramik-mbah-condro` | CCTV PANORAMIK MBAH CONDRO | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-panoramik-mbah-condro/index.m3u8` |
| 45 | `gresik-atcs-perempatan-ngepung-4` | PEREMPATAN NGEPUNG 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/perempatan-ngepung-4/index.m3u8` |
| 46 | `gresik-atcs-kapal-cepat-bawean-2` | KAPAL CEPAT BAWEAN 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/kapal-cepat-bawean-2/index.m3u8` |
| 47 | `gresik-atcs-segoromadu-2` | SEGOROMADU 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/segoromadu-2/index.m3u8` |
| 48 | `gresik-atcs-segoromadu-3` | SEGOROMADU 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/segoromadu-3/index.m3u8` |
| 49 | `gresik-atcs-cctv-pano-islamik-center` | CCTV-PANO-ISLAMIK-CENTER | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-pano-islamik-center/index.m3u8` |
| 50 | `gresik-atcs-exit-tol-belahanrejo-3` | EXIT TOL BELAHANREJO 3 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/exit-tol-belahanrejo-3/index.m3u8` |
| 51 | `gresik-atcs-cctv-pertigaan-cangkir-2` | CCTV PERTIGAAN CANGKIR 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-pertigaan-cangkir-2/index.m3u8` |
| 52 | `gresik-atcs-cctv-pertigaan-bambe-1` | CCTV PERTIGAAN BAMBE 1 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/cctv-pertigaan-bambe-1/index.m3u8` |
| 53 | `gresik-atcs-yosowilangun-4` | YOSOWILANGUN 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/yosowilangun-4/index.m3u8` |
| 54 | `gresik-atcs-pasar-gresik-4` | PASAR GRESIK 4 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/pasar-gresik-4/index.m3u8` |
| 55 | `gresik-atcs-exit-tol-belahanrejo-2` | EXIT TOL BELAHANREJO 2 | HLS (on-demand) | `https://cctvkanjeng.gresikkab.go.id/hls/exit-tol-belahanrejo-2/index.m3u8` |

### Jombang (16)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `jombang-atcs-perbatasan-mojoagung-barat` | Perbatasan Mojoagung (Barat) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=96` |
| 2 | `jombang-atcs-perbatasan-mojoagung-timur` | Perbatasan Mojoagung (Timur) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=106` |
| 3 | `jombang-atcs-perbatasan-rejoagung-ngoro-selatan` | Perbatasan Rejoagung Ngoro (Selatan) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=107` |
| 4 | `jombang-atcs-perbatasan-rejoagung-ngoro-utara` | Perbatasan Rejoagung Ngoro (Utara) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=108` |
| 5 | `jombang-atcs-simpang-mojongapit-barat` | Simpang Mojongapit (Barat) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=139` |
| 6 | `jombang-atcs-simpang-mojongapit-timur` | Simpang Mojongapit (Timur) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=140` |
| 7 | `jombang-atcs-simpang-mojongapit-utara` | Simpang Mojongapit (Utara) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=141` |
| 8 | `jombang-atcs-simpang-keplaksari-timur` | Simpang Keplaksari (Timur) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=133` |
| 9 | `jombang-atcs-simpang-keplaksari-barat` | Simpang Keplaksari (Barat) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=134` |
| 10 | `jombang-atcs-simpang-keplaksari-utara` | Simpang Keplaksari (Utara) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=138` |
| 11 | `jombang-atcs-simpang-terminal-selatan` | Simpang Terminal (Selatan) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=137` |
| 12 | `jombang-atcs-simpang-weru-utara` | Simpang Weru (Utara) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=144` |
| 13 | `jombang-atcs-simpang-tugu-utara` | Simpang Tugu (Utara) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=145` |
| 14 | `jombang-atcs-simpang-tugu-selatan` | Simpang Tugu (Selatan) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=147` |
| 15 | `jombang-atcs-simpang-tugu-timur` | Simpang Tugu (Timur) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=148` |
| 16 | `jombang-atcs-simpang-tugu-barat` | Simpang Tugu (Barat) | MJPEG (token halaman) | `https://cctv.jombangkab.go.id/zm/cgi-bin/nph-zms?monitor=146` |

### Kota Serang (20)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `serang-atcs-ciceri-1` | CCTV Ciceri 1 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/ciceri1.m3u8` |
| 2 | `serang-atcs-ciceri-2` | CCTV Ciceri 2 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/ciceri2.m3u8` |
| 3 | `serang-atcs-ciracas-sepang` | CCTV Ciracas Sepang | HLS | `https://stream.serangkota.go.id/LiveApp/streams/sepang.m3u8` |
| 4 | `serang-atcs-gerbang-tol-serang-timur` | CCTV Gerbang Tol Serang Timur | HLS | `https://stream.serangkota.go.id/LiveApp/streams/serangtimur.m3u8` |
| 5 | `serang-atcs-jembatan-bogeg-1` | CCTV Jembatan Bogeg 1 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/Jembatanbogeg1.m3u8` |
| 6 | `serang-atcs-jembatan-bogeg-2` | CCTV Jembatan Bogeg 2 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/Jembatanbogeg2.m3u8` |
| 7 | `serang-atcs-kaligandu` | CCTV Kaligandu | HLS | `https://stream.serangkota.go.id/LiveApp/streams/kaligandu.m3u8` |
| 8 | `serang-atcs-p3-royal-baroe-01` | CCTV P3 Royal Baroe 01 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/p3royalbaroe01.m3u8` |
| 9 | `serang-atcs-p3-royal-baroe-02` | CCTV P3 Royal Baroe 02 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/p3royalbaroe02.m3u8` |
| 10 | `serang-atcs-p3-royal-baroe-03` | CCTV P3 Royal Baroe 03 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/p3royalbaroe03.m3u8` |
| 11 | `serang-atcs-p3-taman-sari` | CCTV P3 Taman Sari | HLS | `https://stream.serangkota.go.id/LiveApp/streams/p3tamansari.m3u8` |
| 12 | `serang-atcs-p4-taman-sari` | CCTV P4 Taman Sari | HLS | `https://stream.serangkota.go.id/LiveApp/streams/p4tamansari.m3u8` |
| 13 | `serang-atcs-pocis-01` | CCTV Pocis 01 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/pocis01.m3u8` |
| 14 | `serang-atcs-pocis-02` | CCTV Pocis 02 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/pocis02.m3u8` |
| 15 | `serang-atcs-royal-baroe-01` | CCTV Royal Baroe 01 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/royal01.m3u8` |
| 16 | `serang-atcs-royal-baroe-04` | CCTV Royal Baroe 04 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/royalbaroe04.m3u8` |
| 17 | `serang-atcs-royal-baroe-05` | CCTV Royal Baroe 05 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/royalbaroe05.m3u8` |
| 18 | `serang-atcs-taman-sari-01` | CCTV Taman Sari 01 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/tamansari01.m3u8` |
| 19 | `serang-atcs-taman-sari-02` | CCTV Taman Sari 02 | HLS | `https://stream.serangkota.go.id/LiveApp/streams/tamansari02.m3u8` |
| 20 | `serang-atcs-terminal-banten-lama` | CCTV Terminal Banten Lama | HLS | `https://stream.serangkota.go.id/LiveApp/streams/terminalbantenlama.m3u8` |

### Banjarbaru (47)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `banjarbaru-atcs-arah-polresta` | ARAH POLRESTA | HLS | `https://stream-backup.banjarbarukota.go.id/arah_polresta/index.m3u8` |
| 2 | `banjarbaru-atcs-arah-museum` | ARAH MUSEUM | HLS | `https://stream-backup.banjarbarukota.go.id/arah_museum/index.m3u8` |
| 3 | `banjarbaru-atcs-arah-gerbang-ulm` | ARAH GERBANG ULM | HLS | `https://stream-backup.banjarbarukota.go.id/arah_gerbang_ulm/index.m3u8` |
| 4 | `banjarbaru-atcs-arah-purnama-ulm` | ARAH PURNAMA ULM | HLS | `https://stream-backup.banjarbarukota.go.id/arah_purnama/index.m3u8` |
| 5 | `banjarbaru-atcs-a1-spbu-simpang-4` | A1 SPBU SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/a1_simpang4_arah_pom/index.m3u8` |
| 6 | `banjarbaru-atcs-a2-ulin-simpang-4` | A2 ULIN SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/a2_simpang4_arah_sungai_ulin/index.m3u8` |
| 7 | `banjarbaru-atcs-a3-ptz-simpang-4` | A3 PTZ SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/a3_ptz_simpang4/index.m3u8` |
| 8 | `banjarbaru-atcs-c1-polisi-simpang-4` | C1 POLISI SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/c1_simpang4_arah_cempaka/index.m3u8` |
| 9 | `banjarbaru-atcs-c2-banjarmasin-simpang-4` | C2 BANJARMASIN SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/c2_simpang4_arah_banjarmasin/index.m3u8` |
| 10 | `banjarbaru-atcs-c3-ptz-simpang-4` | C3 PTZ SIMPANG 4 | HLS | `https://stream-backup.banjarbarukota.go.id/c3_ptz_simpang4_banjarbaru/index.m3u8` |
| 11 | `banjarbaru-atcs-bundaran-amaco` | BUNDARAN AMACO | HLS | `https://stream-backup.banjarbarukota.go.id/bundaran_amaco/index.m3u8` |
| 12 | `banjarbaru-atcs-qmall-arah-simpang-empat` | QMALL ARAH SIMPANG EMPAT | HLS | `https://stream-backup.banjarbarukota.go.id/qmall_arah_simpang_empat/index.m3u8` |
| 13 | `banjarbaru-atcs-qmall-arah-batas-kota` | QMALL ARAH BATAS KOTA | HLS | `https://stream-backup.banjarbarukota.go.id/qmall_arah_batas_kota/index.m3u8` |
| 14 | `banjarbaru-atcs-rebatig-ptz` | REBATIG PTZ | HLS | `https://stream-backup.banjarbarukota.go.id/rebatig/index.m3u8` |
| 15 | `banjarbaru-atcs-bundaran-topi-toga` | BUNDARAN TOPI TOGA | HLS | `https://stream-backup.banjarbarukota.go.id/bundaran_stm/index.m3u8` |
| 16 | `banjarbaru-atcs-jpo-dalam-utara` | JPO DALAM UTARA | HLS | `https://stream-backup.banjarbarukota.go.id/jpo_dalam_utara/index.m3u8` |
| 17 | `banjarbaru-atcs-jpo-dalam-selatan` | JPO DALAM SELATAN | HLS | `https://stream-backup.banjarbarukota.go.id/jpo_dalam_selatan/index.m3u8` |
| 18 | `banjarbaru-atcs-jpo-tangga-utara` | JPO TANGGA UTARA | HLS | `https://stream-backup.banjarbarukota.go.id/jpo_tangga_utara/index.m3u8` |
| 19 | `banjarbaru-atcs-jembatan-kembar-arah-banjarmasin` | JEMBATAN KEMBAR ARAH BANJARMASIN | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_kembar_arah_banjarmasin/index.m3u8` |
| 20 | `banjarbaru-atcs-jembatan-kembar-arah-banjarbaru` | JEMBATAN KEMBAR ARAH BANJARBARU | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_kembar_arah_banjarbaru/index.m3u8` |
| 21 | `banjarbaru-atcs-jembatan-tonhar-landasan-ulin` | JEMBATAN TONHAR LANDASAN ULIN | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_tonhar/index.m3u8` |
| 22 | `banjarbaru-atcs-jembatan-cempaka-1` | JEMBATAN CEMPAKA 1 | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_cempaka_1/index.m3u8` |
| 23 | `banjarbaru-atcs-jembatan-al-mansyur` | JEMBATAN AL-MANSYUR | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_al_mansyur/index.m3u8` |
| 24 | `banjarbaru-atcs-arah-dispenduk-pangeran-antasari` | ARAH DISPENDUK PANGERAN ANTASARI | HLS | `https://stream-backup.banjarbarukota.go.id/depan_disdukcapil/index.m3u8` |
| 25 | `banjarbaru-atcs-jembatan-kemuning` | JEMBATAN KEMUNING | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_kemuning/index.m3u8` |
| 26 | `banjarbaru-atcs-taman-minggu-raya` | TAMAN MINGGU RAYA | HLS | `https://stream-backup.banjarbarukota.go.id/taman_minggu_raya/index.m3u8` |
| 27 | `banjarbaru-atcs-bundaran-palam-trikora-taman-pama` | BUNDARAN PALAM TRIKORA TAMAN PAMA | HLS | `https://stream-backup.banjarbarukota.go.id/taman_pama_arah_bundaran/index.m3u8` |
| 28 | `banjarbaru-atcs-depan-stimik-arah-banjarmasin` | DEPAN STIMIK ARAH BANJARMASIN | HLS | `https://stream-backup.banjarbarukota.go.id/depan_stimik_arah_banjarmasin/index.m3u8` |
| 29 | `banjarbaru-atcs-lapangan-murdjani-ptz` | LAPANGAN MURDJANI PTZ | HLS | `https://stream-backup.banjarbarukota.go.id/ptz_murjani/index.m3u8` |
| 30 | `banjarbaru-atcs-polsek-bjb-arah-simpang-empat` | POLSEK BJB ARAH SIMPANG EMPAT | HLS | `https://stream-backup.banjarbarukota.go.id/depan_polsek_arah_simpang4/index.m3u8` |
| 31 | `banjarbaru-atcs-polsek-bjb-arah-banjarmasin` | POLSEK BJB ARAH BANJARMASIN | HLS | `https://stream-backup.banjarbarukota.go.id/depan_polsek_arah_banjarmasin/index.m3u8` |
| 32 | `banjarbaru-atcs-bundaran-trikora-masjid-al-munawarah` | BUNDARAN TRIKORA MASJID AL-MUNAWARAH | HLS | `https://stream-backup.banjarbarukota.go.id/bundaran_mesjid_al_munawwarah/index.m3u8` |
| 33 | `banjarbaru-atcs-pertigaan-ambulung` | PERTIGAAN AMBULUNG | HLS | `https://stream-backup.banjarbarukota.go.id/pertigaan_ambulung/index.m3u8` |
| 34 | `banjarbaru-atcs-taman-mawar` | TAMAN MAWAR | HLS | `https://stream-backup.banjarbarukota.go.id/taman_mawar_arah_taman_tengah/index.m3u8` |
| 35 | `banjarbaru-atcs-ptz-taman-mawar-arah-sd` | PTZ TAMAN MAWAR ARAH SD | HLS | `https://stream-backup.banjarbarukota.go.id/taman_mawar_ptz_arah_sd/index.m3u8` |
| 36 | `banjarbaru-atcs-perempatan-taruna-praja-barjad` | PEREMPATAN TARUNA PRAJA (BARJAD) | HLS | `https://stream-backup.banjarbarukota.go.id/simpang_4_barjad/index.m3u8` |
| 37 | `banjarbaru-atcs-stimik-arah-banjarbaru` | STIMIK ARAH BANJARBARU | HLS | `https://stream-backup.banjarbarukota.go.id/depan_stimik_arah_banjarbaru/index.m3u8` |
| 38 | `banjarbaru-atcs-pertigaan-trikora-ro-ulin-arah-masjid-agung` | PERTIGAAN TRIKORA RO ULIN ARAH MASJID AGUNG | HLS | `https://stream-backup.banjarbarukota.go.id/pertigaan_trikora_arah_mesjid_agung/index.m3u8` |
| 39 | `banjarbaru-atcs-cctv-pertigaan-trikora-arah-ro-ulin` | CCTV PERTIGAAN TRIKORA ARAH RO ULIN | HLS | `https://stream-backup.banjarbarukota.go.id/pertigaan_trikora_arah_ro_ulin/index.m3u8` |
| 40 | `banjarbaru-atcs-balai-kota-arah-murdjani` | BALAI KOTA ARAH MURDJANI | HLS | `https://stream-backup.banjarbarukota.go.id/balai_kota_murjani/index.m3u8` |
| 41 | `banjarbaru-atcs-cctv-pertigaan-kebun-karet` | CCTV PERTIGAAN KEBUN KARET | HLS | `https://stream-backup.banjarbarukota.go.id/pertigaan_kebun_karet/index.m3u8` |
| 42 | `banjarbaru-atcs-halte-minggu-raya` | Halte_minggu_raya | HLS | `https://stream-backup.banjarbarukota.go.id/Halte_minggu_raya/index.m3u8` |
| 43 | `banjarbaru-atcs-halte-unlam-1` | Halte_unlam_1 | HLS | `https://stream-backup.banjarbarukota.go.id/halte_unlam_1/index.m3u8` |
| 44 | `banjarbaru-atcs-trikora-cempaka` | TRIKORA CEMPAKA | HLS | `https://stream-backup.banjarbarukota.go.id/s3_trikora_cempaka/index.m3u8` |
| 45 | `banjarbaru-atcs-trikora-cempaka-arah-banjarbaru` | TRIKORA CEMPAKA ARAH BANJARBARU | HLS | `https://stream-backup.banjarbarukota.go.id/s3_trikora_arah_bjb/index.m3u8` |
| 46 | `banjarbaru-atcs-jembatan-cempaka-2` | JEMBATAN CEMPAKA 2 | HLS | `https://stream-backup.banjarbarukota.go.id/jembatan_cempaka_2/index.m3u8` |
| 47 | `banjarbaru-atcs-the-breeze-water-park` | THE BREEZE WATER PARK | HLS | `https://stream-backup.banjarbarukota.go.id/breeze/index.m3u8` |

### Jambi (19)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `jambi-atcs-tugu-keris-siginjai-2` | Tugu Keris SIGINJAI 2 | HLS | `https://cctv.jambikota.go.id/stream/2/stream.m3u8` |
| 2 | `jambi-atcs-tugu-keris-3` | Tugu Keris 3 | HLS | `https://cctv.jambikota.go.id/stream/23/stream.m3u8` |
| 3 | `jambi-atcs-tugu-keris-ptz` | Tugu Keris PTZ | HLS | `https://cctv.jambikota.go.id/stream/25/stream.m3u8` |
| 4 | `jambi-atcs-simpang-bi-1` | Simpang BI 1 | HLS | `https://cctv.jambikota.go.id/stream/26/stream.m3u8` |
| 5 | `jambi-atcs-simpang-bi-2` | Simpang BI 2 | HLS | `https://cctv.jambikota.go.id/stream/3/stream.m3u8` |
| 6 | `jambi-atcs-simpang-bi-3` | Simpang BI 3 | HLS | `https://cctv.jambikota.go.id/stream/27/stream.m3u8` |
| 7 | `jambi-atcs-simpang-bi-4` | Simpang BI 4 | HLS | `https://cctv.jambikota.go.id/stream/4/stream.m3u8` |
| 8 | `jambi-atcs-persijam-1` | Persijam 1 | HLS | `https://cctv.jambikota.go.id/stream/28/stream.m3u8` |
| 9 | `jambi-atcs-persijam-2` | Persijam 2 | HLS | `https://cctv.jambikota.go.id/stream/5/stream.m3u8` |
| 10 | `jambi-atcs-persijam-3` | Persijam 3 | HLS | `https://cctv.jambikota.go.id/stream/6/stream.m3u8` |
| 11 | `jambi-atcs-persijam-4` | Persijam 4 | HLS | `https://cctv.jambikota.go.id/stream/29/stream.m3u8` |
| 12 | `jambi-atcs-persijam-ptz` | Persijam PTZ | HLS | `https://cctv.jambikota.go.id/stream/30/stream.m3u8` |
| 13 | `jambi-atcs-mayang-1` | Mayang 1 | HLS | `https://cctv.jambikota.go.id/stream/7/stream.m3u8` |
| 14 | `jambi-atcs-mayang-2` | Mayang 2 | HLS | `https://cctv.jambikota.go.id/stream/8/stream.m3u8` |
| 15 | `jambi-atcs-puncak-2` | Puncak 2 | HLS | `https://cctv.jambikota.go.id/stream/12/stream.m3u8` |
| 16 | `jambi-atcs-puncak-ptz` | Puncak PTZ | HLS | `https://cctv.jambikota.go.id/stream/11/stream.m3u8` |
| 17 | `jambi-atcs-kota-baru-1` | Kota Baru 1 | HLS | `https://cctv.jambikota.go.id/stream/17/stream.m3u8` |
| 18 | `jambi-atcs-nurdin-h-1` | Nurdin H 1 | HLS | `https://cctv.jambikota.go.id/stream/19/stream.m3u8` |
| 19 | `jambi-atcs-nurdin-h-2` | Nurdin H 2 | HLS | `https://cctv.jambikota.go.id/stream/20/stream.m3u8` |

### Karo (12)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `karo-atcs-simpang-tiga-mesjid-agung` | Simpang Tiga Mesjid Agung | HLS | `http://72.62.122.47:8888/cam11/index.m3u8` |
| 2 | `karo-atcs-terminal-kabanjahe` | Terminal Kabanjahe | HLS | `http://72.62.122.47:8888/cam12/index.m3u8` |
| 3 | `karo-atcs-simpang-tanjung-bunga` | Simpang Tanjung Bunga | HLS | `http://72.62.122.47:8888/cam13/index.m3u8` |
| 4 | `karo-atcs-simpang-dinas-perpustakaan` | Simpang Dinas Perpustakaan | HLS | `http://72.62.122.47:8888/cam15/index.m3u8` |
| 5 | `karo-atcs-simpang-zentrum-tugu-bulang` | Simpang Zentrum Tugu Bulang | HLS | `http://72.62.122.47:8888/cam19/index.m3u8` |
| 6 | `karo-atcs-tugu-tiga-serangkai-2` | Tugu Tiga Serangkai 2 | HLS | `http://72.62.122.47:8888/cam33/index.m3u8` |
| 7 | `karo-atcs-simpang-tugu-bambu-runcing` | Simpang Tugu Bambu Runcing | HLS | `http://72.62.122.47:8888/cam30/index.m3u8` |
| 8 | `karo-atcs-kompleks-dprd-2` | Kompleks DPRD 2 | HLS | `http://72.62.122.47:8888/cam25/index.m3u8` |
| 9 | `karo-atcs-kompleks-dprd-1` | Kompleks DPRD 1 | HLS | `http://72.62.122.47:8888/cam26/index.m3u8` |
| 10 | `karo-atcs-simpang-laudah-pala-bangun` | Simpang Laudah Pala Bangun | HLS | `http://72.62.122.47:8888/cam24/index.m3u8` |
| 11 | `karo-atcs-simpang-katepul` | Simpang Katepul | HLS | `http://72.62.122.47:8888/cam14/index.m3u8` |
| 12 | `karo-atcs-simpang-laudah-spbu` | Simpang Laudah SPBU | HLS | `http://72.62.122.47:8888/cam22/index.m3u8` |

### Nganjuk (289)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `nganjuk-atcs-desa-munung-simpang-3-selatan` | Desa MUNUNG - Simpang 3 Selatan | HLS | `https://wxyz.nganjukkab.go.id/Munung/streams/DmfSjnoeu1vH5zp71786673402183.m3u8` |
| 2 | `nganjuk-atcs-pangsud-puri-barat` | Pangsud Puri Barat | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/jC7AdbW4yga3szZ01786673394060.m3u8` |
| 3 | `nganjuk-atcs-pangsud-puri-timur` | Pangsud Puri Timur | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/wog313WxOZc7bBON1786673395680.m3u8` |
| 4 | `nganjuk-atcs-tl-ploso-selatan` | TL Ploso Selatan | HLS | `https://wxyz.nganjukkab.go.id/Ploso/streams/1DIt0l4qHIzOcLGK1786673418780.m3u8` |
| 5 | `nganjuk-atcs-tl-ploso-barat` | TL Ploso Barat | HLS | `https://wxyz.nganjukkab.go.id/Ploso/streams/3BGLRE219HeAxT9S1786673419427.m3u8` |
| 6 | `nganjuk-atcs-tl-ploso-timur` | TL Ploso Timur | HLS | `https://wxyz.nganjukkab.go.id/Ploso/streams/nlvy6qE4DAmNePHn1786673418457.m3u8` |
| 7 | `nganjuk-atcs-tl-ploso-utara` | TL Ploso Utara | HLS | `https://wxyz.nganjukkab.go.id/Ploso/streams/99tmtOxu7d4UZBtM1786673419104.m3u8` |
| 8 | `nganjuk-atcs-pos-taman-nyawiji` | POS TAMAN NYAWIJI | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/i7c6de7RWZTpZEnn1786673441203.m3u8` |
| 9 | `nganjuk-atcs-taman-nyawiji-tl-selatan` | Taman Nyawiji TL Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/dStU8cJLT5DKLMNh1786673442823.m3u8` |
| 10 | `nganjuk-atcs-taman-nyawiji-dalam-selatan` | Taman Nyawiji Dalam Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/4ewctTmV0Y4Npxtp1786673443147.m3u8` |
| 11 | `nganjuk-atcs-taman-nyawiji-dalam-utara` | Taman Nyawiji Dalam Utara | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/1drDKstevcxIODJ91786673441849.m3u8` |
| 12 | `nganjuk-atcs-taman-nyawiji-tl-utara` | Taman Nyawiji TL Utara | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/2rGpHIaFgE0PudZb1786673442501.m3u8` |
| 13 | `nganjuk-atcs-taman-nyawiji-tl-timur` | Taman Nyawiji TL Timur | HLS | `https://wxyz.nganjukkab.go.id/TamanNyawiji/streams/ldOAqXqRJ0PcZ9Se1786673442174.m3u8` |
| 14 | `nganjuk-atcs-winong-utara` | Winong Utara | HLS | `https://wxyz.nganjukkab.go.id/Winong/streams/hAn0voFUr2f57UYt1786673462986.m3u8` |
| 15 | `nganjuk-atcs-winong-selatan` | Winong Selatan | HLS | `https://wxyz.nganjukkab.go.id/Winong/streams/biRXR3G2igO7rwqH1786673462661.m3u8` |
| 16 | `nganjuk-atcs-pasar-baru-barat` | Pasar Baru Barat | HLS | `https://wxyz.nganjukkab.go.id/PasarBaru/streams/n69Fki8NkMXG9AyT1786673410972.m3u8` |
| 17 | `nganjuk-atcs-pasar-baru-utara` | Pasar Baru Utara | HLS | `https://wxyz.nganjukkab.go.id/PasarBaru/streams/5duiei7e6GBQCFmI1786673411299.m3u8` |
| 18 | `nganjuk-atcs-pasar-baru-selatan` | Pasar Baru Selatan | HLS | `https://wxyz.nganjukkab.go.id/PasarBaru/streams/rLBDmbs8UOepjtcS1786673411627.m3u8` |
| 19 | `nganjuk-atcs-alun-alun-lapangan` | alun-alun lapangan | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/hLIonEqOn75kRBET1786673368096.m3u8` |
| 20 | `nganjuk-atcs-alun-alun-tugu-20` | alun-alun tugu 20 | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/ZCdMMKieSLQXj0lA1786673368746.m3u8` |
| 21 | `nganjuk-atcs-smpn-1-timur` | SMPN 1 timur | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/7L6X9VfuXjvPBAFa1786673368421.m3u8` |
| 22 | `nganjuk-atcs-alun-alun-barat` | alun-alun barat | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/KqmwXPjyShF8OJOw1786673367772.m3u8` |
| 23 | `nganjuk-atcs-alun-alun-selatan-1` | Alun-Alun Selatan 1 | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/C44dtpVlZaTibOu21786673370043.m3u8` |
| 24 | `nganjuk-atcs-alun-alun-timur` | alun-alun timur | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/dCyHlqLDwMMpz0YG1786673370691.m3u8` |
| 25 | `nganjuk-atcs-alun-alun-utara` | Alun-alun Utara | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/L5irpOvyaEbyD5il1786673371014.m3u8` |
| 26 | `nganjuk-atcs-smpn-1-barat` | SMPN 1 Barat | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/fJy7Dx4g9fuN14Io1786673369069.m3u8` |
| 27 | `nganjuk-atcs-alun-alun-utara-1` | Alun-Alun Utara 1 | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/pOIdFc0DXYM8PKEo1786673369717.m3u8` |
| 28 | `nganjuk-atcs-alun-alun-selatan-2` | Alun-Alun Selatan 2 | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/4Uqx8yphPdB8BzGs1786673369393.m3u8` |
| 29 | `nganjuk-atcs-alun-alun-utara-2` | Alun-Alun Utara 2 | HLS | `https://wxyz.nganjukkab.go.id/AlunAlun/streams/xpsE3qjvU2EhGLzL1786673370367.m3u8` |
| 30 | `nganjuk-atcs-a-yani-jayastamba` | a.yani jayastamba | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/D3BINXG3AaQR2a4w1786673365180.m3u8` |
| 31 | `nganjuk-atcs-a-yani-timur` | A.Yani Timur | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/XxVzS2yAV1K0xDEz1786673366475.m3u8` |
| 32 | `nganjuk-atcs-a-yani-barat` | A.Yani barat | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/9fENZtsNgwVJL7Qg1786673365828.m3u8` |
| 33 | `nganjuk-atcs-a-yani-prima-swalayan-pintu-keluar` | A. Yani - Prima Swalayan Pintu Keluar | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/75iQtUfqWIy50lEk1786673366152.m3u8` |
| 34 | `nganjuk-atcs-a-yani-prima-timur-depan-prima-trotoar` | A. Yani - Prima Timur Depan Prima Trotoar | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/opOIJxon6ub2zVNX1786673364856.m3u8` |
| 35 | `nganjuk-atcs-a-yani-simpang-4-tugu-jaya-stamba` | A. Yani Simpang 4 Tugu Jaya Stamba | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/wl4Nq2N5Y83JqGAD1786673364532.m3u8` |
| 36 | `nganjuk-atcs-a-yani-simpang-4-utara-tugu-jaya-stamba` | A. Yani Simpang 4 Utara Tugu Jaya Stamba | HLS | `https://wxyz.nganjukkab.go.id/A.Yani/streams/TyLLbI6kCyXiI5hD1786673365504.m3u8` |
| 37 | `nganjuk-atcs-slumbung-utara` | slumbung utara | HLS | `https://wxyz.nganjukkab.go.id/Slumbung/streams/n4SmNEbmTmeeZawK1786673436651.m3u8` |
| 38 | `nganjuk-atcs-slumbung-selatan` | slumbung selatan | HLS | `https://wxyz.nganjukkab.go.id/Slumbung/streams/nVeFEKqiSAiORh4n1786673436975.m3u8` |
| 39 | `nganjuk-atcs-dungdet-barat` | dungdet barat | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/miDArW2h0NiCrkfb1786673374586.m3u8` |
| 40 | `nganjuk-atcs-dungdet-timur` | dungdet timur | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/lLmm2sJZPdIEnj8y1786673376534.m3u8` |
| 41 | `nganjuk-atcs-ganung-kidul-selatan` | ganung kidul selatan | HLS | `https://wxyz.nganjukkab.go.id/Ganung/streams/uLEu9Om2eCLDCibj1786673379136.m3u8` |
| 42 | `nganjuk-atcs-ganung-kidul-barat` | ganung kidul barat | HLS | `https://wxyz.nganjukkab.go.id/Ganung/streams/jO9U7V50xvj63mnD1786673378484.m3u8` |
| 43 | `nganjuk-atcs-ganung-kidul-timur` | ganung kidul timur | HLS | `https://wxyz.nganjukkab.go.id/Ganung/streams/21Ai3Zn3cnvjvbKr1786673378158.m3u8` |
| 44 | `nganjuk-atcs-ganung-kidul-utara` | ganung kidul utara | HLS | `https://wxyz.nganjukkab.go.id/Ganung/streams/MXlNel4io5uLO4Cm1786673378811.m3u8` |
| 45 | `nganjuk-atcs-mastrip-timur` | mastrip timur | HLS | `https://wxyz.nganjukkab.go.id/Mastrip/streams/neIKAnJJxpiIfk051786673396330.m3u8` |
| 46 | `nganjuk-atcs-mastrip-selatan` | mastrip selatan | HLS | `https://wxyz.nganjukkab.go.id/Mastrip/streams/QHCNd1Fe92geFZkf1786673396003.m3u8` |
| 47 | `nganjuk-atcs-polsek-warujayeng-utara` | Polsek Warujayeng Utara | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/WFLLch8Rt3V77rCN1786673448997.m3u8` |
| 48 | `nganjuk-atcs-polsek-warujayeng-selatan` | Polsek Warujayeng Selatan | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/HIgHYJ5oL1AzYN5q1786673451591.m3u8` |
| 49 | `nganjuk-atcs-pertigaan-mustika-selatan` | Pertigaan Mustika Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mustika/streams/haROYmLe0Zi3eVrS1786673403815.m3u8` |
| 50 | `nganjuk-atcs-pertigaan-mustika-utara` | Pertigaan Mustika Utara | HLS | `https://wxyz.nganjukkab.go.id/Mustika/streams/qB54yzGXArlNFF761786673403487.m3u8` |
| 51 | `nganjuk-atcs-pertigaan-mustika-timur` | Pertigaan Mustika Timur | HLS | `https://wxyz.nganjukkab.go.id/Mustika/streams/wAExBiJ1nvE7HiOO1786673403164.m3u8` |
| 52 | `nganjuk-atcs-dam-tanjung-utara` | DAM tanjung utara | HLS | `https://wxyz.nganjukkab.go.id/DamTanjung/streams/BYzZegdH7jjpm7wq1786673374260.m3u8` |
| 53 | `nganjuk-atcs-dam-tanjung-pintu-air` | DAM Tanjung Pintu Air | HLS | `https://wxyz.nganjukkab.go.id/DamTanjung/streams/nV8fVJ6pRvTx1Z6c1786673373935.m3u8` |
| 54 | `nganjuk-atcs-pertigaan-rsi-selatan` | Pertigaan RSI selatan | HLS | `https://wxyz.nganjukkab.go.id/PertigaanRSI/streams/Zov8wDpIvZD8FTaA1786673415206.m3u8` |
| 55 | `nganjuk-atcs-pertigaan-rsi-barat` | Pertigaan RSI barat | HLS | `https://wxyz.nganjukkab.go.id/PertigaanRSI/streams/ghCXIcWG9duNbKqp1786673415530.m3u8` |
| 56 | `nganjuk-atcs-pertigaan-rsi-utara` | Pertigaan RSI Utara | HLS | `https://wxyz.nganjukkab.go.id/PertigaanRSI/streams/4ENziIdAHjPBPKxu1786673415854.m3u8` |
| 57 | `nganjuk-atcs-adipura-gatsu-utara` | adipura gatsu utara | HLS | `https://wxyz.nganjukkab.go.id/AdipuraGatsu/streams/TgufehcvTn9LFqcu1786673367123.m3u8` |
| 58 | `nganjuk-atcs-adipura-gatsu-selatan` | adipura gatsu selatan | HLS | `https://wxyz.nganjukkab.go.id/AdipuraGatsu/streams/tGLsaNjXndGTYa9k1786673366799.m3u8` |
| 59 | `nganjuk-atcs-adipura-gatsu-barat` | adipura gatsu barat | HLS | `https://wxyz.nganjukkab.go.id/AdipuraGatsu/streams/NJmZXJMI19rvQNLK1786673367448.m3u8` |
| 60 | `nganjuk-atcs-kuncir-utara` | kuncir utara | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/AOTM5pM4YrQftHNn1786673387895.m3u8` |
| 61 | `nganjuk-atcs-kuncir-timur` | kuncir timur | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/uTUVlEKtCJn11dMr1786673387569.m3u8` |
| 62 | `nganjuk-atcs-kuncir-barat` | kuncir barat | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/DfoVpx90VgKZQQY71786673386922.m3u8` |
| 63 | `nganjuk-atcs-pasar-sukomoro-barat` | Pasar Sukomoro Barat | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/9RvPJgf9yvxefgFo1786673413255.m3u8` |
| 64 | `nganjuk-atcs-pasar-sukomoro-selatan` | Pasar Sukomoro Selatan | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/NMDpkXP7dV2i6jkc1786673413580.m3u8` |
| 65 | `nganjuk-atcs-pasar-sukomoro-timur` | Pasar Sukomoro Timur | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/1YyzDxeUB42GoMBF1786673414230.m3u8` |
| 66 | `nganjuk-atcs-ngrengket-barat` | Ngrengket Barat | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/KPTczxkgPdNaWWkD1786673414882.m3u8` |
| 67 | `nganjuk-atcs-ngrengket-selatan` | Ngrengket Selatan | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/qIsWfpqzuQq0h0Ki1786673412930.m3u8` |
| 68 | `nganjuk-atcs-ngrengket-timur` | Ngrengket Timur | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/oXZqp47B9UxaKmd41786673413904.m3u8` |
| 69 | `nganjuk-atcs-ngrengket-utara` | Ngrengket Utara | HLS | `https://wxyz.nganjukkab.go.id/PasarSukomoro/streams/xd7FDNkKJjaqujjB1786673414558.m3u8` |
| 70 | `nganjuk-atcs-kertosono-pos-gatsu-selatan` | Kertosono Pos GatSu Selatan | HLS | `https://wxyz.nganjukkab.go.id/SimpangKertosono/streams/U84gJVMBvrDVpCy81786673435677.m3u8` |
| 71 | `nganjuk-atcs-kertosono-pos-gatsu-utara` | Kertosono Pos GatSu Utara | HLS | `https://wxyz.nganjukkab.go.id/SimpangKertosono/streams/ZUvCj8YKfUwwSj4S1786673434706.m3u8` |
| 72 | `nganjuk-atcs-kertosono-pos-gatsu-barat` | Kertosono Pos GatSu Barat | HLS | `https://wxyz.nganjukkab.go.id/SimpangKertosono/streams/EZuktbGFqR8TcVUP1786673435354.m3u8` |
| 73 | `nganjuk-atcs-desa-nglawak-bogo` | Desa Nglawak - Bogo | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/XO7qcyM1pOKWPtc01786673406737.m3u8` |
| 74 | `nganjuk-atcs-pertigaan-selatan-desa-kuncir` | pertigaan selatan desa kuncir | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/C2eFOsfVQbdc6UXb1786673386600.m3u8` |
| 75 | `nganjuk-atcs-depan-kantor-balai-desa-kuncir` | depan kantor balai desa kuncir | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/yaiJi5YBc5c2rBwM1786673387245.m3u8` |
| 76 | `nganjuk-atcs-balai-desa-kuncir` | balai desa kuncir | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/uvOF9U3l4fJvQvSN1786673388544.m3u8` |
| 77 | `nganjuk-atcs-pertigaan-timur-desa-kuncir` | Pertigaan Timur Desa Kuncir | HLS | `https://wxyz.nganjukkab.go.id/Kuncir/streams/PTjGIlaPCZV1v8Pr1786673388219.m3u8` |
| 78 | `nganjuk-atcs-simpang-4-utara-lengkong` | Simpang 4 utara lengkong | HLS | `https://wxyz.nganjukkab.go.id/Lengkong/streams/nSWmLlIGPMYJ7XYE1786673389517.m3u8` |
| 79 | `nganjuk-atcs-simpang-3-pkm-timur-lengkong` | Simpang 3 PKM Timur lengkong | HLS | `https://wxyz.nganjukkab.go.id/Lengkong/streams/aett9QvF3DLdfxGs1786673389193.m3u8` |
| 80 | `nganjuk-atcs-spbu-lengkong-barat` | SPBU Lengkong Barat | HLS | `https://wxyz.nganjukkab.go.id/Lengkong/streams/xlW5NsFLts0GE1Dh1786673389842.m3u8` |
| 81 | `nganjuk-atcs-spbu-lengkong-utara` | SPBU Lengkong Utara | HLS | `https://wxyz.nganjukkab.go.id/Lengkong/streams/4jSKZGirEcZuvz6f1786673388868.m3u8` |
| 82 | `nganjuk-atcs-depan-kantor-desa-nglundo` | Depan Kantor Desa Nglundo | HLS | `https://wxyz.nganjukkab.go.id/Nglundo/streams/KAh5bRZN398KFUeD1786673408038.m3u8` |
| 83 | `nganjuk-atcs-pendopo-kantor-desa-nglundo` | Pendopo Kantor Desa Nglundo | HLS | `https://wxyz.nganjukkab.go.id/Nglundo/streams/5fZvQ23Db1qvUB5H1786673408690.m3u8` |
| 84 | `nganjuk-atcs-gapura-nglundo-utara` | Gapura Nglundo Utara | HLS | `https://wxyz.nganjukkab.go.id/Nglundo/streams/iPLhdTrO4XUb9I3R1786673408365.m3u8` |
| 85 | `nganjuk-atcs-gapura-nglundo-selatan` | Gapura Nglundo Selatan | HLS | `https://wxyz.nganjukkab.go.id/Nglundo/streams/YMd1AMB8BuqQj6TG1786673407715.m3u8` |
| 86 | `nganjuk-atcs-sekarputih-gapura-2` | Sekarputih Gapura 2 | HLS | `https://wxyz.nganjukkab.go.id/SekarPutih/streams/AL6mUE2MU4J38k0q1786673423653.m3u8` |
| 87 | `nganjuk-atcs-sekarputih-gapura-1` | Sekarputih Gapura 1 | HLS | `https://wxyz.nganjukkab.go.id/SekarPutih/streams/Xdo4zpKuK0DfyWDU1786673423006.m3u8` |
| 88 | `nganjuk-atcs-sekarputih-balai-desa` | Sekarputih Balai Desa | HLS | `https://wxyz.nganjukkab.go.id/SekarPutih/streams/JltRbjClzsl2gBqg1786673423328.m3u8` |
| 89 | `nganjuk-atcs-sekarputih-spbu` | Sekarputih SPBU | HLS | `https://wxyz.nganjukkab.go.id/SekarPutih/streams/q3bDNxeWitsX2oE21786673423977.m3u8` |
| 90 | `nganjuk-atcs-tempelwetan-gapura` | TempelWetan Gapura | HLS | `https://wxyz.nganjukkab.go.id/TempelWetan/streams/SN5ohHT4N9EcsTUv1786673448028.m3u8` |
| 91 | `nganjuk-atcs-tempelwetan-jalan-timur` | TempelWetan Jalan Timur | HLS | `https://wxyz.nganjukkab.go.id/TempelWetan/streams/JZt7FQ1iemf4FE5F1786673448675.m3u8` |
| 92 | `nganjuk-atcs-tempelwetan-perempatan` | TempelWetan Perempatan | HLS | `https://wxyz.nganjukkab.go.id/TempelWetan/streams/USoXssZoZDMgfEuL1786673447701.m3u8` |
| 93 | `nganjuk-atcs-tempelwetan-polindes` | TempelWetan Polindes | HLS | `https://wxyz.nganjukkab.go.id/TempelWetan/streams/Qz1Nym6K1z6F2lbI1786673448352.m3u8` |
| 94 | `nganjuk-atcs-sendang-bumen-spbu` | Sendang Bumen SPBU | HLS | `https://wxyz.nganjukkab.go.id/SendangBumen/streams/VHlRFaciUj1WM8yU1786673424954.m3u8` |
| 95 | `nganjuk-atcs-sendang-bumen-gapura-pogalan` | Sendang Bumen-Gapura Pogalan | HLS | `https://wxyz.nganjukkab.go.id/SendangBumen/streams/RJOgTwijShsxEkwE1786673424627.m3u8` |
| 96 | `nganjuk-atcs-sendang-bumen-sman-1-berbek` | Sendang Bumen-SMAN 1 Berbek | HLS | `https://wxyz.nganjukkab.go.id/SendangBumen/streams/0UgX06vKuVzmvvUR1786673424301.m3u8` |
| 97 | `nganjuk-atcs-kemaduh-baron-simpang-4-timur` | Kemaduh Baron Simpang 4 Timur | HLS | `https://wxyz.nganjukkab.go.id/Kemaduh/streams/Bd67G7JlFGCVZM5m1786673385951.m3u8` |
| 98 | `nganjuk-atcs-desa-kemaduh-baron-simpang-4-barat` | DESA KEMADUH - BARON Simpang 4 Barat | HLS | `https://wxyz.nganjukkab.go.id/Kemaduh/streams/ag6Funygw71NQ1vU1786673386275.m3u8` |
| 99 | `nganjuk-atcs-desa-kemaduh-baron-jembatan-barat` | Desa Kemaduh Baron Jembatan Barat | HLS | `https://wxyz.nganjukkab.go.id/Kemaduh/streams/VnLXvpm6lFHjzpjU1786673385628.m3u8` |
| 100 | `nganjuk-atcs-desa-kemaduh-baron-jembatan-timur` | DESA KEMADUH - BARON Jembatan Timur | HLS | `https://wxyz.nganjukkab.go.id/Kemaduh/streams/Fc6MmqTTuUd5jww01786673385303.m3u8` |
| 101 | `nganjuk-atcs-bangsri-kertosono-simpang-4-tk-selatan` | Bangsri - Kertosono Simpang 4 TK Selatan | HLS | `https://wxyz.nganjukkab.go.id/BangsriKertosono/streams/jMpkApKQksM2V1sA1786673372314.m3u8` |
| 102 | `nganjuk-atcs-bangsri-kertosono-simpang-4-tk-utara` | Bangsri - Kertosono Simpang 4 TK Utara | HLS | `https://wxyz.nganjukkab.go.id/BangsriKertosono/streams/uk31rAuaXjoLUKXh1786673371984.m3u8` |
| 103 | `nganjuk-atcs-bangsri-kertosono-simpang-4-panti-barat` | Bangsri-Kertosono Simpang 4 Panti Barat | HLS | `https://wxyz.nganjukkab.go.id/BangsriKertosono/streams/OjopFErar9wQ8qfd1786673371660.m3u8` |
| 104 | `nganjuk-atcs-bangsri-kertosono-simpang-4-panti-timur` | Bangsri - Kertosono Simpang 4 Panti Timur | HLS | `https://wxyz.nganjukkab.go.id/BangsriKertosono/streams/uEghtVgyx5LTtQFG1786673371337.m3u8` |
| 105 | `nganjuk-atcs-baldes-timur-desa-kalianyar-ngronggot` | Baldes Timur- Desa Kalianyar Ngronggot | HLS | `https://wxyz.nganjukkab.go.id/KalianyarNgronggot/streams/xOcd3hX2Zmr7hx7b1786673384004.m3u8` |
| 106 | `nganjuk-atcs-baldes-barat-desa-kalianyar-ngronggot` | Baldes Barat- Desa Kalianyar Ngronggot | HLS | `https://wxyz.nganjukkab.go.id/KalianyarNgronggot/streams/lfy6N5iMPHFE7X3x1786673384977.m3u8` |
| 107 | `nganjuk-atcs-simpang-3-selatan-desa-kalianyar-ngronggot` | Simpang 3 Selatan-Desa Kalianyar Ngronggot | HLS | `https://wxyz.nganjukkab.go.id/KalianyarNgronggot/streams/LQzSbMw9QtjVDWh21786673384328.m3u8` |
| 108 | `nganjuk-atcs-masjid-barat-desa-kalianyar-ngronggot` | Masjid Barat- Desa Kalianyar Ngronggot | HLS | `https://wxyz.nganjukkab.go.id/KalianyarNgronggot/streams/qZ8C1idBjjfizQME1786673384652.m3u8` |
| 109 | `nganjuk-atcs-depan-baldes-desa-ngadipiro-wilangan` | Depan Baldes - Desa Ngadipiro Wilangan | HLS | `https://wxyz.nganjukkab.go.id/NgadipiroWilangan/streams/4z62i1qPz8LJso6e1786673405111.m3u8` |
| 110 | `nganjuk-atcs-pertigaan-apotik-desa-ngadipiro-wilangan` | Pertigaan Apotik - Desa Ngadipiro Wilangan | HLS | `https://wxyz.nganjukkab.go.id/NgadipiroWilangan/streams/6qGxNw9yL5a5m1Ca1786673404788.m3u8` |
| 111 | `nganjuk-atcs-pasar-barat-desa-ngadipiro-wilangan` | Pasar Barat - Desa Ngadipiro Wilangan | HLS | `https://wxyz.nganjukkab.go.id/NgadipiroWilangan/streams/AzYvyMwbb1IKycRc1786673404141.m3u8` |
| 112 | `nganjuk-atcs-baldes-utara-desa-sidorejo-sawahan` | Baldes Utara - Desa Sidorejo - Sawahan | HLS | `https://wxyz.nganjukkab.go.id/SidorejoSawahan/streams/awEBrH5tmrRXuAaM1786673425278.m3u8` |
| 113 | `nganjuk-atcs-baldes-selatan-desa-sidorejo-sawahan` | Baldes Selatan - Desa Sidorejo - Sawahan | HLS | `https://wxyz.nganjukkab.go.id/SidorejoSawahan/streams/y0jYVAPbQxajQA181786673425600.m3u8` |
| 114 | `nganjuk-atcs-desa-talang-talang-balai-desa-utara` | Desa TALANG - Talang Balai Desa Utara | HLS | `https://wxyz.nganjukkab.go.id/Talang/streams/bhnmwv1mxNa7bhID1786673440226.m3u8` |
| 115 | `nganjuk-atcs-desa-talang-talang-balaidesa-depan` | Desa TALANG - Talang BalaiDesa Depan | HLS | `https://wxyz.nganjukkab.go.id/Talang/streams/LNprx3RwZGHQ1AFn1786673440877.m3u8` |
| 116 | `nganjuk-atcs-desa-talang-talang-perempatan` | Desa TALANG - Talang Perempatan | HLS | `https://wxyz.nganjukkab.go.id/Talang/streams/TcXOsXWtk0KYKsOV1786673439904.m3u8` |
| 117 | `nganjuk-atcs-desa-talang-sdn-1-talang` | Desa TALANG -SDN 1 Talang | HLS | `https://wxyz.nganjukkab.go.id/Talang/streams/MXX4KtxtnYyYa3NV1786673440554.m3u8` |
| 118 | `nganjuk-atcs-desa-munung-simpang-4-selatan` | Desa MUNUNG - Simpang 4 Selatan | HLS | `https://wxyz.nganjukkab.go.id/Munung/streams/iCCFFvjbLf4turGG1786673401527.m3u8` |
| 119 | `nganjuk-atcs-desa-munung-simpang-4-utara` | Desa MUNUNG - Simpang 4 Utara | HLS | `https://wxyz.nganjukkab.go.id/Munung/streams/ytgr8nOg20603i541786673401856.m3u8` |
| 120 | `nganjuk-atcs-desa-munung-simpang-3-baldes-timur` | Desa MUNUNG - Simpang 3 BalDes Timur | HLS | `https://wxyz.nganjukkab.go.id/Munung/streams/1FXrNHmrNhdQVYNs1786673402836.m3u8` |
| 121 | `nganjuk-atcs-desa-munung-simpang-3-baldes-selatan` | Desa MUNUNG - Simpang 3 Baldes Selatan | HLS | `https://wxyz.nganjukkab.go.id/Munung/streams/yU9aM92Bv691l1vS1786673402511.m3u8` |
| 122 | `nganjuk-atcs-desa-nglawak-baldes-dalam` | Desa NGLAWAK - Baldes Dalam | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/yROubTMb9JUb9iVm1786673405761.m3u8` |
| 123 | `nganjuk-atcs-desa-nglawak-perempatan-tugu-utara` | Desa NGLAWAK - Perempatan Tugu Utara | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/WNZWaqszsAk10aWB1786673406086.m3u8` |
| 124 | `nganjuk-atcs-desa-nglawak-perempatan-tugu-selatan` | Desa NGLAWAK -Perempatan Tugu Selatan | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/5y9IHjJHC6hhlJ5n1786673407390.m3u8` |
| 125 | `nganjuk-atcs-desa-nglawak-baldes-depan` | Desa NGLAWAK - Baldes Depan | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/nNZddlV4fVLo9xlP1786673407064.m3u8` |
| 126 | `nganjuk-atcs-desa-lestari-balai-desa-utara` | Desa Lestari - Balai Desa Utara | HLS | `https://wxyz.nganjukkab.go.id/Lestari/streams/68YvdbQTRIepV83b1786673390489.m3u8` |
| 127 | `nganjuk-atcs-desa-lestari-balai-desa-selatan` | Desa Lestari - Balai Desa Selatan | HLS | `https://wxyz.nganjukkab.go.id/Lestari/streams/kqP11mJto7yiwH281786673390817.m3u8` |
| 128 | `nganjuk-atcs-desa-mojoseto-pendopo` | Desa Mojoseto - Pendopo | HLS | `https://wxyz.nganjukkab.go.id/Mojoseto/streams/u6P7LsjWNuFMzk3J1786673401201.m3u8` |
| 129 | `nganjuk-atcs-desa-mojoseto-pertigaan-selatan` | Desa Mojoseto - Pertigaan Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mojoseto/streams/EIWZyb7U728CgXD01786673400230.m3u8` |
| 130 | `nganjuk-atcs-desa-mojoseto-pertigaan-utara` | Desa Mojoseto - Pertigaan Utara | HLS | `https://wxyz.nganjukkab.go.id/Mojoseto/streams/LbH6ZjSFbLAU1MMb1786673400878.m3u8` |
| 131 | `nganjuk-atcs-desa-mojoseto-pertigaan-timur` | Desa Mojoseto - Pertigaan Timur | HLS | `https://wxyz.nganjukkab.go.id/Mojoseto/streams/DLrRi4oLUtpqpwTs1786673400555.m3u8` |
| 132 | `nganjuk-atcs-desa-sugihwaras-pertigaan-timur` | Desa Sugihwaras - Pertigaan Timur | HLS | `https://wxyz.nganjukkab.go.id/Sugihwaras/streams/1dC4SToKiTKlNzUi1786673439580.m3u8` |
| 133 | `nganjuk-atcs-desa-sugihwaras-baldes-timur` | Desa Sugihwaras - Baldes Timur | HLS | `https://wxyz.nganjukkab.go.id/Sugihwaras/streams/IoEau5fgZfWDnZAO1786673438926.m3u8` |
| 134 | `nganjuk-atcs-desa-sugihwaras-baldes-depan` | Desa Sugihwaras - Baldes Depan | HLS | `https://wxyz.nganjukkab.go.id/Sugihwaras/streams/nSxPhq6RlUr1pKBY1786673438603.m3u8` |
| 135 | `nganjuk-atcs-desa-sugihwaras-pertigaan-barat` | Desa Sugihwaras - Pertigaan Barat | HLS | `https://wxyz.nganjukkab.go.id/Sugihwaras/streams/fiMVxeVeE5kyFDzD1786673439250.m3u8` |
| 136 | `nganjuk-atcs-desa-malangsari-baldes-utara` | Desa Malangsari - Baldes Utara | HLS | `https://wxyz.nganjukkab.go.id/Malangsari/streams/NVhZ8RVCfxiw1tRL1786673391789.m3u8` |
| 137 | `nganjuk-atcs-desa-malangsari-baldes-selatan` | Desa Malangsari - Baldes Selatan | HLS | `https://wxyz.nganjukkab.go.id/Malangsari/streams/Vr0Db1QPmxyBzkEB1786673392112.m3u8` |
| 138 | `nganjuk-atcs-desa-malangsari-baldes-timur` | Desa Malangsari - Baldes Timur | HLS | `https://wxyz.nganjukkab.go.id/Malangsari/streams/CmAVwCWYOIIUvO7l1786673391465.m3u8` |
| 139 | `nganjuk-atcs-desa-malangsari-baldes-barat` | Desa Malangsari - Baldes Barat | HLS | `https://wxyz.nganjukkab.go.id/Malangsari/streams/CboMbyq8iImbX8IX1786673392436.m3u8` |
| 140 | `nganjuk-atcs-desa-mlandangan-balai-desa` | Desa Mlandangan - Balai Desa | HLS | `https://wxyz.nganjukkab.go.id/Mlandangan/streams/3k4n5KY4PjQpiZxy1786673397630.m3u8` |
| 141 | `nganjuk-atcs-desa-mlandangan-pertigaan-barat` | Desa Mlandangan - Pertigaan Barat | HLS | `https://wxyz.nganjukkab.go.id/Mlandangan/streams/aqgH3nw8SFjef3pm1786673396653.m3u8` |
| 142 | `nganjuk-atcs-desa-mlandangan-pertigaan-selatan` | Desa Mlandangan - Pertigaan Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mlandangan/streams/yCn6AhcoDtrPLOlj1786673397301.m3u8` |
| 143 | `nganjuk-atcs-desa-mlandangan-pertigaan-timur` | Desa Mlandangan - Pertigaan Timur | HLS | `https://wxyz.nganjukkab.go.id/Mlandangan/streams/AHvBpiLytbhAYFTm1786673396976.m3u8` |
| 144 | `nganjuk-atcs-kelurahan-mangundikaran-simpang-4-pangsud-barat` | Kelurahan Mangundikaran - Simpang 4 Pangsud Barat | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/AKx9NIazlolaSECV1786673394385.m3u8` |
| 145 | `nganjuk-atcs-kelurahan-mangundikaran-simpang-4-pangsud-utara` | Kelurahan Mangundikaran - Simpang 4 Pangsud Utara | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/yy3h9XKyhYbF4TdQ1786673395356.m3u8` |
| 146 | `nganjuk-atcs-kelurahan-mangundikaran-simpang-4-pangsud-timur` | Kelurahan Mangundikaran - Simpang 4 Pangsud Timur | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/4Q7yvhMM4ljaTKzV1786673395032.m3u8` |
| 147 | `nganjuk-atcs-kelurahan-mangundikaran-simpang-4-pangsud-selatan` | Kelurahan Mangundikaran - Simpang 4 Pangsud Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mangundikaran/streams/j2e6JFFQ3YYwyXXB1786673394710.m3u8` |
| 148 | `nganjuk-atcs-desa-lestari-gapura-utara` | Desa Lestari - Gapura Utara | HLS | `https://wxyz.nganjukkab.go.id/Lestari/streams/7UXE2d0decQOV0C81786673390165.m3u8` |
| 149 | `nganjuk-atcs-desa-lestari-gapura-selatan` | Desa Lestari - Gapura Selatan | HLS | `https://wxyz.nganjukkab.go.id/Lestari/streams/7ifXBUTcaWkE8to91786673391141.m3u8` |
| 150 | `nganjuk-atcs-sombron-selatan` | Sombron Selatan | HLS | `https://wxyz.nganjukkab.go.id/SOMBRON/streams/7ZJEyZrduNrsWTB41786673437299.m3u8` |
| 151 | `nganjuk-atcs-sombron-timur` | Sombron Timur | HLS | `https://wxyz.nganjukkab.go.id/SOMBRON/streams/tiwavwfFbs78VILv1786673437954.m3u8` |
| 152 | `nganjuk-atcs-sombron-barat` | Sombron Barat | HLS | `https://wxyz.nganjukkab.go.id/SOMBRON/streams/Oihst9loKU9xiP6f1786673437627.m3u8` |
| 153 | `nganjuk-atcs-sombron-utara` | Sombron Utara | HLS | `https://wxyz.nganjukkab.go.id/SOMBRON/streams/AqdXV5MqUbbmtDFq1786673438279.m3u8` |
| 154 | `nganjuk-atcs-mpp-dalam-2` | MPP Dalam -2 | HLS | `https://wxyz.nganjukkab.go.id/MallPelayananPublik/streams/VDRQ8rVGhkTNS3kG1786673393408.m3u8` |
| 155 | `nganjuk-atcs-mpp-dalam-1` | MPP Dalam-1 | HLS | `https://wxyz.nganjukkab.go.id/MallPelayananPublik/streams/ivrirLwg7j2PiVRu1786673392759.m3u8` |
| 156 | `nganjuk-atcs-mpp-dalam-3` | MPP Dalam-3 | HLS | `https://wxyz.nganjukkab.go.id/MallPelayananPublik/streams/uyg8UIjRzVrwHg1n1786673393086.m3u8` |
| 157 | `nganjuk-atcs-mpp-dalam-4` | MPP Dalam-4 | HLS | `https://wxyz.nganjukkab.go.id/MallPelayananPublik/streams/L1bFjo7cs8wL9Srt1786673393733.m3u8` |
| 158 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-taman-selatan` | GOR Bung Karno dan Taman Pintar - Taman Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/5HeUgITKRQRoHLex1786673447378.m3u8` |
| 159 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-taman-utara` | GOR Bung Karno dan Taman Pintar - Taman Utara | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/DPel37G9RusBOgIS1786673446726.m3u8` |
| 160 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-taman-barat` | GOR Bung Karno dan Taman Pintar - Taman Barat | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/6nt9XkSoPykpxKlp1786673445752.m3u8` |
| 161 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-taman-gerbang-timur` | GOR Bung Karno dan Taman Pintar - Taman Gerbang Timur | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/QOKH6lfS5jE4WngW1786673447049.m3u8` |
| 162 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-gor-gerbang-timur` | GOR Bung Karno dan Taman Pintar - Gor Gerbang Timur | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/OL47dc1ncT9gyRoB1786673445427.m3u8` |
| 163 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-gor-gerbang-selatan` | GOR Bung Karno dan Taman Pintar - Gor Gerbang Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/1mTsEFp7fYz3OpVG1786673446077.m3u8` |
| 164 | `nganjuk-atcs-gor-bung-karno-dan-taman-pintar-gor-gerbang-utara` | GOR Bung Karno dan Taman Pintar - Gor Gerbang Utara | HLS | `https://wxyz.nganjukkab.go.id/TamanPintarGORBungKarno/streams/f0FWnY1VyySz2AIW1786673446402.m3u8` |
| 165 | `nganjuk-atcs-taman-pandan-wilis-taman-parkiran` | Taman Pandan Wilis - Taman Parkiran | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/TyMM1QsWOjrLYOoe1786673444122.m3u8` |
| 166 | `nganjuk-atcs-taman-pandan-wilis-taman-dalam-timur` | Taman Pandan Wilis - Taman Dalam Timur | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/Tzp9mQkvRbUGYP531786673445101.m3u8` |
| 167 | `nganjuk-atcs-taman-pandan-wilis-taman-dalam-barat` | Taman Pandan Wilis - Taman Dalam Barat | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/BqihuiAQr8SlVdeq1786673443795.m3u8` |
| 168 | `nganjuk-atcs-taman-pandan-wilis-taman-gerbang-selatan` | Taman Pandan Wilis - Taman Gerbang Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/48OAMxljGZdhBYYA1786673444449.m3u8` |
| 169 | `nganjuk-atcs-taman-pandan-wilis-taman-kolam-selatan` | Taman Pandan Wilis - Taman Kolam Selatan | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/z6iODW8iZmRKdqGc1786673444774.m3u8` |
| 170 | `nganjuk-atcs-taman-pandan-wilis-taman-kolam-utara` | Taman Pandan Wilis - Taman Kolam Utara | HLS | `https://wxyz.nganjukkab.go.id/TamanPandanWilis/streams/UjR3LVLji3cxrPUB1786673443471.m3u8` |
| 171 | `nganjuk-atcs-simpang-4-begadung-begadung-timur` | Simpang 4 Begadung - Begadung Timur | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Begadung/streams/VM0iRvDUXvRuuJy01786673431129.m3u8` |
| 172 | `nganjuk-atcs-simpang-4-begadung-begadung-utara` | Simpang 4 Begadung - Begadung Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Begadung/streams/7LmVRGS7WNH15nz81786673430803.m3u8` |
| 173 | `nganjuk-atcs-simpang-4-begadung-begadung-barat` | Simpang 4 Begadung - Begadung Barat | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Begadung/streams/fieAjENlFCKxy51B1786673431456.m3u8` |
| 174 | `nganjuk-atcs-simpang-4-begadung-begadung-selatan` | Simpang 4 Begadung - Begadung Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Begadung/streams/pvL8uGbw2hNakECL1786673430478.m3u8` |
| 175 | `nganjuk-atcs-traffic-light-candirejo-tl-candi-selatan` | Traffic Light Candirejo - TL Candi selatan | HLS | `https://wxyz.nganjukkab.go.id/TLCandi/streams/AACtfS4pXhZ7Qn2L1786673453881.m3u8` |
| 176 | `nganjuk-atcs-traffic-light-candirejo-tl-candi-utara` | Traffic Light Candirejo - TL Candi Utara | HLS | `https://wxyz.nganjukkab.go.id/TLCandi/streams/FPtQ8ccfXnLflIL11786673454208.m3u8` |
| 177 | `nganjuk-atcs-traffic-light-candirejo-tl-candi-barat` | Traffic Light Candirejo - TL Candi barat | HLS | `https://wxyz.nganjukkab.go.id/TLCandi/streams/TKNnpJbuzo1dmeme1786673454531.m3u8` |
| 178 | `nganjuk-atcs-traffic-light-pace-pace-selatan` | Traffic Light Pace - Pace Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLPace/streams/HZdocsqkAKDhwhPc1786673458111.m3u8` |
| 179 | `nganjuk-atcs-traffic-light-pace-pace-utara` | Traffic Light Pace - Pace Utara | HLS | `https://wxyz.nganjukkab.go.id/TLPace/streams/m7xhIxrzMHpGx4yY1786673458433.m3u8` |
| 180 | `nganjuk-atcs-traffic-light-pace-pace-timur` | Traffic Light Pace - Pace Timur | HLS | `https://wxyz.nganjukkab.go.id/TLPace/streams/d1uMVhtO1rVyrc2f1786673457463.m3u8` |
| 181 | `nganjuk-atcs-traffic-light-pace-pace-barat` | Traffic Light Pace - Pace Barat | HLS | `https://wxyz.nganjukkab.go.id/TLPace/streams/r1x3e3oWprYzR5tc1786673457787.m3u8` |
| 182 | `nganjuk-atcs-traffic-light-tiripan-tiripan-selatan` | Traffic Light Tiripan - Tiripan Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/i3F2ZiFPrwOZKkhL1786673459404.m3u8` |
| 183 | `nganjuk-atcs-traffic-light-tiripan-tiripan-timur` | Traffic Light Tiripan - Tiripan Timur | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/9ZQ7qS57dSzrlxhW1786673460705.m3u8` |
| 184 | `nganjuk-atcs-traffic-light-tiripan-tiripan-barat` | Traffic Light Tiripan - Tiripan Barat | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/YicQao6KC83oNa2s1786673459081.m3u8` |
| 185 | `nganjuk-atcs-traffic-light-tiripan-tiripan-utara` | Traffic Light Tiripan - Tiripan Utara | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/JaiqkfUGpDwtTHR11786673458759.m3u8` |
| 186 | `nganjuk-atcs-berbek-traffic-light-utara` | Berbek Traffic Light Utara | HLS | `https://wxyz.nganjukkab.go.id/TLBerbek/streams/HMWgJ5JUvga32o481786673453554.m3u8` |
| 187 | `nganjuk-atcs-berbek-traffic-light-selatan` | Berbek Traffic Light Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLBerbek/streams/Db4VpgmDnEPatEoW1786673453227.m3u8` |
| 188 | `nganjuk-atcs-traffic-light-watudandang-watudandang-utara` | Traffic Light Watudandang - Watudandang Utara | HLS | `https://wxyz.nganjukkab.go.id/TLWatudandang/streams/7UOYnYqcYRyRt1XR1786673461679.m3u8` |
| 189 | `nganjuk-atcs-traffic-light-watudandang-watudandang-selatan` | Traffic Light Watudandang - Watudandang Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLWatudandang/streams/tgSvUGFELLAf1zos1786673461030.m3u8` |
| 190 | `nganjuk-atcs-traffic-light-watudandang-watudandang-timur` | Traffic Light Watudandang - Watudandang Timur | HLS | `https://wxyz.nganjukkab.go.id/TLWatudandang/streams/xR3SQp1zL5Hy6gZ81786673461353.m3u8` |
| 191 | `nganjuk-atcs-traffic-light-ngujung-ngujung-utara` | Traffic Light Ngujung - Ngujung Utara | HLS | `https://wxyz.nganjukkab.go.id/TLNgujung/streams/JYJolVRk6cdQLHbV1786673457136.m3u8` |
| 192 | `nganjuk-atcs-traffic-light-ngujung-ngujung-timur` | Traffic Light Ngujung - Ngujung Timur | HLS | `https://wxyz.nganjukkab.go.id/TLNgujung/streams/4rduUiiTgbqT6yJq1786673456155.m3u8` |
| 193 | `nganjuk-atcs-traffic-light-ngujung-ngujung-selatan` | Traffic Light Ngujung - Ngujung Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLNgujung/streams/BE6GNvkEYiSZtNPC1786673456478.m3u8` |
| 194 | `nganjuk-atcs-traffic-light-ngujung-ngujung-barat` | Traffic Light Ngujung - Ngujung Barat | HLS | `https://wxyz.nganjukkab.go.id/TLNgujung/streams/R5o3ZB6ypX5fVpaZ1786673456809.m3u8` |
| 195 | `nganjuk-atcs-jembatan-kelutan-kelutan-selatan` | Jembatan Kelutan - Kelutan Selatan | HLS | `https://wxyz.nganjukkab.go.id/JembatanKelutan/streams/Kw9XwS7kqZvW7VLS1786673383680.m3u8` |
| 196 | `nganjuk-atcs-jembatan-kelutan-kelutan-timur` | Jembatan Kelutan - Kelutan Timur | HLS | `https://wxyz.nganjukkab.go.id/JembatanKelutan/streams/68jFvPakkGhImK4s1786673383356.m3u8` |
| 197 | `nganjuk-atcs-jembatan-kelutan-kelutan-barat` | Jembatan Kelutan - Kelutan Barat | HLS | `https://wxyz.nganjukkab.go.id/JembatanKelutan/streams/JY3YRe2CwAGrfKHU1786673383030.m3u8` |
| 198 | `nganjuk-atcs-exit-tol-timur` | Exit Tol - Timur | HLS | `https://wxyz.nganjukkab.go.id/ExitTOL/streams/p8X9KpfftU3bFk9v1786673377833.m3u8` |
| 199 | `nganjuk-atcs-exit-tol-utara` | Exit Tol - Utara | HLS | `https://wxyz.nganjukkab.go.id/ExitTOL/streams/C4UZD2Sez6hJSipl1786673377184.m3u8` |
| 200 | `nganjuk-atcs-exit-tol-barat` | Exit Tol - Barat | HLS | `https://wxyz.nganjukkab.go.id/ExitTOL/streams/baZZEmf98pnkn3RR1786673377509.m3u8` |
| 201 | `nganjuk-atcs-pasar-rejoso-utara` | Pasar Rejoso Utara | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/IAC1vNlq3H4voR5w1786673421055.m3u8` |
| 202 | `nganjuk-atcs-pasar-rejoso-timur` | Pasar Rejoso Timur | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/k7gt5V29wwxuHwOt1786673421706.m3u8` |
| 203 | `nganjuk-atcs-pasar-rejoso-barat` | Pasar Rejoso Barat | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/TCxWOMP97ngA14kz1786673422682.m3u8` |
| 204 | `nganjuk-atcs-barong-barat` | Barong Barat | HLS | `https://wxyz.nganjukkab.go.id/TLBarong/streams/JrTQ7DxWXICAAK8N1786673452244.m3u8` |
| 205 | `nganjuk-atcs-barong-selatan` | Barong Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLBarong/streams/JJ4nO1hfcKlE91Aw1786673452571.m3u8` |
| 206 | `nganjuk-atcs-barong-timur` | Barong Timur | HLS | `https://wxyz.nganjukkab.go.id/TLBarong/streams/bJFMV5BnPSkzPVQz1786673452901.m3u8` |
| 207 | `nganjuk-atcs-simpang-4-ngangkatan-ngangkatan-barat` | Simpang 4 Ngangkatan - Ngangkatan Barat | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Ngangkatan/streams/LYztH66M3w7zHYjW1786673432755.m3u8` |
| 208 | `nganjuk-atcs-simpang-4-ngangkatan-ngangkatan-timur` | Simpang 4 Ngangkatan - Ngangkatan Timur | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Ngangkatan/streams/5y5Xy7FWKaM8DXan1786673432108.m3u8` |
| 209 | `nganjuk-atcs-simpang-4-ngangkatan-ngangkatan-utara` | Simpang 4 Ngangkatan - Ngangkatan Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Ngangkatan/streams/4BG2cQHOfCVJ8N7Q1786673432432.m3u8` |
| 210 | `nganjuk-atcs-simpang-4-ngangkatan-ngangkatan-selatan` | Simpang 4 Ngangkatan - Ngangkatan Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Ngangkatan/streams/1yDeDrKuxZeb6FME1786673431783.m3u8` |
| 211 | `nganjuk-atcs-traffic-light-cangkringan-cangkringan-timur` | Traffic Light Cangkringan - Cangkringan Timur | HLS | `https://wxyz.nganjukkab.go.id/TLCangkringan/streams/APV5RcH7qNoaQVcu1786673454856.m3u8` |
| 212 | `nganjuk-atcs-traffic-light-cangkringan-cangkringan-utara` | Traffic Light Cangkringan - Cangkringan Utara | HLS | `https://wxyz.nganjukkab.go.id/TLCangkringan/streams/eAfGKuDk7L5GFomc1786673455504.m3u8` |
| 213 | `nganjuk-atcs-traffic-light-cangkringan-cangkringan-selatan` | Traffic Light Cangkringan - Cangkringan Selatan | HLS | `https://wxyz.nganjukkab.go.id/TLCangkringan/streams/7wtI2z1q4OHp7Y2a1786673455830.m3u8` |
| 214 | `nganjuk-atcs-traffic-light-cangkringan-cangkringan-barat` | Traffic Light Cangkringan - Cangkringan Barat | HLS | `https://wxyz.nganjukkab.go.id/TLCangkringan/streams/Hs8MzTqYb6Es4qh41786673455181.m3u8` |
| 215 | `nganjuk-atcs-simpang-sambikerep-sambikerep-utara` | Simpang Sambikerep - Sambikerep Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Sambikerep/streams/4wRX2w6fWDJxasYs1786673430154.m3u8` |
| 216 | `nganjuk-atcs-simpang-sambikerep-sambikerep-selatan` | Simpang Sambikerep - Sambikerep Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Sambikerep/streams/2R7lsXpmxk7BiXFI1786673429829.m3u8` |
| 217 | `nganjuk-atcs-simpang-3-jetis-jetis-utara` | Simpang 3 Jetis - Jetis Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Jetis/streams/JEPUSChBwpEdbVbf1786673428524.m3u8` |
| 218 | `nganjuk-atcs-simpang-3-jetis-jetis-barat` | Simpang 3 Jetis - Jetis Barat | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Jetis/streams/DmyxjlJ8EeY9k8S61786673428199.m3u8` |
| 219 | `nganjuk-atcs-simpang-3-jetis-jetis-selatan` | Simpang 3 Jetis - Jetis Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Jetis/streams/v1vbeB8xzzvyO09R1786673427875.m3u8` |
| 220 | `nganjuk-atcs-wisata-goa-margo-tresno-margo-tresno-selatan` | WIsata Goa Margo Tresno - Margo tresno selatan | HLS | `https://wxyz.nganjukkab.go.id/GuaMargotresno/streams/fu9LIXeFGJfpBtkF1786673381413.m3u8` |
| 221 | `nganjuk-atcs-wisata-goa-margo-tresno-margo-tresno-utara` | WIsata Goa Margo Tresno - Margo tresno Utara | HLS | `https://wxyz.nganjukkab.go.id/GuaMargotresno/streams/uCJ1AFSpxCvGuEma1786673381076.m3u8` |
| 222 | `nganjuk-atcs-wisata-goa-margo-tresno-margo-tresno-timur` | WIsata Goa Margo Tresno - Margo tresno Timur | HLS | `https://wxyz.nganjukkab.go.id/GuaMargotresno/streams/T8zcAdierFvMvOGd1786673380753.m3u8` |
| 223 | `nganjuk-atcs-simpang-3-ngluyu-ngluyu-selatan` | Simpang 3 Ngluyu - Ngluyu Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Ngluyu/streams/VdLRL3FyRQ3Qyode1786673429502.m3u8` |
| 224 | `nganjuk-atcs-simpang-3-ngluyu-ngluyu-barat` | Simpang 3 Ngluyu - Ngluyu Barat | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Ngluyu/streams/c7sgmbCp7BrmDOuB1786673428849.m3u8` |
| 225 | `nganjuk-atcs-simpang-3-ngluyu-ngluyu-utara` | Simpang 3 Ngluyu - Ngluyu Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang3Ngluyu/streams/na3PMVQ7YOLbFfkj1786673429176.m3u8` |
| 226 | `nganjuk-atcs-simpang-4-warujayeng-warujayeng-barat` | Simpang 4 Warujayeng - Warujayeng Barat | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Warujayeng/streams/na4lgF6vIGgWLq1c1786673433732.m3u8` |
| 227 | `nganjuk-atcs-simpang-4-warujayeng-warujayeng-timur` | Simpang 4 Warujayeng - Warujayeng Timur | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Warujayeng/streams/SVvWI6E1gRIYsceL1786673433081.m3u8` |
| 228 | `nganjuk-atcs-simpang-4-warujayeng-warujayeng-utara` | Simpang 4 Warujayeng - Warujayeng Utara | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Warujayeng/streams/8upaUzUtbQ3dvLzO1786673434059.m3u8` |
| 229 | `nganjuk-atcs-simpang-4-warujayeng-warujayeng-selatan` | Simpang 4 Warujayeng - Warujayeng Selatan | HLS | `https://wxyz.nganjukkab.go.id/Simpang4Warujayeng/streams/elwaJg2tT71zbYN21786673433406.m3u8` |
| 230 | `nganjuk-atcs-awar-awar-awar-awar-timur` | Awar-awar - Awar Awar Timur | HLS | `https://wxyz.nganjukkab.go.id/PosAwarAwar/streams/KTY7jLEtpkzRgMC61786673420406.m3u8` |
| 231 | `nganjuk-atcs-awar-awar-awar-awar-barat` | Awar-awar - Awar Awar Barat | HLS | `https://wxyz.nganjukkab.go.id/PosAwarAwar/streams/kEqDiPAiRNpJaMDi1786673420077.m3u8` |
| 232 | `nganjuk-atcs-awar-awar-awar-awar-selatan` | Awar-awar - Awar Awar Selatan | HLS | `https://wxyz.nganjukkab.go.id/PosAwarAwar/streams/SDyeLcYv53tMJGzA1786673419754.m3u8` |
| 233 | `nganjuk-atcs-awar-awar-awar-awar-utara` | Awar-awar - Awar Awar Utara | HLS | `https://wxyz.nganjukkab.go.id/PosAwarAwar/streams/6jWxq0WHYCSzLfvs1786673420732.m3u8` |
| 234 | `nganjuk-atcs-pos-polisi-wilangan-wilangan-timur` | Pos Polisi Wilangan - Wilangan Timur | HLS | `https://wxyz.nganjukkab.go.id/WilanganPolsek/streams/pmUkY8OtwbllzjxC1786673462336.m3u8` |
| 235 | `nganjuk-atcs-pos-polisi-wilangan-wilangan-barat` | Pos Polisi Wilangan - Wilangan Barat | HLS | `https://wxyz.nganjukkab.go.id/WilanganPolsek/streams/O9MM1zgPETGD6Ga51786673462007.m3u8` |
| 236 | `nganjuk-atcs-sedudo-sedudo-utara` | Sedudo - Sedudo Utara | HLS | `https://wxyz.nganjukkab.go.id/SidorejoSawahan/streams/6txPJ5QtsiAH0P3s1786673425923.m3u8` |
| 237 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-monumen-utara` | Monumen Anjukladang (Terminal Nganjuk) - Monumen Utara | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/TqvLsryzYrqb0R3U1786673375236.m3u8` |
| 238 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-monumen-selatan` | Monumen Anjukladang (Terminal Nganjuk) - Monumen Selatan | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/VyIhaZCu8lCdkco21786673375560.m3u8` |
| 239 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-monumen-tl-barat` | Monumen Anjukladang (Terminal Nganjuk) - Monumen TL Barat | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/UpygH7hwfNmUnoiM1786673376209.m3u8` |
| 240 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-monumen-tl-timur` | Monumen Anjukladang (Terminal Nganjuk) - Monumen TL Timur | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/WjmLq4HtNqEQDRkR1786673375884.m3u8` |
| 241 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-jembatan-dondong-timur` | Monumen Anjukladang (Terminal Nganjuk) - Jembatan Dondong Timur | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/5a8ZOphEnKWy3Jyp1786673376859.m3u8` |
| 242 | `nganjuk-atcs-monumen-anjukladang-terminal-nganjuk-jembatan-dondong-barat` | Monumen Anjukladang (Terminal Nganjuk) - Jembatan Dondong Barat | HLS | `https://wxyz.nganjukkab.go.id/Dungdet/streams/JId7FZFXQvBtQQpY1786673374912.m3u8` |
| 243 | `nganjuk-atcs-dam-tiripan-pintu-air` | Dam Tiripan – Pintu.Air | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/9dz2Rvkkj5U7rYTv1786673459732.m3u8` |
| 244 | `nganjuk-atcs-dam-tiripan-jembatan-timur` | Dam Tiripan – Jembatan Timur | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/0SIBGf0ktPkMzUtg1786673460383.m3u8` |
| 245 | `nganjuk-atcs-dam-tiripan-jembatan-barat` | Dam Tiripan – Jembatan Barat | HLS | `https://wxyz.nganjukkab.go.id/TLTiripan/streams/S3ypXsqid1Br5zCU1786673460059.m3u8` |
| 246 | `nganjuk-atcs-dam-badug-pintu-air` | DAM Badug - Pintu Air | HLS | `https://wxyz.nganjukkab.go.id/DamBadug/streams/7tYRPcHZLEdcZYqu1786673372962.m3u8` |
| 247 | `nganjuk-atcs-dam-badug-timur` | DAM Badug - Timur | HLS | `https://wxyz.nganjukkab.go.id/DamBadug/streams/lbO4S2mQyBI2gUUg1786673373607.m3u8` |
| 248 | `nganjuk-atcs-dam-badug-selatan` | DAM Badug - Selatan | HLS | `https://wxyz.nganjukkab.go.id/DamBadug/streams/j0eR5pkTNbi5D6gZ1786673372639.m3u8` |
| 249 | `nganjuk-atcs-dam-badug-jembatan-utara` | DAM Badug - Jembatan Utara | HLS | `https://wxyz.nganjukkab.go.id/DamBadug/streams/GYMcNLFMbMTY0mnL1786673373285.m3u8` |
| 250 | `nganjuk-atcs-dam-rejoso-pintu-air` | DAM Rejoso - Pintu Air | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/q1YMrZxE4DLMMTTG1786673421380.m3u8` |
| 251 | `nganjuk-atcs-dam-rejoso-jembatan-utara` | DAM Rejoso - Jembatan Utara | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/qfsabs1Hxpdvt2cl1786673422355.m3u8` |
| 252 | `nganjuk-atcs-dam-rejoso-jembatan-selatan` | DAM Rejoso - Jembatan Selatan | HLS | `https://wxyz.nganjukkab.go.id/REJOSO/streams/PZxBX3BbNxscUSnN1786673422032.m3u8` |
| 253 | `nganjuk-atcs-traffic-light-guyangan-guyangan-selatan` | Traffic Light Guyangan - Guyangan Selatan | HLS | `https://wxyz.nganjukkab.go.id/GUYANGAN/streams/c56rHEmdfwLE2uTp1786673382060.m3u8` |
| 254 | `nganjuk-atcs-traffic-light-guyangan-guyangan-utara` | Traffic Light Guyangan - Guyangan Utara | HLS | `https://wxyz.nganjukkab.go.id/GUYANGAN/streams/Xv1fbKdxpV7rQYTP1786673381738.m3u8` |
| 255 | `nganjuk-atcs-traffic-light-guyangan-guyangan-barat` | Traffic Light Guyangan - Guyangan Barat | HLS | `https://wxyz.nganjukkab.go.id/GUYANGAN/streams/sFfzKQUaJwRxO0nY1786673382707.m3u8` |
| 256 | `nganjuk-atcs-traffic-light-guyangan-guyangan-timur` | Traffic Light Guyangan - Guyangan Timur | HLS | `https://wxyz.nganjukkab.go.id/GUYANGAN/streams/lEQrKeQzAiHMRomW1786673382383.m3u8` |
| 257 | `nganjuk-atcs-pasar-kertosono-depan` | Pasar Kertosono Depan | HLS | `https://wxyz.nganjukkab.go.id/PasarKertosono/streams/aP4IvEAnuy2LBQ491786673412276.m3u8` |
| 258 | `nganjuk-atcs-pasar-kertosono-timur` | Pasar Kertosono Timur | HLS | `https://wxyz.nganjukkab.go.id/PasarKertosono/streams/SLvYO0fq3KcmROW51786673412605.m3u8` |
| 259 | `nganjuk-atcs-pasar-kertosono-barat` | Pasar Kertosono Barat | HLS | `https://wxyz.nganjukkab.go.id/PasarKertosono/streams/pt4EPHgCDkKlVMQL1786673411953.m3u8` |
| 260 | `nganjuk-atcs-ngrami-utara` | Ngrami Utara | HLS | `https://wxyz.nganjukkab.go.id/NGRAMI/streams/BL5kWumrGw2gpf3Y1786673409340.m3u8` |
| 261 | `nganjuk-atcs-ngrami-timur` | Ngrami Timur | HLS | `https://wxyz.nganjukkab.go.id/NGRAMI/streams/QE4kk5C8DdXcTmUa1786673409667.m3u8` |
| 262 | `nganjuk-atcs-ngrami-selatan` | Ngrami Selatan | HLS | `https://wxyz.nganjukkab.go.id/NGRAMI/streams/IdVdfeSscVcfvASG1786673409015.m3u8` |
| 263 | `nganjuk-atcs-ngrami-barat` | Ngrami Barat | HLS | `https://wxyz.nganjukkab.go.id/NGRAMI/streams/35CsBLIE80w4ggew1786673409991.m3u8` |
| 264 | `nganjuk-atcs-pasar-bagor-barat` | Pasar Bagor Barat | HLS | `https://wxyz.nganjukkab.go.id/PasarBagor/streams/soe6noUls8aS2FcF1786673410318.m3u8` |
| 265 | `nganjuk-atcs-pasar-bagor-timur` | Pasar Bagor Timur | HLS | `https://wxyz.nganjukkab.go.id/PasarBagor/streams/EFPlnOSflosCmE9k1786673410645.m3u8` |
| 266 | `nganjuk-atcs-baron-rth-umkm` | Baron RTH UMKM | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/JAQEpS2bXLwP50y71786673449644.m3u8` |
| 267 | `nganjuk-atcs-baron-rth-dalam` | Baron RTH Dalam | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/HWWXDeFXni7nZxsO1786673449970.m3u8` |
| 268 | `nganjuk-atcs-baron-timur` | Baron Timur | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/E6YTyIFHXm91RR5p1786673451918.m3u8` |
| 269 | `nganjuk-atcs-baron-timur-2` | Baron Timur 2 | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/72gM7KeHADEwwufW1786673450947.m3u8` |
| 270 | `nganjuk-atcs-baron-tl-barat` | Baron TL Barat | HLS | `https://wxyz.nganjukkab.go.id/testings/streams/6ejygqBdQzMmzDOh1786673449321.m3u8` |
| 271 | `nganjuk-atcs-klinter-mentaos` | Klinter Mentaos | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/tBJy8doULe0ku9Yt1786673405436.m3u8` |
| 272 | `nganjuk-atcs-jembatan-klinter` | Jembatan Klinter | HLS | `https://wxyz.nganjukkab.go.id/Nglawak/streams/Z4eQidxCc6nULDPB1786673406411.m3u8` |
| 273 | `nganjuk-atcs-gondang-tl-barat` | Gondang TL Barat | HLS | `https://wxyz.nganjukkab.go.id/Gondang/streams/dnie4z5BiJFEHwS11786673380105.m3u8` |
| 274 | `nganjuk-atcs-gondang-pasar-timur` | Gondang Pasar Timur | HLS | `https://wxyz.nganjukkab.go.id/Gondang/streams/xGo2Mv2qeYL47vuu1786673380429.m3u8` |
| 275 | `nganjuk-atcs-gondang-pasar-barat` | Gondang Pasar Barat | HLS | `https://wxyz.nganjukkab.go.id/Gondang/streams/qYfjD2PHBX0Nelp61786673379781.m3u8` |
| 276 | `nganjuk-atcs-mojokendil-perempatan-barat` | Mojokendil Perempatan Barat | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/9UpzVii6KTJrApYb1786673397955.m3u8` |
| 277 | `nganjuk-atcs-mojokendil-perempatan-utara` | Mojokendil Perempatan Utara | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/adLH4lSDw003XVXq1786673398930.m3u8` |
| 278 | `nganjuk-atcs-mojokendil-perempatan-selatan` | Mojokendil Perempatan Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/VM9GRVWtoEjZnzdz1786673399254.m3u8` |
| 279 | `nganjuk-atcs-mojokendil-perempatan-timur` | Mojokendil Perempatan Timur | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/buw0iI14tc4jdcO51786673399578.m3u8` |
| 280 | `nganjuk-atcs-mojokendil-sumbersari-selatan` | Mojokendil - Sumbersari Selatan | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/KhqKkIXCu7qy7bah1786673398603.m3u8` |
| 281 | `nganjuk-atcs-mojokendil-sumbersari-barat` | Mojokendil - Sumbersari Barat | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/T0BXbwsswnxFEjAM1786673399904.m3u8` |
| 282 | `nganjuk-atcs-mojokendil-sumbersari-timur` | Mojokendil - Sumbersari Timur | HLS | `https://wxyz.nganjukkab.go.id/Mojokendil/streams/vD9Hz0JTLXU1NhX81786673398280.m3u8` |
| 283 | `nganjuk-atcs-perum-bromo-pintu-masuk` | Perum Bromo - Pintu Masuk | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/BMc53iozYF1oqkuc1786673417483.m3u8` |
| 284 | `nganjuk-atcs-perum-bromo-jalur-utama` | Perum Bromo - Jalur Utama | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/UgbQd5V0tt6YdhID1786673416832.m3u8` |
| 285 | `nganjuk-atcs-perum-bromo-bromo-vii` | Perum Bromo - Bromo VII | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/s8sACDnVNboPUHup1786673416180.m3u8` |
| 286 | `nganjuk-atcs-perum-bromo-bromo-viii` | Perum Bromo - Bromo VIII | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/DqQPvaLJ0MvyX86O1786673416504.m3u8` |
| 287 | `nganjuk-atcs-perum-bromo-jalur-utama-barat` | Perum Bromo - Jalur Utama Barat | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/KKZZxPVx3ZPkG8H21786673417158.m3u8` |
| 288 | `nganjuk-atcs-perum-bromo-merapi-4-barat` | Perum Bromo - Merapi 4 Barat | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/4DgrBJbLxTG7bMvC1786673417810.m3u8` |
| 289 | `nganjuk-atcs-perum-bromo-merapi-4-selatan` | Perum Bromo - Merapi 4 Selatan | HLS | `https://wxyz.nganjukkab.go.id/PerumBromo/streams/jhKSrvGcwlzLPelQ1786673418133.m3u8` |

### Garut (15)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `garut-atcs-simpang-5` | Simpang 5 | HLS | `https://cctv.garutkab.go.id/streams/cam_1787539233486199198/live.m3u8` |
| 2 | `garut-atcs-petigaan-pengkolan` | Petigaan Pengkolan | HLS | `https://cctv.garutkab.go.id/streams/cam_1787539218405620248/live.m3u8` |
| 3 | `garut-atcs-sukadana` | Sukadana | HLS | `https://cctv.garutkab.go.id/streams/cam_1787539189281403326/live.m3u8` |
| 4 | `garut-atcs-simpang-limbangan` | Simpang Limbangan | HLS | `https://cctv.garutkab.go.id/streams/cam_1787539149377075528/live.m3u8` |
| 5 | `garut-atcs-perempatan-bjb` | Perempatan BJB | HLS | `https://cctv.garutkab.go.id/streams/cam_1787539119128930509/live.m3u8` |
| 6 | `garut-atcs-simpang-malangbong` | Simpang Malangbong | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538646306711165/live.m3u8` |
| 7 | `garut-atcs-cipanas-harmoni` | Cipanas Harmoni | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538564655227152/live.m3u8` |
| 8 | `garut-atcs-cipanas-pertigaan` | Cipanas pertigaan | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538546724229283/live.m3u8` |
| 9 | `garut-atcs-perempatan-sigobing` | Perempatan Sigobing | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538532004486371/live.m3u8` |
| 10 | `garut-atcs-bunderan-suci` | Bunderan Suci | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538464907719343/live.m3u8` |
| 11 | `garut-atcs-maktal-pos` | Maktal pos | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538446742338235/live.m3u8` |
| 12 | `garut-atcs-jembatan-maktal` | Jembatan Maktal | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538398416470636/live.m3u8` |
| 13 | `garut-atcs-kadungora` | Kadungora | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538341418903270/live.m3u8` |
| 14 | `garut-atcs-wanaraja` | Wanaraja | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538293152387236/live.m3u8` |
| 15 | `garut-atcs-alun-alun-tarogong` | Alun Alun Tarogong | HLS | `https://cctv.garutkab.go.id/streams/cam_1787538200924155479/live.m3u8` |

### Lebak (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `lebak-atcs-jl-alun-alun-selatan-1-air-mancur` | Jl. Alun-Alun Selatan - 1 (Air Mancur) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-004/main/index.m3u8` |
| 2 | `lebak-atcs-jl-alun-alun-selatan-2-simpang-1` | Jl. Alun-Alun Selatan - 2 (Simpang 1) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-005/main/index.m3u8` |
| 3 | `lebak-atcs-jl-alun-alun-selatan-3-simpang-2` | Jl. Alun-Alun Selatan - 3 (Simpang 2) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-006/main/index.m3u8` |
| 4 | `lebak-atcs-jl-kaum-1-arah-utara` | Jl. Kaum - 1 (Arah Utara) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-001/main/index.m3u8` |
| 5 | `lebak-atcs-jl-kaum-2-arah-timur` | Jl. Kaum - 2 (Arah Timur) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-002/main/index.m3u8` |
| 6 | `lebak-atcs-jl-r-m-nata-atmaja-1-simpang-1` | Jl. R.M. Nata Atmaja - 1 (Simpang 1) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-007/main/index.m3u8` |
| 7 | `lebak-atcs-jl-r-m-nata-atmaja-2-simpang-2` | Jl. R.M. Nata Atmaja - 2 (Simpang 2) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-008/main/index.m3u8` |
| 8 | `lebak-atcs-jl-r-m-nata-atmaja-3-pintu-masuk-alun-alun-timur` | Jl. R.M. Nata Atmaja - 3 (Pintu Masuk Alun-alun Timur) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-009/main/index.m3u8` |
| 9 | `lebak-atcs-jl-r-t-hardiwinangun-1-simpang-tibum-timur` | Jl. R.T. Hardiwinangun - 1 (Simpang Tibum Timur) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-010/main/index.m3u8` |
| 10 | `lebak-atcs-jl-r-t-hardiwinangun-2-simpang-tibum-balong` | Jl. R.T. Hardiwinangun - 2 (Simpang Tibum Balong) | HLS | `https://cctv.lebakkab.go.id/hls/CAM-011/main/index.m3u8` |

### Ciamis (14)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `ciamis-atcs-simpang-tonjong-arah-alun-alun` | Simpang Tonjong Arah Alun Alun | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/2lXC4ckpEIMOOeu812101585077277.m3u8` |
| 2 | `ciamis-atcs-simpang-ramona-arah-alun-alun` | Simpang Ramona Arah Alun alun | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/2qLLaZwZ84dVBWiI11686757500847.m3u8` |
| 3 | `ciamis-atcs-simpang-ramona-arah-stasiun` | Simpang Ramona Arah Stasiun | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/9eeihg8mCPjdSPZA11438123584949.m3u8` |
| 4 | `ciamis-atcs-simpang-pasar-ciamis-arah-graha` | Simpang Pasar Ciamis Arah Graha | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/Gil7iBjt6ifeZweD11492401663749.m3u8` |
| 5 | `ciamis-atcs-simpang-pahlawan-arah-ciamis` | Simpang Pahlawan Arah Ciamis | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/T1RDCka4hOT8XaYA12331511488363.m3u8` |
| 6 | `ciamis-atcs-simpang-ramona-arah-pusaka` | Simpang Ramona Arah Pusaka | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/b9oVcRmb6mygovh711323506940850.m3u8` |
| 7 | `ciamis-atcs-simpang-pahlawan-arah-benteng` | Simpang Pahlawan Arah Benteng | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/jfBkbIf4VOZN1pqr12222132016316.m3u8` |
| 8 | `ciamis-atcs-simpang-rumah-sakit` | Simpang Rumah Sakit | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/qICgFGuVziCYmcpL29436246801255.m3u8` |
| 9 | `ciamis-atcs-simpang-pahlawan-arah-tasik` | Simpang Pahlawan Arah Tasik | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/X05ielUCi3yg0qGw11383012047454.m3u8` |
| 10 | `ciamis-atcs-simpang-tonjong-arah-tyara` | Simpang Tonjong Arah Tyara | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/XMUXif4e7LYm1dgs11233744357045.m3u8` |
| 11 | `ciamis-atcs-simpang-cirahong-arah-pahlawan` | Simpang Cirahong Arah Pahlawan | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/ZWkyJ1Y0nbyfPDX6115497951775580.m3u8` |
| 12 | `ciamis-atcs-simpang-pusaka-arah-ramona` | Simpang Pusaka Arah Ramona | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/lwIqNcCk4X9zcERz12099901714808.m3u8` |
| 13 | `ciamis-atcs-sp-lokasana` | SP. Lokasana | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/JxZImmEqsMsGIkvl11101292506546.m3u8` |
| 14 | `ciamis-atcs-simpang-lokasana-arah-alun-alun` | Simpang Lokasana Arah Alun Alun | HLS | `https://ams.ciamiskab.go.id:5443/LiveApp/streams/6iDzPLcO3yq4pBzp11977624022919.m3u8` |

### Pemalang (12)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `pemalang-atcs-alun-alun-pemalang` | Alun-Alun Pemalang | HLS | `https://stream.pemalangkab.go.id/alunalun/alunalun1.m3u8` |
| 2 | `pemalang-atcs-masjid-agung` | Masjid Agung | HLS | `https://stream.pemalangkab.go.id/masjidagung/masjid1.m3u8` |
| 3 | `pemalang-atcs-depan-pendopo-1` | Depan Pendopo 1 | HLS | `https://stream.pemalangkab.go.id/2026/depanpendopo1/depanpendopo1.m3u8` |
| 4 | `pemalang-atcs-beji-arah-timur` | Beji Arah Timur | HLS | `https://stream.pemalangkab.go.id/dishub/bejitimur/bejitimur.m3u8` |
| 5 | `pemalang-atcs-bojongbata-arah-barat` | Bojongbata Arah Barat | HLS | `https://stream.pemalangkab.go.id/dishub/bojongbarat/bojongbarat.m3u8` |
| 6 | `pemalang-atcs-bojongbata-arah-utara` | Bojongbata Arah Utara | HLS | `https://stream.pemalangkab.go.id/dishub/bojongutara/bojongutara.m3u8` |
| 7 | `pemalang-atcs-petarukan-arah-barat` | Petarukan Arah Barat | HLS | `https://stream.pemalangkab.go.id/dishub/petarukanbarat/petarukanbarat.m3u8` |
| 8 | `pemalang-atcs-petarukan-arah-timur` | Petarukan Arah Timur | HLS | `https://stream.pemalangkab.go.id/dishub/petarukantimur/petarukantimur.m3u8` |
| 9 | `pemalang-atcs-tiptop-selatan` | Tiptop Selatan | HLS | `https://stream.pemalangkab.go.id/dishub/tiptopsel/tiptopsel.m3u8` |
| 10 | `pemalang-atcs-depan-pendopo-2` | Depan Pendopo 2 | HLS | `https://stream.pemalangkab.go.id/2026/depanpendopo2/depanpendopo2.m3u8` |
| 11 | `pemalang-atcs-randudongkal` | Randudongkal | HLS | `https://stream.pemalangkab.go.id/2025/randudongkal/randudongkal.m3u8` |
| 12 | `pemalang-atcs-warungpring` | Warungpring | HLS | `https://stream.pemalangkab.go.id/2025/warungpring/warungpring.m3u8` |

## Jalan tol
### Jalan Layang MBZ Toll (44)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-mbz-km-42-000-a` | Tol Layang MBZ KM 42+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/e4dc3f81-6b28-489a-a031-795123c2ae8d/index.m3u8` |
| 2 | `bmtol-unofficial-mbz-km-33-000` | Tol Layang MBZ KM 33+000 | HLS | `https://jmlive.jasamarga.com/hls/29/6bfb6964-973c-4f25-8283-d496bdb11eb7/index.m3u8` |
| 3 | `bmtol-unofficial-mbz-km-34-000` | Tol Layang MBZ KM 34+000 | HLS | `https://jmlive.jasamarga.com/hls/29/bdb9be28-c98f-42ae-93e3-71aa0f41e10f/index.m3u8` |
| 4 | `bmtol-unofficial-mbz-km-35-000` | Tol Layang MBZ KM 35+000 | HLS | `https://jmlive.jasamarga.com/hls/29/68188ac9-95a4-4ce5-a7ce-ec91222b5adb/index.m3u8` |
| 5 | `bmtol-unofficial-mbz-km-36-000` | Tol Layang MBZ KM 36+000 | HLS | `https://jmlive.jasamarga.com/hls/29/9f1dc7e6-8632-468e-8a66-2b9fef060837/index.m3u8` |
| 6 | `bmtol-unofficial-mbz-km-37-000` | Tol Layang MBZ KM 37+000 | HLS | `https://jmlive.jasamarga.com/hls/29/caed3c05-ef43-482d-93a4-3a021a36c501/index.m3u8` |
| 7 | `bmtol-unofficial-mbz-km-38-000` | Tol Layang MBZ KM 38+000 | HLS | `https://jmlive.jasamarga.com/hls/29/4c3bf3a6-345d-490b-922c-0d9fb00b3772/index.m3u8` |
| 8 | `bmtol-unofficial-mbz-km-39-000-a` | Tol Layang MBZ KM 39+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/8878b651-edeb-47e3-9b7a-bea6c50954dc/index.m3u8` |
| 9 | `bmtol-unofficial-mbz-km-39-000-b` | Tol Layang MBZ KM 39+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/a4b6e4b2-3fde-4dbd-9137-6deffeadca91/index.m3u8` |
| 10 | `bmtol-unofficial-mbz-km-40-000-a` | Tol Layang MBZ KM 40+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/ea5dacb7-42f6-4e77-b50a-cdf79c81fa0d/index.m3u8` |
| 11 | `bmtol-unofficial-mbz-km-40-000` | Tol Layang MBZ KM 40+000 | HLS | `https://jmlive.jasamarga.com/hls/29/c175187e-1218-4036-8e03-ac12a08375a1/index.m3u8` |
| 12 | `bmtol-unofficial-mbz-km-32-000` | Tol Layang MBZ KM 32+000 | HLS | `https://jmlive.jasamarga.com/hls/29/5b5f3d84-2f51-4570-bf1f-6e81e5b37f39/index.m3u8` |
| 13 | `bmtol-unofficial-mbz-km-42-000-b` | Tol Layang MBZ KM 42+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/db3b1ce3-d702-4aee-b5b7-ebb5d4753fb7/index.m3u8` |
| 14 | `bmtol-unofficial-mbz-km-43-000-a` | Tol Layang MBZ KM 43+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/3c7c1064-dcf4-4999-9da5-8bbc06acca73/index.m3u8` |
| 15 | `bmtol-unofficial-mbz-km-43-000-b` | Tol Layang MBZ KM 43+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/52203c4b-1a27-4b75-b7dc-ea1b8910f022/index.m3u8` |
| 16 | `bmtol-unofficial-mbz-km-44-000-a` | Tol Layang MBZ KM 44+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/beb0956d-458b-4a41-baa7-6a37c05dfd3c/index.m3u8` |
| 17 | `bmtol-unofficial-mbz-km-44-000-b` | Tol Layang MBZ KM 44+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/da6bf882-ce4d-4350-9057-f91f1c931074/index.m3u8` |
| 18 | `bmtol-unofficial-mbz-km-45-000-a` | Tol Layang MBZ KM 45+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/e5e0f6ff-52fc-41ca-bd3c-c1b6c8d21512/index.m3u8` |
| 19 | `bmtol-unofficial-mbz-km-46-000-a` | Tol Layang MBZ KM 46+000 A | HLS | `https://jmlive.jasamarga.com/hls/29/57415e8c-4a8d-477f-bb28-afaae625d047/index.m3u8` |
| 20 | `bmtol-unofficial-mbz-km-46-000-b` | Tol Layang MBZ KM 46+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/cb47b8e1-7d49-4ee6-824f-9fff1368f5d5/index.m3u8` |
| 21 | `bmtol-unofficial-mbz-km-19-000` | Tol Layang MBZ KM 19+000 | HLS | `https://jmlive.jasamarga.com/hls/29/09582b8f-5bf7-4ff5-aa68-bab5e4a083ca/index.m3u8` |
| 22 | `bmtol-unofficial-mbz-km-10-500-a` | Tol Layang MBZ KM 10+500 A | HLS | `https://jmlive.jasamarga.com/hls/29/bc185db4-fe48-442f-98a5-d55858e64401/index.m3u8` |
| 23 | `bmtol-unofficial-mbz-km-11-000` | Tol Layang MBZ KM 11+000 | HLS | `https://jmlive.jasamarga.com/hls/29/6ee8afac-9c6e-4fcb-ac96-8c25ca0cba7b/index.m3u8` |
| 24 | `bmtol-unofficial-mbz-km-12-000` | Tol Layang MBZ KM 12+000 | HLS | `https://jmlive.jasamarga.com/hls/29/aad6e8dc-d793-41dd-ac3d-8bcd521e11d1/index.m3u8` |
| 25 | `bmtol-unofficial-mbz-km-13-000` | Tol Layang MBZ KM 13+000 | HLS | `https://jmlive.jasamarga.com/hls/29/e8b6262e-8789-4a27-9441-d24046bb0daf/index.m3u8` |
| 26 | `bmtol-unofficial-mbz-km-14-000` | Tol Layang MBZ KM 14+000 | HLS | `https://jmlive.jasamarga.com/hls/29/64b34f89-4478-4df7-9687-b835c0e8ec31/index.m3u8` |
| 27 | `bmtol-unofficial-mbz-km-15-000` | Tol Layang MBZ KM 15+000 | HLS | `https://jmlive.jasamarga.com/hls/29/3ad51a10-35f0-49cb-8dde-fc24c84543ff/index.m3u8` |
| 28 | `bmtol-unofficial-mbz-km-16-000` | Tol Layang MBZ KM 16+000 | HLS | `https://jmlive.jasamarga.com/hls/29/deb331d4-186e-495f-984c-ab28a03f2785/index.m3u8` |
| 29 | `bmtol-unofficial-mbz-km-17-000` | Tol Layang MBZ KM 17+000 | HLS | `https://jmlive.jasamarga.com/hls/29/9acc5b10-f562-485d-8f65-a6eac69b5a04/index.m3u8` |
| 30 | `bmtol-unofficial-mbz-km-18-000` | Tol Layang MBZ KM 18+000 | HLS | `https://jmlive.jasamarga.com/hls/29/a79bb344-3622-4636-b5c3-423d35c75525/index.m3u8` |
| 31 | `bmtol-unofficial-mbz-km-10-000-b` | Tol Layang MBZ KM 10+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/6fdb1728-1f9b-4956-a564-c23f6771f421/index.m3u8` |
| 32 | `bmtol-unofficial-mbz-km-20-000` | Tol Layang MBZ KM 20+000 | HLS | `https://jmlive.jasamarga.com/hls/29/a0104027-a561-4fea-b713-c1e19d0dedd3/index.m3u8` |
| 33 | `bmtol-unofficial-mbz-km-21-000` | Tol Layang MBZ KM 21+000 | HLS | `https://jmlive.jasamarga.com/hls/29/abd90867-5f91-4997-8d27-96b3c9db3f8b/index.m3u8` |
| 34 | `bmtol-unofficial-mbz-km-22-000` | Tol Layang MBZ KM 22+000 | HLS | `https://jmlive.jasamarga.com/hls/29/10fba6d0-bade-43a3-90f3-d8ab3aee9efd/index.m3u8` |
| 35 | `bmtol-unofficial-mbz-km-23-000` | Tol Layang MBZ KM 23+000 | HLS | `https://jmlive.jasamarga.com/hls/29/ef0a7c7b-874d-432b-af04-5e690e2eb494/index.m3u8` |
| 36 | `bmtol-unofficial-mbz-km-24-000` | Tol Layang MBZ KM 24+000 | HLS | `https://jmlive.jasamarga.com/hls/29/246b8c9f-640e-48f5-acd4-f7688b0f70c0/index.m3u8` |
| 37 | `bmtol-unofficial-mbz-km-25-000` | Tol Layang MBZ KM 25+000 | HLS | `https://jmlive.jasamarga.com/hls/29/82ac91d8-275f-49c4-bee1-a70cd80f2c4b/index.m3u8` |
| 38 | `bmtol-unofficial-mbz-km-26-000` | Tol Layang MBZ KM 26+000 | HLS | `https://jmlive.jasamarga.com/hls/29/d7950459-d861-4011-aee3-04fda298bece/index.m3u8` |
| 39 | `bmtol-unofficial-mbz-km-27-000` | Tol Layang MBZ KM 27+000 | HLS | `https://jmlive.jasamarga.com/hls/29/7a6896e9-5547-4f7d-8e27-82e170f1cc27/index.m3u8` |
| 40 | `bmtol-unofficial-mbz-km-28-000` | Tol Layang MBZ KM 28+000 | HLS | `https://jmlive.jasamarga.com/hls/29/64074598-cd37-4588-b92e-a9002cc7ab12/index.m3u8` |
| 41 | `bmtol-unofficial-mbz-km-29-000` | Tol Layang MBZ KM 29+000 | HLS | `https://jmlive.jasamarga.com/hls/29/437d57fa-e511-40b3-80f8-27b9c25fa16a/index.m3u8` |
| 42 | `bmtol-unofficial-mbz-km-30-000` | Tol Layang MBZ KM 30+000 | HLS | `https://jmlive.jasamarga.com/hls/29/4bcab77c-cde2-489f-868d-7a30f99e2809/index.m3u8` |
| 43 | `bmtol-unofficial-mbz-km-31-000` | Tol Layang MBZ KM 31+000 | HLS | `https://jmlive.jasamarga.com/hls/29/eab71fab-8cdf-4166-8422-f0caa0cb4b73/index.m3u8` |
| 44 | `bmtol-unofficial-mbz-km-41-000-b` | Tol Layang MBZ KM 41+000 B | HLS | `https://jmlive.jasamarga.com/hls/29/58f19211-3eb7-476a-870c-8e51e1e71c56/index.m3u8` |

### Jakarta-Cikampek Toll (42)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jakcik-km-01-000` | Tol Jakarta-Cikampek KM 01+000 | HLS | `https://jmlive.jasamarga.com/hls/5/58c7a709-f6ab-4c8c-a852-c928184d6afe/index.m3u8` |
| 2 | `bmtol-unofficial-jakcik-km-03-000` | Tol Jakarta-Cikampek KM 03+000 | HLS | `https://jmlive.jasamarga.com/hls/5/3623eb99-8a47-4a45-becc-a2229a6410c8/index.m3u8` |
| 3 | `bmtol-unofficial-jakcik-km-04-000` | Tol Jakarta-Cikampek KM 04+000 | HLS | `https://jmlive.jasamarga.com/hls/5/97b6e291-e34e-4c78-a9e3-e42b0f6296d9/index.m3u8` |
| 4 | `bmtol-unofficial-jakcik-km-05-000` | Tol Jakarta-Cikampek KM 05+000 | HLS | `https://jmlive.jasamarga.com/hls/5/bb990ddd-7e62-46c6-8ec0-5efd496366db/index.m3u8` |
| 5 | `bmtol-unofficial-jakcik-km-07-000` | Tol Jakarta-Cikampek KM 07+000 | HLS | `https://jmlive.jasamarga.com/hls/5/48421584-dcc1-4e1c-91ab-98caa849efac/index.m3u8` |
| 6 | `bmtol-unofficial-jakcik-km-09-000` | Tol Jakarta-Cikampek KM 09+000 | HLS | `https://jmlive.jasamarga.com/hls/5/e6c4ce57-2ccb-4f52-8689-6764ec1b884c/index.m3u8` |
| 7 | `bmtol-unofficial-jakcik-km-11-000` | Tol Jakarta-Cikampek KM 11+000 | HLS | `https://jmlive.jasamarga.com/hls/5/bc10bc06-6080-4f43-834a-65e7937e8829/index.m3u8` |
| 8 | `bmtol-unofficial-jakcik-km-12-600` | Tol Jakarta-Cikampek KM 12+600 | HLS | `https://jmlive.jasamarga.com/hls/5/398101a7-3dfe-4443-bdf1-3adcaa59e62b/index.m3u8` |
| 9 | `bmtol-unofficial-jakcik-km-14-000` | Tol Jakarta-Cikampek KM 14+000 | HLS | `https://jmlive.jasamarga.com/hls/5/6cdc8376-68bf-47b0-9a5a-6f6a144e354c/index.m3u8` |
| 10 | `bmtol-unofficial-jakcik-km-18-000` | Tol Jakarta-Cikampek KM 18+000 | HLS | `https://jmlive.jasamarga.com/hls/5/cc2713ad-f1c2-4eff-8a2c-861560127965/index.m3u8` |
| 11 | `bmtol-unofficial-jakcik-km-20-000` | Tol Jakarta-Cikampek KM 20+000 | HLS | `https://jmlive.jasamarga.com/hls/5/3db44fb6-2ec0-416e-808b-53c03e94a929/index.m3u8` |
| 12 | `bmtol-unofficial-jakcik-km-22-000` | Tol Jakarta-Cikampek KM 22+000 | HLS | `https://jmlive.jasamarga.com/hls/5/7347b5d6-a042-4aea-a1af-7b525f9aebcf/index.m3u8` |
| 13 | `bmtol-unofficial-jakcik-km-24-000` | Tol Jakarta-Cikampek KM 24+000 | HLS | `https://jmlive.jasamarga.com/hls/5/19ff9d2d-6717-4f29-8b12-34c3cf1810a2/index.m3u8` |
| 14 | `bmtol-unofficial-jakcik-km-26-000` | Tol Jakarta-Cikampek KM 26+000 | HLS | `https://jmlive.jasamarga.com/hls/5/04db5844-4897-4643-b970-9db0f8ada481/index.m3u8` |
| 15 | `bmtol-unofficial-jakcik-km-28-000` | Tol Jakarta-Cikampek KM 28+000 | HLS | `https://jmlive.jasamarga.com/hls/5/e650bbb9-c265-425e-9dac-b4cde389c047/index.m3u8` |
| 16 | `bmtol-unofficial-jakcik-km-31-000` | Tol Jakarta-Cikampek KM 31+000 | HLS | `https://jmlive.jasamarga.com/hls/5/0d80eddb-648c-437c-9a75-0e49ed63adcb/index.m3u8` |
| 17 | `bmtol-unofficial-jakcik-km-33-000` | Tol Jakarta-Cikampek KM 33+000 | HLS | `https://jmlive.jasamarga.com/hls/5/1015d634-4b0f-47c9-849f-a53379c8582a/index.m3u8` |
| 18 | `bmtol-unofficial-jakcik-km-35-000` | Tol Jakarta-Cikampek KM 35+000 | HLS | `https://jmlive.jasamarga.com/hls/5/07235ebb-ae55-4543-a692-e3a1a1153abb/index.m3u8` |
| 19 | `bmtol-unofficial-jakcik-km-37-000` | Tol Jakarta-Cikampek KM 37+000 | HLS | `https://jmlive.jasamarga.com/hls/5/d36ec03a-ae62-4f40-b71e-37d4fa39bbf2/index.m3u8` |
| 20 | `bmtol-unofficial-jakcik-km-38-000` | Tol Jakarta-Cikampek KM 38+000 | HLS | `https://jmlive.jasamarga.com/hls/5/ed4ff06c-8db3-46b8-8958-276561b3e959/index.m3u8` |
| 21 | `bmtol-unofficial-jakcik-km-40-500` | Tol Jakarta-Cikampek KM 40+500 | HLS | `https://jmlive.jasamarga.com/hls/5/4df1646e-26fb-479a-b0e6-82464342d504/index.m3u8` |
| 22 | `bmtol-unofficial-jakcik-km-42-000` | Tol Jakarta-Cikampek KM 42+000 | HLS | `https://jmlive.jasamarga.com/hls/5/cd941958-ba8c-4ba7-8594-26a1de2ef357/index.m3u8` |
| 23 | `bmtol-unofficial-jakcik-km-44-000` | Tol Jakarta-Cikampek KM 44+000 | HLS | `https://jmlive.jasamarga.com/hls/5/33218917-8784-4ae4-b7ca-357b2bf90bde/index.m3u8` |
| 24 | `bmtol-unofficial-jakcik-km-47-200` | Tol Jakarta-Cikampek KM 47+200 | HLS | `https://jmlive.jasamarga.com/hls/5/e728a2e2-6f79-41ae-8849-138b7e2f8e17/index.m3u8` |
| 25 | `bmtol-unofficial-jakcik-km-49-000` | Tol Jakarta-Cikampek KM 49+000 | HLS | `https://jmlive.jasamarga.com/hls/5/7b4f7e55-2318-40a4-b130-1b4803b86dfb/index.m3u8` |
| 26 | `bmtol-unofficial-jakcik-km-49-000-a` | Tol Jakarta-Cikampek KM 49+000 | HLS | `https://jmlive.jasamarga.com/hls/5/b2f05fed-2b69-44ec-957b-16e0f9107530/index.m3u8` |
| 27 | `bmtol-unofficial-jakcik-km-51-000` | Tol Jakarta-Cikampek KM 51+000 | HLS | `https://jmlive.jasamarga.com/hls/5/2318be12-171d-4476-be86-62ee8897dfac/index.m3u8` |
| 28 | `bmtol-unofficial-jakcik-km-53-000` | Tol Jakarta-Cikampek KM 53+000 | HLS | `https://jmlive.jasamarga.com/hls/5/d0032ad8-f8e2-4e38-9879-6dfbacbdb36f/index.m3u8` |
| 29 | `bmtol-unofficial-jakcik-km-54-300` | Tol Jakarta-Cikampek KM 54+300 | HLS | `https://jmlive.jasamarga.com/hls/5/ac57d19d-628d-4724-95dd-b09f7dbe3082/index.m3u8` |
| 30 | `bmtol-unofficial-jakcik-km-56-000` | Tol Jakarta-Cikampek KM 56+000 | HLS | `https://jmlive.jasamarga.com/hls/5/8cff9322-7e82-452b-9698-12291e074f2c/index.m3u8` |
| 31 | `bmtol-unofficial-jakcik-km-58-000` | Tol Jakarta-Cikampek KM 58+000 | HLS | `https://jmlive.jasamarga.com/hls/5/ae3db306-6665-4d85-b77a-c546fed6548c/index.m3u8` |
| 32 | `bmtol-unofficial-jakcik-km-60-000` | Tol Jakarta-Cikampek KM 60+000 | HLS | `https://jmlive.jasamarga.com/hls/5/f05d0fe4-773d-4ced-9225-c4d90106cfdf/index.m3u8` |
| 33 | `bmtol-unofficial-jakcik-km-62-000` | Tol Jakarta-Cikampek KM 62+000 | HLS | `https://jmlive.jasamarga.com/hls/5/e9e934be-bfa8-4003-b00b-c5bbaf746f5a/index.m3u8` |
| 34 | `bmtol-unofficial-jakcik-km-64-000` | Tol Jakarta-Cikampek KM 64+000 | HLS | `https://jmlive.jasamarga.com/hls/5/32d56cad-bc7c-4152-83eb-74200874aee7/index.m3u8` |
| 35 | `bmtol-unofficial-jakcik-km-66-000` | Tol Jakarta-Cikampek KM 66+000 | HLS | `https://jmlive.jasamarga.com/hls/5/81d3de23-f5a3-4811-a240-7009dca76bf8/index.m3u8` |
| 36 | `bmtol-unofficial-jakcik-km-68-000` | Tol Jakarta-Cikampek KM 68+000 | HLS | `https://jmlive.jasamarga.com/hls/5/9b2656be-610c-43aa-b4a0-9dd10712748a/index.m3u8` |
| 37 | `bmtol-unofficial-jakcik-km-69-000` | Tol Jakarta-Cikampek KM 69+000 | HLS | `https://jmlive.jasamarga.com/hls/5/94ed3962-8f97-468d-ad69-89a2a206da51/index.m3u8` |
| 38 | `bmtol-unofficial-jakcik-km-71-000` | Tol Jakarta-Cikampek KM 71+000 | HLS | `https://jmlive.jasamarga.com/hls/5/3208697b-3fc1-4501-bf4d-990e7b648f63/index.m3u8` |
| 39 | `bmtol-unofficial-jakcik-km-35-000-a` | Tol Jakarta-Cikampek KM 35+000 | HLS | `https://jmlive.jasamarga.com/hls/5/6111c86f-3847-4448-9a19-e27a2ee286b5/index.m3u8` |
| 40 | `bmtol-unofficial-jakcik-km-67-200` | Tol Jakarta-Cikampek KM 67+200 | HLS | `https://jmlive.jasamarga.com/hls/5/9ccb1d9c-2c9a-42e4-8ccb-ee2fb7d458ed/index.m3u8` |
| 41 | `bmtol-unofficial-jakcik-km-67-000` | Tol Jakarta-Cikampek KM 67+000 | HLS | `https://jmlive.jasamarga.com/hls/5/1157ec6c-123d-429f-9d97-6a17bd139cce/index.m3u8` |
| 42 | `bmtol-unofficial-jakcik-km-62-200` | Tol Jakarta-Cikampek KM 62+200 | HLS | `https://jmlive.jasamarga.com/hls/5/19a8a25c-d1ea-4d31-adca-30b0c8254941/index.m3u8` |

### Serpong-Balaraja Toll (41)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-sebal-km-19-600-a` | Tol Serpong-Balaraja KM 19+600 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10561.m3u8` |
| 2 | `bmtol-unofficial-sebal-km-14-700-b` | Tol Serpong-Balaraja KM 14+700 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10010.m3u8` |
| 3 | `bmtol-unofficial-sebal-km-15-200-a` | Tol Serpong-Balaraja KM 15+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10011.m3u8` |
| 4 | `bmtol-unofficial-sebal-km-15-200-b` | Tol Serpong-Balaraja KM 15+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10012.m3u8` |
| 5 | `bmtol-unofficial-sebal-km-15-650-a` | Tol Serpong-Balaraja KM 15+650 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10013.m3u8` |
| 6 | `bmtol-unofficial-sebal-km-15-650-b` | Tol Serpong-Balaraja KM 15+650 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10014.m3u8` |
| 7 | `bmtol-unofficial-sebal-km-16-100-a` | Tol Serpong-Balaraja KM 16+100 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10015.m3u8` |
| 8 | `bmtol-unofficial-sebal-km-16-100-b` | Tol Serpong-Balaraja KM 16+100 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10016.m3u8` |
| 9 | `bmtol-unofficial-sebal-km-16-650-a` | Tol Serpong-Balaraja KM 16+650 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10017.m3u8` |
| 10 | `bmtol-unofficial-sebal-km-16-650-b` | Tol Serpong-Balaraja KM 16+650 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10018.m3u8` |
| 11 | `bmtol-unofficial-sebal-km-17-150-a` | Tol Serpong-Balaraja KM 17+150 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10551.m3u8` |
| 12 | `bmtol-unofficial-sebal-km-18-150-a` | Tol Serpong-Balaraja KM 18+150 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10555.m3u8` |
| 13 | `bmtol-unofficial-sebal-km-18-150-b` | Tol Serpong-Balaraja KM 18+150 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10556.m3u8` |
| 14 | `bmtol-unofficial-sebal-km-19-200-b` | Tol Serpong-Balaraja KM 19+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10560.m3u8` |
| 15 | `bmtol-unofficial-sebal-km-19-600-b` | Tol Serpong-Balaraja KM 19+600 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10562.m3u8` |
| 16 | `bmtol-unofficial-sebal-km-17-150-b` | Tol Serpong-Balaraja KM 17+150 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10552.m3u8` |
| 17 | `bmtol-unofficial-sebal-km-17-700-a` | Tol Serpong-Balaraja KM 17+700 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10553.m3u8` |
| 18 | `bmtol-unofficial-sebal-km-17-700-b` | Tol Serpong-Balaraja KM 17+700 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10554.m3u8` |
| 19 | `bmtol-unofficial-sebal-km-18-700-a` | Tol Serpong-Balaraja KM 18+700 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10557.m3u8` |
| 20 | `bmtol-unofficial-sebal-km-18-700-b` | Tol Serpong-Balaraja KM 18+700 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10558.m3u8` |
| 21 | `bmtol-unofficial-sebal-km-21-650-b` | Tol Serpong-Balaraja KM 21+650 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10570.m3u8` |
| 22 | `bmtol-unofficial-sebal-km-20-200-b` | Tol Serpong-Balaraja KM 20+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10564.m3u8` |
| 23 | `bmtol-unofficial-sebal-km-20-700-a` | Tol Serpong-Balaraja KM 20+700 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10565.m3u8` |
| 24 | `bmtol-unofficial-sebal-km-20-700-b` | Tol Serpong-Balaraja KM 20+700 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10566.m3u8` |
| 25 | `bmtol-unofficial-sebal-km-22-150-a` | Tol Serpong-Balaraja KM 22+150 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10571.m3u8` |
| 26 | `bmtol-unofficial-sebal-km-12-750-a` | Tol Serpong-Balaraja KM 12+750 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10019.m3u8` |
| 27 | `bmtol-unofficial-sebal-km-21-200-a` | Tol Serpong-Balaraja KM 21+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10567.m3u8` |
| 28 | `bmtol-unofficial-sebal-km-21-200-b` | Tol Serpong-Balaraja KM 21+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10568.m3u8` |
| 29 | `bmtol-unofficial-sebal-km-21-650-a` | Tol Serpong-Balaraja KM 21+650 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10569.m3u8` |
| 30 | `bmtol-unofficial-sebal-km-22-150-b` | Tol Serpong-Balaraja KM 22+150 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10572.m3u8` |
| 31 | `bmtol-unofficial-sebal-km-20-200-a` | Tol Serpong-Balaraja KM 20+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10563.m3u8` |
| 32 | `bmtol-unofficial-sebal-km-12-900-a` | Tol Serpong-Balaraja KM 12+900 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10002.m3u8` |
| 33 | `bmtol-unofficial-sebal-km-12-900-b` | Tol Serpong-Balaraja KM 12+900 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10001.m3u8` |
| 34 | `bmtol-unofficial-sebal-km-13-200-a` | Tol Serpong-Balaraja KM 13+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10003.m3u8` |
| 35 | `bmtol-unofficial-sebal-km-13-200-b` | Tol Serpong-Balaraja KM 13+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10004.m3u8` |
| 36 | `bmtol-unofficial-sebal-km-13-700-a` | Tol Serpong-Balaraja KM 13+700 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10005.m3u8` |
| 37 | `bmtol-unofficial-sebal-km-13-700-b` | Tol Serpong-Balaraja KM 13+700 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10006.m3u8` |
| 38 | `bmtol-unofficial-sebal-km-14-200-a` | Tol Serpong-Balaraja KM 14+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10007.m3u8` |
| 39 | `bmtol-unofficial-sebal-km-14-200-b` | Tol Serpong-Balaraja KM 14+200 B | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10008.m3u8` |
| 40 | `bmtol-unofficial-sebal-km-14-700-a` | Tol Serpong-Balaraja KM 14+700 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10009.m3u8` |
| 41 | `bmtol-unofficial-sebal-km-19-200-a` | Tol Serpong-Balaraja KM 19+200 A | HLS | `https://info.serbaraja-tollroad.co.id:20443/LiveApp/streams/10559.m3u8` |

### JORR East Toll (23)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jorre-km-52-000` | Tol JORR E KM 52+000 | HLS | `https://jmlive.jasamarga.com/hls/8/f90de884-e31c-42d9-adf6-965451207668/index.m3u8` |
| 2 | `bmtol-unofficial-jorre-km-45-700` | Tol JORR E KM 45+700 | HLS | `https://jmlive.jasamarga.com/hls/8/fc3387f8-0bb7-4168-bd7f-7519f2f16d5f/index.m3u8` |
| 3 | `bmtol-unofficial-jorre-km-46-500` | Tol JORR E KM 46+500 | HLS | `https://jmlive.jasamarga.com/hls/8/c655dddb-b16c-459e-812a-9c357a273379/index.m3u8` |
| 4 | `bmtol-unofficial-jorre-km-47-200` | Tol JORR E KM 47+200 | HLS | `https://jmlive.jasamarga.com/hls/8/544c3b27-0648-401e-8456-9f8d87a8655f/index.m3u8` |
| 5 | `bmtol-unofficial-jorre-km-48-000` | Tol JORR E KM 48+000 | HLS | `https://jmlive.jasamarga.com/hls/8/44cf99ab-1e2b-4be2-97ae-9999e500dda4/index.m3u8` |
| 6 | `bmtol-unofficial-jorre-km-49-000` | Tol JORR E KM 49+000 | HLS | `https://jmlive.jasamarga.com/hls/8/24774a64-738b-4aa7-801f-1ea3aa0caf5a/index.m3u8` |
| 7 | `bmtol-unofficial-jorre-km-51-000` | Tol JORR E KM 51+000 | HLS | `https://jmlive.jasamarga.com/hls/8/eb920b97-142b-4bf0-bec7-950c4ae98a44/index.m3u8` |
| 8 | `bmtol-unofficial-jorre-km-53-000` | Tol JORR E KM 53+000 | HLS | `https://jmlive.jasamarga.com/hls/8/bba4ac61-a90c-4fca-a93a-809a0a53239e/index.m3u8` |
| 9 | `bmtol-unofficial-jorre-km-54-000` | Tol JORR E KM 54+000 | HLS | `https://jmlive.jasamarga.com/hls/8/69057fbf-d148-4cfc-a34f-bcfeaf4f7cfd/index.m3u8` |
| 10 | `bmtol-unofficial-jorre-km-55-500` | Tol JORR E KM 55+500 | HLS | `https://jmlive.jasamarga.com/hls/8/467ef34f-ff6b-43a2-921b-5166d9712e01/index.m3u8` |
| 11 | `bmtol-unofficial-jorre-km-56-500` | Tol JORR E KM 56+500 | HLS | `https://jmlive.jasamarga.com/hls/8/4662ef19-54ed-4fc2-b67c-e2583e2f35f7/index.m3u8` |
| 12 | `bmtol-unofficial-jorre-km-57-000` | Tol JORR E KM 57+000 | HLS | `https://jmlive.jasamarga.com/hls/8/01c138ea-4185-4a5f-bb80-4bc39895c2fd/index.m3u8` |
| 13 | `bmtol-unofficial-jorre-km-40-000` | Tol JORR E KM 40+000 | HLS | `https://jmlive.jasamarga.com/hls/8/7fd9e608-ac07-482b-8953-d813928f6acc/index.m3u8` |
| 14 | `bmtol-unofficial-jorre-km-35-600` | Tol JORR E KM 35+600 | HLS | `https://jmlive.jasamarga.com/hls/8/022b96e6-8311-4754-9ecd-09577276c12b/index.m3u8` |
| 15 | `bmtol-unofficial-jorre-km-36-000` | Tol JORR E KM 36+000 | HLS | `https://jmlive.jasamarga.com/hls/8/7ffb440a-90f6-4482-8613-118483251385/index.m3u8` |
| 16 | `bmtol-unofficial-jorre-km-37-000` | Tol JORR E KM 37+000 | HLS | `https://jmlive.jasamarga.com/hls/8/4d0d8ed3-d5d4-45d5-b49c-fba4bfcd8ae0/index.m3u8` |
| 17 | `bmtol-unofficial-jorre-km-38-000` | Tol JORR E KM 38+000 | HLS | `https://jmlive.jasamarga.com/hls/8/1505206c-e929-4426-889b-07a33fb6fdb5/index.m3u8` |
| 18 | `bmtol-unofficial-jorre-km-39-400` | Tol JORR E KM 39+400 | HLS | `https://jmlive.jasamarga.com/hls/8/1de2886a-e5d6-40c8-a0db-099758bb86a7/index.m3u8` |
| 19 | `bmtol-unofficial-jorre-km-34-800` | Tol JORR E KM 34+800 | HLS | `https://jmlive.jasamarga.com/hls/8/6298dc0e-7be2-43d5-b5a7-cecf857e7bff/index.m3u8` |
| 20 | `bmtol-unofficial-jorre-km-41-000` | Tol JORR E KM 41+000 | HLS | `https://jmlive.jasamarga.com/hls/8/9e3c6be7-dcf4-4eb6-8ef6-8d068f37fcc9/index.m3u8` |
| 21 | `bmtol-unofficial-jorre-km-42-000` | Tol JORR E KM 42+000 | HLS | `https://jmlive.jasamarga.com/hls/8/80c7a2e6-63eb-4c6e-8c69-9b941bd27ae3/index.m3u8` |
| 22 | `bmtol-unofficial-jorre-km-43-000` | Tol JORR E KM 43+000 | HLS | `https://jmlive.jasamarga.com/hls/8/c4618238-4a08-4e80-b590-5dcc08769ddc/index.m3u8` |
| 23 | `bmtol-unofficial-jorre-km-44-050` | Tol JORR E KM 44+050 | HLS | `https://jmlive.jasamarga.com/hls/8/560141ea-4b3d-4a58-bb39-cf561c49c601/index.m3u8` |

### Jagorawi Toll (22)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jagorawi-km-16-400` | Tol Jagorawi KM 16+400 | HLS | `https://jmlive.jasamarga.com/hls/1/a3ae3ad0-ec86-437d-962e-172324c74c79/index.m3u8` |
| 2 | `bmtol-unofficial-jagorawi-km-15-500-b` | Tol Jagorawi KM 15+500 B | HLS | `https://jmlive.jasamarga.com/hls/1/e1b6f36c-fae0-43e6-a825-b6e9f02133b1/index.m3u8` |
| 3 | `bmtol-unofficial-jagorawi-km-45-000-b` | Tol Jagorawi KM 45+000 B | HLS | `https://jmlive.jasamarga.com/hls/1/84215fbd-237f-492d-9b05-e4b43a549ff0/index.m3u8` |
| 4 | `bmtol-unofficial-jagorawi-km-38-400-b` | Tol Jagorawi KM 38+400 B | HLS | `https://jmlive.jasamarga.com/hls/1/78221d4b-2640-421e-bb82-e4b4f8f5b388/index.m3u8` |
| 5 | `bmtol-unofficial-jagorawi-km-30-400-b` | Tol Jagorawi KM 30+400 B | HLS | `https://jmlive.jasamarga.com/hls/1/ecef5679-dbc8-4c70-918e-413bb03c732e/index.m3u8` |
| 6 | `bmtol-unofficial-jagorawi-km-24-000-b` | Tol Jagorawi KM 24+000 B SS GUNUNG PUTRI | HLS | `https://jmlive.jasamarga.com/hls/1/d1a5c662-9633-4b23-9b65-33dbe1398c07/index.m3u8` |
| 7 | `bmtol-unofficial-jagorawi-km-19-600-b` | Tol Jagorawi KM 19+600 B | HLS | `https://jmlive.jasamarga.com/hls/1/935915ad-8114-440f-b71d-7620154a8aae/index.m3u8` |
| 8 | `bmtol-unofficial-jagorawi-km-17-500` | Tol Jagorawi KM 17+500 | HLS | `https://jmlive.jasamarga.com/hls/1/6d05d39f-b218-45c3-a054-83688434a044/index.m3u8` |
| 9 | `bmtol-unofficial-jagorawi-km-16-400-a` | Tol Jagorawi KM 16+400 JPO RAFLES HILLS | HLS | `https://jmlive.jasamarga.com/hls/1/e9c809cf-18d7-4607-9b1d-7cf2441d2d76/index.m3u8` |
| 10 | `bmtol-unofficial-jagorawi-km-04-500-b` | Tol Jagorawi KM 04+500 B | HLS | `https://jmlive.jasamarga.com/hls/1/aea1519e-fca9-458e-9532-cacee299e254/index.m3u8` |
| 11 | `bmtol-unofficial-jagorawi-km-15-000-a` | Tol Jagorawi KM 15+000 A | HLS | `https://jmlive.jasamarga.com/hls/1/a99de891-942a-4713-bb21-4a444b7d6e23/index.m3u8` |
| 12 | `bmtol-unofficial-jagorawi-km-14-500-b` | Tol Jagorawi KM 14+500 B | HLS | `https://jmlive.jasamarga.com/hls/1/039ce4e8-53b4-409c-8775-c641a551ba9c/index.m3u8` |
| 13 | `bmtol-unofficial-jagorawi-km-14-000` | Tol Jagorawi KM 14+000 TUNNEL CBBR EXIT | HLS | `https://jmlive.jasamarga.com/hls/1/1e915323-43bc-4f1b-a52a-3ad8b790ab95/index.m3u8` |
| 14 | `bmtol-unofficial-jagorawi-km-13-150-b` | Tol Jagorawi KM 13+150 B | HLS | `https://jmlive.jasamarga.com/hls/1/9c500ea8-3877-4373-96e6-287709c02bc4/index.m3u8` |
| 15 | `bmtol-unofficial-jagorawi-km-12-150` | Tol Jagorawi KM 12+150 | HLS | `https://jmlive.jasamarga.com/hls/1/d43a5e70-36ec-40a9-8e3a-ecbd74c9d327/index.m3u8` |
| 16 | `bmtol-unofficial-jagorawi-km-10-350-b` | Tol Jagorawi KM 10+350 B | HLS | `https://jmlive.jasamarga.com/hls/1/4df98c34-fcd8-408d-b213-986811c03a28/index.m3u8` |
| 17 | `bmtol-unofficial-jagorawi-km-09-200-b` | Tol Jagorawi KM 09+200 B | HLS | `https://jmlive.jasamarga.com/hls/1/420a58db-194a-42ac-bd66-85da2343cdd5/index.m3u8` |
| 18 | `bmtol-unofficial-jagorawi-km-08-000-b` | Tol Jagorawi KM 08+000 B | HLS | `https://jmlive.jasamarga.com/hls/1/a55e3fe6-6523-45bc-bd48-06ba5091cbd3/index.m3u8` |
| 19 | `bmtol-unofficial-jagorawi-km-07-000-b` | Tol Jagorawi KM 07+000 B | HLS | `https://jmlive.jasamarga.com/hls/1/553dd48f-f888-4ccf-a56d-4290434d2d12/index.m3u8` |
| 20 | `bmtol-unofficial-jagorawi-km-06-000` | Tol Jagorawi KM 06+000 | HLS | `https://jmlive.jasamarga.com/hls/1/d8e25ab3-732d-45ff-be3f-254647cedfcd/index.m3u8` |
| 21 | `bmtol-unofficial-jagorawi-km-05-500-b` | Tol Jagorawi KM 05+500 B | HLS | `https://jmlive.jasamarga.com/hls/1/74846941-f5c5-4814-9160-f8b050677ad5/index.m3u8` |
| 22 | `bmtol-unofficial-jagorawi-km-05-000-b` | Tol Jagorawi KM 05+000 B | HLS | `https://jmlive.jasamarga.com/hls/1/4a616d6d-fe13-4416-8f1d-965abd1eefaa/index.m3u8` |

### JORR South Toll (22)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jorrs-km-33-400` | Tol JORR S KM 33+400 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/805476032194386565347579.m3u8` |
| 2 | `bmtol-unofficial-jorrs-km-27-250` | Tol JORR S KM 27+250 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/965292045493317236595034.m3u8` |
| 3 | `bmtol-unofficial-jorrs-km-27-800` | Tol JORR S KM 27+800 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/768053906099639875515809.m3u8` |
| 4 | `bmtol-unofficial-jorrs-km-28-000` | Tol JORR S KM 28+000 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/039381128256008706551669.m3u8` |
| 5 | `bmtol-unofficial-jorrs-km-28-350` | Tol JORR S KM 28+350 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/090097396103176470086786.m3u8` |
| 6 | `bmtol-unofficial-jorrs-km-29-000` | Tol JORR S KM 29+000 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/199446466305883459721900.m3u8` |
| 7 | `bmtol-unofficial-jorrs-km-29-650` | Tol JORR S KM 29+650 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/548853102262453987779962.m3u8` |
| 8 | `bmtol-unofficial-jorrs-km-30-300` | Tol JORR S KM 30+300 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/309430648597231213602103.m3u8` |
| 9 | `bmtol-unofficial-jorrs-km-31-300` | Tol JORR S KM 31+300 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/146024230666959414726933.m3u8` |
| 10 | `bmtol-unofficial-jorrs-km-31-650` | Tol JORR S KM 31+650 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/452218312235468702302329.m3u8` |
| 11 | `bmtol-unofficial-jorrs-km-32-750` | Tol JORR S KM 32+750 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/854107383579084611495985.m3u8` |
| 12 | `bmtol-unofficial-jorrs-km-26-450` | Tol JORR S KM 26+450 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/178201133461271928605115.m3u8` |
| 13 | `bmtol-unofficial-jorrs-km-22-400` | Tol JORR S KM 22+400 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/269363542266933731794240.m3u8` |
| 14 | `bmtol-unofficial-jorrs-km-23-000` | Tol JORR S KM 23+000 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/121810470572829194057319.m3u8` |
| 15 | `bmtol-unofficial-jorrs-km-23-200` | Tol JORR S KM 23+200 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/271820726275436138198288.m3u8` |
| 16 | `bmtol-unofficial-jorrs-km-23-600` | Tol JORR S KM 23+600 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/101502919369166746058073.m3u8` |
| 17 | `bmtol-unofficial-jorrs-km-24-000` | Tol JORR S KM 24+000 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/222888349210580537521273.m3u8` |
| 18 | `bmtol-unofficial-jorrs-km-24-450` | Tol JORR S KM 24+450 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/529068807902101265499497.m3u8` |
| 19 | `bmtol-unofficial-jorrs-km-24-900` | Tol JORR S KM 24+900 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/179954112963766001683574.m3u8` |
| 20 | `bmtol-unofficial-jorrs-km-25-200` | Tol JORR S KM 25+200 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/393537034871811406318656.m3u8` |
| 21 | `bmtol-unofficial-jorrs-km-25-950` | Tol JORR S KM 25+950 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/108824399705771324185498.m3u8` |
| 22 | `bmtol-unofficial-jorrs-km-30-900` | Tol JORR S KM 30+900 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/746991492646583252398044.m3u8` |

### Pekanbaru-Dumai Toll (32)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-permai-km-46-250-a` | Tol Permai KM 46+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/aNjzYDUkLs8o1670835771085.m3u8` |
| 2 | `bmtol-unofficial-permai-km-52-250-a` | Tol Permai KM 52+250 A | HLS | `https://pub.hk-opt.com/LiveApp/streams/QRI64LUFreqs1670836280697.m3u8` |
| 3 | `bmtol-unofficial-permai-km-51-250-b` | Tol Permai KM 51+250 B | HLS | `https://pub.hk-opt.com/LiveApp/streams/UEHUg7lmKmDY1670836235192.m3u8` |
| 4 | `bmtol-unofficial-permai-km-46-250-b` | Tol Permai KM 46+250 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/NZLbZnBM9XiG1670835812195.m3u8` |
| 5 | `bmtol-unofficial-permai-km-44-250-a` | Tol Permai KM 44+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/9KMc6zuozDu41670835654780.m3u8` |
| 6 | `bmtol-unofficial-permai-km-40-250-a` | Tol Permai KM 40+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/zzEKMWCmYHHA1670835307608.m3u8` |
| 7 | `bmtol-unofficial-permai-km-35-250-b` | Tol Permai KM 35+250 B | HLS | `https://pub.hk-opt.com/LiveApp/streams/rVvBSUpN1bvk1670834995793.m3u8` |
| 8 | `bmtol-unofficial-permai-km-35-250-a` | Tol Permai KM 35+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/MbYUuwRLhYOK1670834953549.m3u8` |
| 9 | `bmtol-unofficial-permai-km-34-250-b` | Tol Permai KM 34+250 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/ozCufn6ImLBS1670834930490.m3u8` |
| 10 | `bmtol-unofficial-permai-km-34-250-a` | Tol Permai KM 34+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/xddxJxBtPtOf1670834906284.m3u8` |
| 11 | `bmtol-unofficial-permai-km-93-550-a` | Tol Permai KM 93+550 A | HLS | `https://pub.hk-opt.com/LiveApp/streams/D2Roqn9GzdRL1670898182118.m3u8` |
| 12 | `bmtol-unofficial-permai-km-91-550-a` | Tol Permai KM 91+550 A | HLS | `https://pub.hk-opt.com/LiveApp/streams/15Z9ZfaY59S21670898104290.m3u8` |
| 13 | `bmtol-unofficial-permai-km-79-550-b` | Tol Permai KM 79+550 B | HLS | `https://pub.hk-opt.com/LiveApp/streams/qpoeweO40UBH1670897533910.m3u8` |
| 14 | `bmtol-unofficial-permai-km-79-550-a` | Tol Permai KM 79+550 A | HLS | `https://pub.hk-opt.com/LiveApp/streams/jGoOjXR5xE0e1670897513860.m3u8` |
| 15 | `bmtol-unofficial-permai-km-78-550-b` | Tol Permai KM 78+550 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/ZsjTqOYij7wt1670897493293.m3u8` |
| 16 | `bmtol-unofficial-permai-km-12-000-b` | Tol Permai KM 12+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/sNS9p9N9IiMT1670833435768.m3u8` |
| 17 | `bmtol-unofficial-permai-km-12-000-a` | Tol Permai KM 12+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/t0Lf5NgHhYdG1670833409475.m3u8` |
| 18 | `bmtol-unofficial-permai-km-05-700-b` | Tol Permai KM 05+700 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/jMBfWL7lpW2Y1670832877655.m3u8` |
| 19 | `bmtol-unofficial-permai-km-05-700-a` | Tol Permai KM 05+700 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/sJ5f4j2wtqbj1670832840524.m3u8` |
| 20 | `bmtol-unofficial-permai-km-03-700-b` | Tol Permai KM 03+700 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/wtw6QowrpjBX1670832746764.m3u8` |
| 21 | `bmtol-unofficial-permai-km-03-700-a` | Tol Permai KM 03+700 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/WYTBXIGoLM291670832698992.m3u8` |
| 22 | `bmtol-unofficial-permai-km-39-250-b` | Tol Permai KM 39+250 B | HLS | `https://pub.hk-opt.com/LiveApp/streams/t5dszqUYGvdG1670835279770.m3u8` |
| 23 | `bmtol-unofficial-permai-km-80-550-a` | Tol Permai KM 80+550 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/W1A1p1ZGbijJ1670897554898.m3u8` |
| 24 | `bmtol-unofficial-permai-km-84-550-a` | Tol Permai KM 84+550 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/eFiQa6pMB60C1670897724776.m3u8` |
| 25 | `bmtol-unofficial-permai-km-29-250-a` | Tol Permai KM 29+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/tv5Pb1Xg2ean1670834642624.m3u8` |
| 26 | `bmtol-unofficial-permai-km-28-250-b` | Tol Permai KM 28+250 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Y3giufTuiL7d1670834617664.m3u8` |
| 27 | `bmtol-unofficial-permai-km-24-250-b` | Tol Permai KM 24+250 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/sIwUYq39JIp61670834427572.m3u8` |
| 28 | `bmtol-unofficial-permai-km-24-250-a` | Tol Permai KM 24+250 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/HcX8FdPz7pOj1670834359676.m3u8` |
| 29 | `bmtol-unofficial-permai-km-22-250-b` | Tol Permai KM 22+250 B | HLS | `https://pub.hk-opt.com/LiveApp/streams/dkJZ84uKB8qH1670834144768.m3u8` |
| 30 | `bmtol-unofficial-permai-km-17-000-b` | Tol Permai KM 17+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/YcSXkPpcjzGQ1670833824301.m3u8` |
| 31 | `bmtol-unofficial-permai-km-13-000-b` | Tol Permai KM 13+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/P7N1699iiwNs1670833490795.m3u8` |
| 32 | `bmtol-unofficial-permai-km-13-000-a` | Tol Permai KM 13+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/dr7j5geewHrX1670833463482.m3u8` |

### Akses Tanjung Priok Toll (20)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-atp-km-63-000-b` | Tol Akses Tanjung Priok KM 63+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/131194518355658410125310.m3u8` |
| 2 | `bmtol-unofficial-atp-km-60-000-a` | Tol Akses Tanjung Priok KM 60+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/062223762734246730973930.m3u8` |
| 3 | `bmtol-unofficial-atp-km-67-200-b` | Tol Akses Tanjung Priok KM 67+200 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/356285838211375724458124.m3u8` |
| 4 | `bmtol-unofficial-atp-km-66-500-a` | Tol Akses Tanjung Priok KM 66+500 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/613685260667025565685154.m3u8` |
| 5 | `bmtol-unofficial-atp-km-66-400` | Tol Akses Tanjung Priok KM 66+400 | HLS | `https://pub2.hk-opt.com/LiveApp/streams/056605534596645381685649.m3u8` |
| 6 | `bmtol-unofficial-atp-km-65-800-a` | Tol Akses Tanjung Priok KM 65+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/282683392556897946274334.m3u8` |
| 7 | `bmtol-unofficial-atp-km-65-000-b` | Tol Akses Tanjung Priok KM 65+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/732329756425808171838308.m3u8` |
| 8 | `bmtol-unofficial-atp-km-64-100-b` | Tol Akses Tanjung Priok KM 64+100 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/395196439889823078971618.m3u8` |
| 9 | `bmtol-unofficial-atp-km-64-100-a` | Tol Akses Tanjung Priok KM 64+100 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/884788511122999510332002.m3u8` |
| 10 | `bmtol-unofficial-atp-km-62-450-b` | Tol Akses Tanjung Priok KM 62+450 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/929965054608082862392361.m3u8` |
| 11 | `bmtol-unofficial-atp-km-62-450-a` | Tol Akses Tanjung Priok KM 62+450 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/341140856007945232503242.m3u8` |
| 12 | `bmtol-unofficial-atp-km-61-400-b` | Tol Akses Tanjung Priok KM 61+400 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/241370079371388169899174.m3u8` |
| 13 | `bmtol-unofficial-atp-km-60-800-b` | Tol Akses Tanjung Priok KM 60+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/936875605865456745186345.m3u8` |
| 14 | `bmtol-unofficial-atp-km-60-800-a` | Tol Akses Tanjung Priok KM 60+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/215099945954037183566898.m3u8` |
| 15 | `bmtol-unofficial-atp-km-60-000-b` | Tol Akses Tanjung Priok KM 60+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/381024135984437558197100.m3u8` |
| 16 | `bmtol-unofficial-atp-km-59-400-b` | Tol Akses Tanjung Priok KM 59+400 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/742155705555120746594962.m3u8` |
| 17 | `bmtol-unofficial-atp-km-59-400-a` | Tol Akses Tanjung Priok KM 59+400 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/675323017321643087627650.m3u8` |
| 18 | `bmtol-unofficial-atp-km-59-000-b` | Tol Akses Tanjung Priok KM 59+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/956464037412277558025165.m3u8` |
| 19 | `bmtol-unofficial-atp-km-59-000-a` | Tol Akses Tanjung Priok KM 59+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/095660838019901274554950.m3u8` |
| 20 | `bmtol-unofficial-atp-km-58-400-b` | Tol Akses Tanjung Priok KM 58+400 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/501264524429471982550467.m3u8` |

### Dalam Kota Toll (20)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jtc-km-10-600` | Tol Dalam Kota KM 10+600 | HLS | `https://jmlive.jasamarga.com/hls/2/d221aebb-a7b8-4c41-ae3a-93690b881277/index.m3u8` |
| 2 | `bmtol-unofficial-jtc-km-19-000` | Tol Dalam Kota KM 19+000 | HLS | `https://jmlive.jasamarga.com/hls/2/7a3c0a4c-0ea4-4ad0-be1c-e7cf6d80468f/index.m3u8` |
| 3 | `bmtol-unofficial-jtc-km-18-200` | Tol Dalam Kota KM 18+200 | HLS | `https://jmlive.jasamarga.com/hls/2/a2257b9d-2032-4a40-83fc-9390f7eb11fd/index.m3u8` |
| 4 | `bmtol-unofficial-jtc-km-17-000` | Tol Dalam Kota KM 17+000 | HLS | `https://jmlive.jasamarga.com/hls/2/f6e02fa2-c960-4122-b64c-5743cd008fcc/index.m3u8` |
| 5 | `bmtol-unofficial-jtc-km-16-100` | Tol Dalam Kota KM 16+100 | HLS | `https://jmlive.jasamarga.com/hls/2/0ac49ad7-095f-425d-8a7c-936e62e2ad95/index.m3u8` |
| 6 | `bmtol-unofficial-jtc-km-14-000` | Tol Dalam Kota KM 14+000 | HLS | `https://jmlive.jasamarga.com/hls/2/703f4d93-c65f-4bf0-a774-373c0e249281/index.m3u8` |
| 7 | `bmtol-unofficial-jtc-km-12-000` | Tol Dalam Kota KM 12+000 | HLS | `https://jmlive.jasamarga.com/hls/2/2ca99e85-4756-4d19-855a-7cb9e2d6d72c/index.m3u8` |
| 8 | `bmtol-unofficial-jtc-km-11-000` | Tol Dalam Kota KM 11+000 | HLS | `https://jmlive.jasamarga.com/hls/2/87e7ca00-864c-48cc-a998-238390dca0a4/index.m3u8` |
| 9 | `bmtol-unofficial-jtc-km-00-400` | Tol Dalam Kota KM 00+400 CAWANG-CILILITAN | HLS | `https://jmlive.jasamarga.com/hls/2/5e5f5bce-9a4d-4648-8fab-6f9b763d3393/index.m3u8` |
| 10 | `bmtol-unofficial-jtc-km-10-100` | Tol Dalam Kota KM 10+100 | HLS | `https://jmlive.jasamarga.com/hls/2/8a77f9fb-0841-431d-a119-20e364652e1b/index.m3u8` |
| 11 | `bmtol-unofficial-jtc-km-07-000` | Tol Dalam Kota KM 07+000 | HLS | `https://jmlive.jasamarga.com/hls/2/586da95e-bd84-413a-9637-33229172046c/index.m3u8` |
| 12 | `bmtol-unofficial-jtc-km-06-000` | Tol Dalam Kota KM 06+000 | HLS | `https://jmlive.jasamarga.com/hls/2/fa3bdcff-5bcb-4038-9a4e-8fef3864aaac/index.m3u8` |
| 13 | `bmtol-unofficial-jtc-km-05-400-b` | Tol Dalam Kota KM 05+400 B | HLS | `https://jmlive.jasamarga.com/hls/2/22b41c63-0d4e-4366-937e-9a4ed6d1bca7/index.m3u8` |
| 14 | `bmtol-unofficial-jtc-km-05-400-a` | Tol Dalam Kota KM 05+400 A | HLS | `https://jmlive.jasamarga.com/hls/2/bd921db7-670b-43d3-87e1-d49bd2fd4916/index.m3u8` |
| 15 | `bmtol-unofficial-jtc-km-03-800` | Tol Dalam Kota KM 03+800 | HLS | `https://jmlive.jasamarga.com/hls/2/6842ec85-a8fe-4a0b-b5ad-440e6a4553c3/index.m3u8` |
| 16 | `bmtol-unofficial-jtc-km-02-100` | Tol Dalam Kota KM 02+100 | HLS | `https://jmlive.jasamarga.com/hls/2/0ded81ff-5985-4aa8-b3b4-c74dda93b715/index.m3u8` |
| 17 | `bmtol-unofficial-jtc-km-00-700` | Tol Dalam Kota KM 00+700 | HLS | `https://jmlive.jasamarga.com/hls/2/5c358857-874e-4514-b46d-2b5dbca78ea4/index.m3u8` |
| 18 | `bmtol-unofficial-jtc-km-00-400-a` | Tol Dalam Kota KM 00+400 A | HLS | `https://jmlive.jasamarga.com/hls/2/8a8561cc-a282-4399-8a88-621a01479383/index.m3u8` |
| 19 | `bmtol-unofficial-jtc-km-00-400-b` | Tol Dalam Kota KM 00+400 B | HLS | `https://jmlive.jasamarga.com/hls/2/fb66e53c-6a3f-4857-8eac-9625d9f1fa5c/index.m3u8` |
| 20 | `bmtol-unofficial-jtc-km-00-400-c` | Tol Dalam Kota KM 00+400 HALIM | HLS | `https://jmlive.jasamarga.com/hls/2/4e0c8054-8a43-4d0b-bb11-656cab6d77b1/index.m3u8` |

### Bengkulu-Taba Penanjung Toll (18)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-bengtab-km-06-000-a` | Tol Bengkulu-Taba Penanjung KM 06+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/3VXY1L3nQDIG1681709181912.m3u8` |
| 2 | `bmtol-unofficial-bengtab-km-09-800-b` | Tol Bengkulu-Taba Penanjung KM 09+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Tu5HgUH0qIO51681709509018.m3u8` |
| 3 | `bmtol-unofficial-bengtab-km-09-800-a` | Tol Bengkulu-Taba Penanjung KM 09+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/VVa9dUqP45VQ1681709496351.m3u8` |
| 4 | `bmtol-unofficial-bengtab-km-08-800-b` | Tol Bengkulu-Taba Penanjung KM 08+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/8Ut7SUb2DY851681709483059.m3u8` |
| 5 | `bmtol-unofficial-bengtab-km-08-800-a` | Tol Bengkulu-Taba Penanjung KM 08+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/oPBTT2Dkvk0a1681709468709.m3u8` |
| 6 | `bmtol-unofficial-bengtab-km-07-850-b` | Tol Bengkulu-Taba Penanjung KM 07+850 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/iCgBfwbTyy2g1681709453732.m3u8` |
| 7 | `bmtol-unofficial-bengtab-km-07-850-a` | Tol Bengkulu-Taba Penanjung KM 07+850 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/4yfHvXyVUb1O1681709440912.m3u8` |
| 8 | `bmtol-unofficial-bengtab-km-06-900-b` | Tol Bengkulu-Taba Penanjung KM 06+900 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/LOcBu0a9Sq2f1681709237021.m3u8` |
| 9 | `bmtol-unofficial-bengtab-km-06-900-a` | Tol Bengkulu-Taba Penanjung KM 06+900 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/tfONqb3Bmsxw1681709224026.m3u8` |
| 10 | `bmtol-unofficial-bengtab-km-06-000-b` | Tol Bengkulu-Taba Penanjung KM 06+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/G5nC1udCaNWH1681709209316.m3u8` |
| 11 | `bmtol-unofficial-bengtab-km-05-000-b` | Tol Bengkulu-Taba Penanjung KM 05+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Zpwc3ixZPbCh1681709167554.m3u8` |
| 12 | `bmtol-unofficial-bengtab-km-05-000-a` | Tol Bengkulu-Taba Penanjung KM 05+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/W2aPtTBAvi7c1681709153743.m3u8` |
| 13 | `bmtol-unofficial-bengtab-km-04-000-b` | Tol Bengkulu-Taba Penanjung KM 04+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/VOi0qZWOxAjl1681709140830.m3u8` |
| 14 | `bmtol-unofficial-bengtab-km-04-000-a` | Tol Bengkulu-Taba Penanjung KM 04+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/2tStAEirOfnH1681709125992.m3u8` |
| 15 | `bmtol-unofficial-bengtab-km-03-000-b` | Tol Bengkulu-Taba Penanjung KM 03+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/gZV4zCAjsDoa1681709108216.m3u8` |
| 16 | `bmtol-unofficial-bengtab-km-03-000-a` | Tol Bengkulu-Taba Penanjung KM 03+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/KRdSUWYCqp5E1681709091130.m3u8` |
| 17 | `bmtol-unofficial-bengtab-km-02-000-b` | Tol Bengkulu-Taba Penanjung KM 02+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/JNCgEUkxSnI41681708912504.m3u8` |
| 18 | `bmtol-unofficial-bengtab-km-02-000-a` | Tol Bengkulu-Taba Penanjung KM 02+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/McrbwhHZ34qK1681708646415.m3u8` |

### Indrapura-Kisaran Toll (18)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-inkis-km-129-200-a` | Tol Indrapura-Kisaran KM 129+200 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/pwaVJYCIRMvW1712174332936.m3u8` |
| 2 | `bmtol-unofficial-inkis-km-132-000-b` | Tol Indrapura-Kisaran KM 132+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/P0CXkopvs9IL1712174232528.m3u8` |
| 3 | `bmtol-unofficial-inkis-km-132-000-a` | Tol Indrapura-Kisaran KM 132+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/iOyRtXzf3s6X1712174243251.m3u8` |
| 4 | `bmtol-unofficial-inkis-km-131-650-b` | Tol Indrapura-Kisaran KM 131+650 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/fzvIoeU3PcMc1712174254070.m3u8` |
| 5 | `bmtol-unofficial-inkis-km-131-650-a` | Tol Indrapura-Kisaran KM 131+650 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/yXxbKhFOCdFM1712174268857.m3u8` |
| 6 | `bmtol-unofficial-inkis-km-130-800-b` | Tol Indrapura-Kisaran KM 130+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/eHuPkRLokQgm1712174280042.m3u8` |
| 7 | `bmtol-unofficial-inkis-km-130-800-a` | Tol Indrapura-Kisaran KM 130+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/sAJVvYkr2Jn01712174290461.m3u8` |
| 8 | `bmtol-unofficial-inkis-km-130-100-b` | Tol Indrapura-Kisaran KM 130+100 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/ww1TOBoCoxvX1712174301137.m3u8` |
| 9 | `bmtol-unofficial-inkis-km-130-100-a` | Tol Indrapura-Kisaran KM 130+100 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/TeAJB1mLXfv71712174310819.m3u8` |
| 10 | `bmtol-unofficial-inkis-km-129-200-b` | Tol Indrapura-Kisaran KM 129+200 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/I7hck6yGUTna1712174321830.m3u8` |
| 11 | `bmtol-unofficial-inkis-km-128-200-b` | Tol Indrapura-Kisaran KM 128+200 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/pljwVv29WDTI1712174343297.m3u8` |
| 12 | `bmtol-unofficial-inkis-km-128-200-a` | Tol Indrapura-Kisaran KM 128+200 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/ApNbGwcrz79K1712174354110.m3u8` |
| 13 | `bmtol-unofficial-inkis-km-127-200-b` | Tol Indrapura-Kisaran KM 127+200 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/mX0WLQSzOLkj1712174364778.m3u8` |
| 14 | `bmtol-unofficial-inkis-km-127-200-a` | Tol Indrapura-Kisaran KM 127+200 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Ps2bSG2AnRfy1712174374504.m3u8` |
| 15 | `bmtol-unofficial-inkis-km-126-325-b` | Tol Indrapura-Kisaran KM 126+325 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/1FD3NodWp8Jf1712174386635.m3u8` |
| 16 | `bmtol-unofficial-inkis-km-126-325-a` | Tol Indrapura-Kisaran KM 126+325 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/WYgoU0FAywTA1712174398549.m3u8` |
| 17 | `bmtol-unofficial-inkis-km-125-165-b` | Tol Indrapura-Kisaran KM 125+165 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/PfViSGtO6KLc1712174428436.m3u8` |
| 18 | `bmtol-unofficial-inkis-km-125-165-a` | Tol Indrapura-Kisaran KM 125+165 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/eM8Xy6H90N0h1712174480901.m3u8` |

### Cipularang Toll (16)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-cipul-km-111-800-b` | Tol Cipularang KM 111+800 B | HLS | `https://jmlive.jasamarga.com/hls/7/62bb9961-eca2-485a-910e-9f4a52097d0b/index.m3u8` |
| 2 | `bmtol-unofficial-cipul-km-116-800-b` | Tol Cipularang KM 116+800 B | HLS | `https://jmlive.jasamarga.com/hls/7/b4ae9f1e-50dc-4f93-a08b-f1e195a59790/index.m3u8` |
| 3 | `bmtol-unofficial-cipul-km-116-800` | Tol Cipularang KM 116+800 Lajur Darurat | HLS | `https://jmlive.jasamarga.com/hls/7/526196d9-e023-43ca-951c-f1b655c0c0b8/index.m3u8` |
| 4 | `bmtol-unofficial-cipul-km-113-000` | Tol Cipularang KM 113+000 | HLS | `https://jmlive.jasamarga.com/hls/7/bbe885fb-67bc-4bb5-bbc1-cbad44143005/index.m3u8` |
| 5 | `bmtol-unofficial-cipul-km-111-000` | Tol Cipularang KM 111+000 | HLS | `https://jmlive.jasamarga.com/hls/7/240d2f4e-0350-4306-8e9c-8fe0d4897217/index.m3u8` |
| 6 | `bmtol-unofficial-cipul-km-105-000` | Tol Cipularang KM 105+000 | HLS | `https://jmlive.jasamarga.com/hls/7/4c7a05bb-4848-4273-bb70-098c9264a542/index.m3u8` |
| 7 | `bmtol-unofficial-cipul-km-101-900` | Tol Cipularang KM 101+900 | HLS | `https://jmlive.jasamarga.com/hls/7/54d0efbd-7199-412b-9ede-fac32f1488fb/index.m3u8` |
| 8 | `bmtol-unofficial-cipul-km-99-700` | Tol Cipularang KM 99+700 | HLS | `https://jmlive.jasamarga.com/hls/7/3508b55c-6e61-40ea-8bf8-5e8dcb6d8e34/index.m3u8` |
| 9 | `bmtol-unofficial-cipul-km-67-000` | Tol Cipularang KM 67+000 | HLS | `https://jmlive.jasamarga.com/hls/7/f1a0647f-07f7-4efd-a9af-4e4d0ff2b410/index.m3u8` |
| 10 | `bmtol-unofficial-cipul-km-91-000` | Tol Cipularang KM 91+000 | HLS | `https://jmlive.jasamarga.com/hls/7/dfe3051b-836c-461f-b49e-78ce6d8d2341/index.m3u8` |
| 11 | `bmtol-unofficial-cipul-km-87-200` | Tol Cipularang KM 87+200 | HLS | `https://jmlive.jasamarga.com/hls/7/35de668b-ebab-4a1b-be57-7bbae1ae8f2c/index.m3u8` |
| 12 | `bmtol-unofficial-cipul-km-84-000` | Tol Cipularang KM 84+000 SS JATILUHUR | HLS | `https://jmlive.jasamarga.com/hls/7/7fb00e28-07ea-4e7b-988a-4a2fc36ade05/index.m3u8` |
| 13 | `bmtol-unofficial-cipul-km-79-000` | Tol Cipularang KM 79+000 | HLS | `https://jmlive.jasamarga.com/hls/7/98b92830-bbbc-409d-9b8e-c56ceddd81cc/index.m3u8` |
| 14 | `bmtol-unofficial-cipul-km-76-100` | Tol Cipularang KM 76+100 SS SADANG | HLS | `https://jmlive.jasamarga.com/hls/7/4ea4f417-33de-40af-9804-0c98b1eaed93/index.m3u8` |
| 15 | `bmtol-unofficial-cipul-km-72-000` | Tol Cipularang KM 72+000 | HLS | `https://jmlive.jasamarga.com/hls/7/9dd933aa-5ed2-4da6-870f-8b23b898d2a4/index.m3u8` |
| 16 | `bmtol-unofficial-cipul-km-70-000` | Tol Cipularang KM 70+000 | HLS | `https://jmlive.jasamarga.com/hls/7/5d02a0ce-91fe-43d1-a2eb-35565afe7ef5/index.m3u8` |

### Semarang-Batang Toll (16)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jsb-km-402-850` | Tol Semarang-Batang KM 402+850 | HLS | `https://jmlive.jasamarga.com/hls/14/8fb9d36a-c3f9-4eb0-b32a-d5efa14e1aea/index.m3u8` |
| 2 | `bmtol-unofficial-jsb-km-418-300` | Tol Semarang-Batang KM 418+300 | HLS | `https://jmlive.jasamarga.com/hls/14/f0361477-f119-44d8-96fb-48d5bfd84d52/index.m3u8` |
| 3 | `bmtol-unofficial-jsb-km-411-900-a` | Tol Semarang-Batang KM 411+900 A | HLS | `https://jmlive.jasamarga.com/hls/14/60277f42-ebb7-487e-bc32-21d22835bf2b/index.m3u8` |
| 4 | `bmtol-unofficial-jsb-km-411-900` | Tol Semarang-Batang KM 411+900 | HLS | `https://jmlive.jasamarga.com/hls/14/b1fd0dbf-d8ae-4e76-88ea-351513b53242/index.m3u8` |
| 5 | `bmtol-unofficial-jsb-km-410-050` | Tol Semarang-Batang KM 410+050 | HLS | `https://jmlive.jasamarga.com/hls/14/caf14989-a743-4c26-bd2d-a2a7a41e0791/index.m3u8` |
| 6 | `bmtol-unofficial-jsb-km-408-000` | Tol Semarang-Batang KM 408+000 | HLS | `https://jmlive.jasamarga.com/hls/14/e87e8e7a-a7b3-44a1-b3d6-5b105a5b53c9/index.m3u8` |
| 7 | `bmtol-unofficial-jsb-km-347-700` | Tol Semarang-Batang KM 347+700 | HLS | `https://jmlive.jasamarga.com/hls/14/1e1d5c19-11e6-496c-b408-8ac21e470fb5/index.m3u8` |
| 8 | `bmtol-unofficial-jsb-km-400-850` | Tol Semarang-Batang KM 400+850 | HLS | `https://jmlive.jasamarga.com/hls/14/af41b314-d713-4a3c-813d-d198c4fd1a4e/index.m3u8` |
| 9 | `bmtol-unofficial-jsb-km-383-700` | Tol Semarang-Batang KM 383+700 | HLS | `https://jmlive.jasamarga.com/hls/14/b6af5169-e42c-4ec1-b835-1df5ef3f7ce0/index.m3u8` |
| 10 | `bmtol-unofficial-jsb-km-381-700-a` | Tol Semarang-Batang KM 381+700 A | HLS | `https://jmlive.jasamarga.com/hls/14/51c18a94-fcfc-4149-b633-7e0d4ef77986/index.m3u8` |
| 11 | `bmtol-unofficial-jsb-km-381-700-b` | Tol Semarang-Batang KM 381+700 B | HLS | `https://jmlive.jasamarga.com/hls/14/73c35196-1d56-4ce7-a8da-84f72df2aada/index.m3u8` |
| 12 | `bmtol-unofficial-jsb-km-379-700` | Tol Semarang-Batang KM 379+700 | HLS | `https://jmlive.jasamarga.com/hls/14/1b2afedf-c068-4ade-a755-6e8f800c8ac3/index.m3u8` |
| 13 | `bmtol-unofficial-jsb-km-377-700` | Tol Semarang-Batang KM 377+700 | HLS | `https://jmlive.jasamarga.com/hls/14/b4a99f53-b764-45c5-adae-2fc8d08990b5/index.m3u8` |
| 14 | `bmtol-unofficial-jsb-km-371-700` | Tol Semarang-Batang KM 371+700 | HLS | `https://jmlive.jasamarga.com/hls/14/fab0797f-a1a5-487c-beb3-c8bbd39dd197/index.m3u8` |
| 15 | `bmtol-unofficial-jsb-km-369-700` | Tol Semarang-Batang KM 369+700 | HLS | `https://jmlive.jasamarga.com/hls/14/ba2cac70-cf7a-4399-8a99-826803a7276f/index.m3u8` |
| 16 | `bmtol-unofficial-jsb-km-411-000` | Tol Semarang-Batang KM 411+000 | HLS | `https://jmlive.jasamarga.com/hls/14/0a514afa-6504-4e66-a3ae-af1ff68f4322/index.m3u8` |

### Balikpapan-Samarinda Toll (13)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-balsam-km-02-000` | Tol Balsam KM 02+000 | HLS | `https://jmlive.jasamarga.com/hls/31/d263ad9c-66ca-4e69-b624-093cd9973e79/index.m3u8` |
| 2 | `bmtol-unofficial-balsam-km-05-500` | Tol Balsam KM 05+500 | HLS | `https://jmlive.jasamarga.com/hls/31/c6c32128-0465-4074-9b73-62a5c890f455/index.m3u8` |
| 3 | `bmtol-unofficial-balsam-km-13-400` | Tol Balsam KM 13+400 | HLS | `https://jmlive.jasamarga.com/hls/31/8b64b15b-ea10-4227-9a9e-8ae68c37500b/index.m3u8` |
| 4 | `bmtol-unofficial-balsam-km-20-000` | Tol Balsam KM 20+000 | HLS | `https://jmlive.jasamarga.com/hls/31/e3edc465-58a4-4817-b328-a660165f7222/index.m3u8` |
| 5 | `bmtol-unofficial-balsam-km-22-000` | Tol Balsam KM 22+000 | HLS | `https://jmlive.jasamarga.com/hls/31/c4b16fd6-57bf-41aa-a11e-371bb5c1007b/index.m3u8` |
| 6 | `bmtol-unofficial-balsam-km-24-200` | Tol Balsam KM 24+200 | HLS | `https://jmlive.jasamarga.com/hls/31/967e04d5-2702-43d3-aaa6-1e42aa61fb1d/index.m3u8` |
| 7 | `bmtol-unofficial-balsam-km-38-000` | Tol Balsam KM 38+000 | HLS | `https://jmlive.jasamarga.com/hls/31/4027e2da-6344-4105-976a-01a0391ec298/index.m3u8` |
| 8 | `bmtol-unofficial-balsam-km-40-000` | Tol Balsam KM 40+000 | HLS | `https://jmlive.jasamarga.com/hls/31/ce866258-e430-451c-a221-381d1dc9e71e/index.m3u8` |
| 9 | `bmtol-unofficial-balsam-km-42-000` | Tol Balsam KM 42+000 | HLS | `https://jmlive.jasamarga.com/hls/31/599245ce-6fde-4ee9-bbd3-f4f637df1df2/index.m3u8` |
| 10 | `bmtol-unofficial-balsam-km-68-000` | Tol Balsam KM 68+000 | HLS | `https://jmlive.jasamarga.com/hls/31/dc225c3b-6f75-463f-b510-1d56c5c0107c/index.m3u8` |
| 11 | `bmtol-unofficial-balsam-km-79-000` | Tol Balsam KM 79+000 | HLS | `https://jmlive.jasamarga.com/hls/31/06a69a6e-f119-4036-aa21-b4a4abb04ac6/index.m3u8` |
| 12 | `bmtol-unofficial-balsam-km-85-400` | Tol Balsam KM 85+400 | HLS | `https://jmlive.jasamarga.com/hls/31/50e0d7a7-9a63-48c5-bfb0-0e3b314aac60/index.m3u8` |
| 13 | `bmtol-unofficial-balsam-km-90-000` | Tol Balsam KM 90+000 | HLS | `https://jmlive.jasamarga.com/hls/31/cf21dc19-40d3-498a-858f-059ea36d6773/index.m3u8` |

### Sedyatmo Toll (12)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-sedyatmo-km-28-200-a` | Tol Sedyatmo KM 28+200 A | HLS | `https://jmlive.jasamarga.com/hls/3/87c2ce88-c9df-490e-9dfb-f70e106d37ad/index.m3u8` |
| 2 | `bmtol-unofficial-sedyatmo-km-32-000` | Tol Sedyatmo KM 32+000 | HLS | `https://jmlive.jasamarga.com/hls/3/d746b1c7-88fa-4473-b3c9-9718195cbefc/index.m3u8` |
| 3 | `bmtol-unofficial-sedyatmo-km-30-650` | Tol Sedyatmo KM 30+650 | HLS | `https://jmlive.jasamarga.com/hls/3/fe5f0ce2-0d8b-4632-9667-391238b0f732/index.m3u8` |
| 4 | `bmtol-unofficial-sedyatmo-km-30-200` | Tol Sedyatmo KM 30+200 | HLS | `https://jmlive.jasamarga.com/hls/3/0c6626ac-9406-49b2-bd4f-f49b6fd35047/index.m3u8` |
| 5 | `bmtol-unofficial-sedyatmo-km-29-050` | Tol Sedyatmo KM 29+050 | HLS | `https://jmlive.jasamarga.com/hls/3/c7e9d7f3-8862-4c5a-9dca-7d06647c7ed5/index.m3u8` |
| 6 | `bmtol-unofficial-sedyatmo-km-20-500` | Tol Sedyatmo KM 20+500 | HLS | `https://jmlive.jasamarga.com/hls/3/0a8de19b-7c94-4eb6-b9da-77b083676552/index.m3u8` |
| 7 | `bmtol-unofficial-sedyatmo-km-27-200-a` | Tol Sedyatmo KM 27+200 A | HLS | `https://jmlive.jasamarga.com/hls/3/776b270a-cf55-438b-852f-924d55c62ee5/index.m3u8` |
| 8 | `bmtol-unofficial-sedyatmo-km-26-800` | Tol Sedyatmo KM 26+800 | HLS | `https://jmlive.jasamarga.com/hls/3/71f2fb22-2ab7-4618-8953-1f0203317fbb/index.m3u8` |
| 9 | `bmtol-unofficial-sedyatmo-km-26-000-a` | Tol Sedyatmo KM 26+000 A | HLS | `https://jmlive.jasamarga.com/hls/3/243b0dd4-2d52-458f-a54f-04e1a77361bc/index.m3u8` |
| 10 | `bmtol-unofficial-sedyatmo-km-24-000-b` | Tol Sedyatmo KM 24+000 B | HLS | `https://jmlive.jasamarga.com/hls/3/dd590b8e-c391-417f-af36-3222c0123be8/index.m3u8` |
| 11 | `bmtol-unofficial-sedyatmo-km-24-000-a` | Tol Sedyatmo KM 24+000 A | HLS | `https://jmlive.jasamarga.com/hls/3/8ac43842-a9be-411f-b5a2-1b941e9aebf9/index.m3u8` |
| 12 | `bmtol-unofficial-sedyatmo-km-23-200` | Tol Sedyatmo KM 23+200 | HLS | `https://jmlive.jasamarga.com/hls/3/fa16b0f3-8a2f-4a3b-98d9-d5b0b56d9ff3/index.m3u8` |

### Medan-Tebing Tinggi Toll (19)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-jmkt-km-53-000` | Tol Medan-Tebing Tinggi KM 53+000 | HLS | `https://jmlive.jasamarga.com/hls/25/95045082-c19f-4707-9491-3a5d2128159f/index.m3u8` |
| 2 | `bmtol-unofficial-jmkt-km-36-000` | Tol Medan-Tebing Tinggi KM 36+000 | HLS | `https://jmlive.jasamarga.com/hls/25/cbd8f9a7-189a-4726-97e7-f2e71b996c5c/index.m3u8` |
| 3 | `bmtol-unofficial-jmkt-km-37-000` | Tol Medan-Tebing Tinggi KM 37+000 | HLS | `https://jmlive.jasamarga.com/hls/25/ef7d5dde-d34e-4dfc-8537-0c385939d5f4/index.m3u8` |
| 4 | `bmtol-unofficial-jmkt-km-38-000` | Tol Medan-Tebing Tinggi KM 38+000 | HLS | `https://jmlive.jasamarga.com/hls/25/d41b3cce-4f84-46df-bce0-db500b1176f3/index.m3u8` |
| 5 | `bmtol-unofficial-jmkt-km-39-000` | Tol Medan-Tebing Tinggi KM 39+000 | HLS | `https://jmlive.jasamarga.com/hls/25/e81f16a1-a821-48d2-899e-80b671bf2456/index.m3u8` |
| 6 | `bmtol-unofficial-jmkt-km-40-000` | Tol Medan-Tebing Tinggi KM 40+000 | HLS | `https://jmlive.jasamarga.com/hls/25/d0a111cb-a10b-45d8-b93e-42643889b800/index.m3u8` |
| 7 | `bmtol-unofficial-jmkt-km-45-000` | Tol Medan-Tebing Tinggi KM 45+000 | HLS | `https://jmlive.jasamarga.com/hls/25/3a704937-c113-46ac-aa39-c89240b07a5a/index.m3u8` |
| 8 | `bmtol-unofficial-jmkt-km-46-000` | Tol Medan-Tebing Tinggi KM 46+000 | HLS | `https://jmlive.jasamarga.com/hls/25/f2dba92a-11a5-4ee1-857e-1167848b8b88/index.m3u8` |
| 9 | `bmtol-unofficial-jmkt-km-47-000` | Tol Medan-Tebing Tinggi KM 47+000 | HLS | `https://jmlive.jasamarga.com/hls/25/529527bf-ad63-4ab1-9b1f-ab29a472fc9a/index.m3u8` |
| 10 | `bmtol-unofficial-jmkt-km-49-000` | Tol Medan-Tebing Tinggi KM 49+000 | HLS | `https://jmlive.jasamarga.com/hls/25/6ba6372e-6ab6-459d-9d11-a96a282e3938/index.m3u8` |
| 11 | `bmtol-unofficial-jmkt-km-50-000` | Tol Medan-Tebing Tinggi KM 50+000 | HLS | `https://jmlive.jasamarga.com/hls/25/3c138433-2fc8-4b43-8666-7f4302a0246c/index.m3u8` |
| 12 | `bmtol-unofficial-jmkt-km-56-000` | Tol Medan-Tebing Tinggi KM 56+000 | HLS | `https://jmlive.jasamarga.com/hls/25/881a56e6-b93e-4933-b12b-b0ff160b605e/index.m3u8` |
| 13 | `bmtol-unofficial-jmkt-km-60-000` | Tol Medan-Tebing Tinggi KM 60+000 | HLS | `https://jmlive.jasamarga.com/hls/25/1cf4df3f-69b7-471d-bd0f-bf08db38c51d/index.m3u8` |
| 14 | `bmtol-unofficial-jmkt-km-61-000` | Tol Medan-Tebing Tinggi KM 61+000 | HLS | `https://jmlive.jasamarga.com/hls/25/a3f9bbee-e0d7-48c0-8d58-050eee041f04/index.m3u8` |
| 15 | `bmtol-unofficial-jmkt-km-32-000` | Tol Medan-Tebing Tinggi KM 32+000 | HLS | `https://jmlive.jasamarga.com/hls/25/1eeb7fd6-b922-4703-934c-b72407ccc0a3/index.m3u8` |
| 16 | `bmtol-unofficial-jmkt-km-33-000` | Tol Medan-Tebing Tinggi KM 33+000 | HLS | `https://jmlive.jasamarga.com/hls/25/2699c0e4-d874-487d-ba4a-d6c99ee445fb/index.m3u8` |
| 17 | `bmtol-unofficial-jmkt-km-43-000` | Tol Medan-Tebing Tinggi KM 43+000 | HLS | `https://jmlive.jasamarga.com/hls/25/c946c5b4-2071-4d0b-992e-c95b3d741a58/index.m3u8` |
| 18 | `bmtol-unofficial-jmkt-km-44-000` | Tol Medan-Tebing Tinggi KM 44+000 | HLS | `https://jmlive.jasamarga.com/hls/25/e3dbcb60-f9a5-4f0e-9fad-1dcc154921c6/index.m3u8` |
| 19 | `bmtol-unofficial-jmkt-km-48-000` | Tol Medan-Tebing Tinggi KM 48+000 | HLS | `https://jmlive.jasamarga.com/hls/25/07ce5b04-13e0-47df-b770-80b5b6e7f816/index.m3u8` |

### Padang-Sicincin Toll (11)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-pacin-km-02-800-a` | Tol Padang-Sicincin KM 02+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/DYveNsrC7V9g1736864796919.m3u8` |
| 2 | `bmtol-unofficial-pacin-km-02-800-b` | Tol Padang-Sicincin KM 02+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/nWzJfTjbmTkg1736864819385.m3u8` |
| 3 | `bmtol-unofficial-pacin-km-03-700-a` | Tol Padang-Sicincin KM 03+700 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/nnPVGFAmVkmT1736864839670.m3u8` |
| 4 | `bmtol-unofficial-pacin-km-03-700-b` | Tol Padang-Sicincin KM 03+700 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/dJmvGBCzuiCP1736864867166.m3u8` |
| 5 | `bmtol-unofficial-pacin-km-04-600-a` | Tol Padang-Sicincin KM 04+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/APijwCV1EDpH1736864896631.m3u8` |
| 6 | `bmtol-unofficial-pacin-km-04-600-b` | Tol Padang-Sicincin KM 04+600 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/htRPsf6upMDV1736864944243.m3u8` |
| 7 | `bmtol-unofficial-pacin-km-05-500-a` | Tol Padang-Sicincin KM 05+500 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Gy4ZZeEmlwzX1736864980169.m3u8` |
| 8 | `bmtol-unofficial-pacin-km-05-500-b` | Tol Padang-Sicincin KM 05+500 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/N3KHCdHyP39J1736864999145.m3u8` |
| 9 | `bmtol-unofficial-pacin-km-06-400-a` | Tol Padang-Sicincin KM 06+400 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/ywcNLjdxHtx81736865029116.m3u8` |
| 10 | `bmtol-unofficial-pacin-km-06-400-b` | Tol Padang-Sicincin KM 06+400 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/UXjJ2bcYSMii1736865060951.m3u8` |
| 11 | `bmtol-unofficial-pacin-km-07-300-a` | Tol Padang-Sicincin KM 07+300 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/imUM8DO29siS1736865111816.m3u8` |

### Sigli-Banda Aceh Toll (11)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-sibanceh-km-55-525-a` | Tol Sigli-Banda Aceh KM 55+525 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/408415252625837044701687.m3u8` |
| 2 | `bmtol-unofficial-sibanceh-km-55-525-b` | Tol Sigli-Banda Aceh KM 55+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/175965919635025906126998.m3u8` |
| 3 | `bmtol-unofficial-sibanceh-km-56-525-b` | Tol Sigli-Banda Aceh KM 56+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/584649280976228431437556.m3u8` |
| 4 | `bmtol-unofficial-sibanceh-km-57-525-a` | Tol Sigli-Banda Aceh KM 57+525 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/030232263299368634484960.m3u8` |
| 5 | `bmtol-unofficial-sibanceh-km-57-525-b` | Tol Sigli-Banda Aceh KM 57+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/737530940405259204455474.m3u8` |
| 6 | `bmtol-unofficial-sibanceh-km-58-525-a` | Tol Sigli-Banda Aceh KM 58+525 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/670575804236002818142120.m3u8` |
| 7 | `bmtol-unofficial-sibanceh-km-58-525-b` | Tol Sigli-Banda Aceh KM 58+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/027788747247692224309335.m3u8` |
| 8 | `bmtol-unofficial-sibanceh-km-59-525-a` | Tol Sigli-Banda Aceh KM 59+525 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/141710434214833889968446.m3u8` |
| 9 | `bmtol-unofficial-sibanceh-km-59-525-b` | Tol Sigli-Banda Aceh KM 59+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/575457507310275789239078.m3u8` |
| 10 | `bmtol-unofficial-sibanceh-km-60-525-a` | Tol Sigli-Banda Aceh KM 60+525 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/691539802144288575519591.m3u8` |
| 11 | `bmtol-unofficial-sibanceh-km-60-525-b` | Tol Sigli-Banda Aceh KM 60+525 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/043346792986518295950999.m3u8` |

### Binjai-Langsa Toll (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-binsa-km-24-000-a` | Tol Binjai-Langsa KM 24+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/u45JEcEMSVBR1677687688805.m3u8` |
| 2 | `bmtol-unofficial-binsa-km-24-000-b` | Tol Binjai-Langsa KM 24+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/sofJWNhCM7Yx1677687668856.m3u8` |
| 3 | `bmtol-unofficial-binsa-km-25-093-a` | Tol Binjai-Langsa KM 25+093 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/k68QfBCfap1o1677687648314.m3u8` |
| 4 | `bmtol-unofficial-binsa-km-25-093-b` | Tol Binjai-Langsa KM 25+093 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/7Pp2Ueg5Bs9Z1677687625045.m3u8` |
| 5 | `bmtol-unofficial-binsa-km-26-093-a` | Tol Binjai-Langsa KM 26+093 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/kZ1u52lZgrXk1677687597862.m3u8` |
| 6 | `bmtol-unofficial-binsa-km-26-093-b` | Tol Binjai-Langsa KM 26+093 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/gjbsCPhzEcWx1677687566129.m3u8` |
| 7 | `bmtol-unofficial-binsa-km-27-150-a` | Tol Binjai-Langsa KM 27+150 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/qyXzM6EOmrll1677687535082.m3u8` |
| 8 | `bmtol-unofficial-binsa-km-27-150-b` | Tol Binjai-Langsa KM 27+150 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/MAizjBKNpoD31677687504165.m3u8` |
| 9 | `bmtol-unofficial-binsa-km-28-200-a` | Tol Binjai-Langsa KM 28+200 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/wZhd75EtJrST1677687474745.m3u8` |
| 10 | `bmtol-unofficial-binsa-km-28-200-b` | Tol Binjai-Langsa KM 28+200 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/H2WjyvVB7uGs1677687449398.m3u8` |

### Jakarta-Tangerang Toll (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-janger-km-00-600` | Tol Jakarta-Tangerang KM 00+600 | HLS | `https://jmlive.jasamarga.com/hls/4/331d9c4d-3512-49c2-b119-42facdd3d209/index.m3u8` |
| 2 | `bmtol-unofficial-janger-km-04-600` | Tol Jakarta-Tangerang KM 04+600 | HLS | `https://jmlive.jasamarga.com/hls/4/0215e5e8-4a70-4341-9bc5-5657653ae9c0/index.m3u8` |
| 3 | `bmtol-unofficial-janger-km-07-200` | Tol Jakarta-Tangerang KM 07+200 | HLS | `https://jmlive.jasamarga.com/hls/4/8a3c4d47-2c23-4663-94dc-6018e8468c56/index.m3u8` |
| 4 | `bmtol-unofficial-janger-km-10-600` | Tol Jakarta-Tangerang KM 10+600 | HLS | `https://jmlive.jasamarga.com/hls/4/e74c3443-3b90-407c-8abb-324f757fc381/index.m3u8` |
| 5 | `bmtol-unofficial-janger-km-11-600` | Tol Jakarta-Tangerang KM 11+600 | HLS | `https://jmlive.jasamarga.com/hls/4/5e9452e7-b0b3-40f0-95dc-a41b3436d920/index.m3u8` |
| 6 | `bmtol-unofficial-janger-km-13-600` | Tol Jakarta-Tangerang KM 13+600 | HLS | `https://jmlive.jasamarga.com/hls/4/06e87597-dba6-4659-a99d-792ae9079e6e/index.m3u8` |
| 7 | `bmtol-unofficial-janger-km-15-500` | Tol Jakarta-Tangerang KM 15+500 | HLS | `https://jmlive.jasamarga.com/hls/4/5343c37c-be82-4dc7-a9e9-04c1f396d769/index.m3u8` |
| 8 | `bmtol-unofficial-janger-km-17-600` | Tol Jakarta-Tangerang KM 17+600 | HLS | `https://jmlive.jasamarga.com/hls/4/82fb2424-3390-4f1e-bdba-71c84daa774c/index.m3u8` |
| 9 | `bmtol-unofficial-janger-km-19-300` | Tol Jakarta-Tangerang KM 19+300 | HLS | `https://jmlive.jasamarga.com/hls/4/29f211a7-7072-4635-ba3e-be26dc5d9fba/index.m3u8` |
| 10 | `bmtol-unofficial-janger-km-25-500` | Tol Jakarta-Tangerang KM 25+500 | HLS | `https://jmlive.jasamarga.com/hls/4/208678ef-1da5-4083-9a8b-d45e29a3cf83/index.m3u8` |

### Palembang-Indralaya Toll (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-palindra-km-01-600-a` | Tol Palembang-Indralaya KM 01+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/267565493547947969759647.m3u8` |
| 2 | `bmtol-unofficial-palindra-km-01-600-b` | Tol Palembang-Indralaya KM 01+600 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/000873119738804749935559.m3u8` |
| 3 | `bmtol-unofficial-palindra-km-05-600-a` | Tol Palembang-Indralaya KM 05+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/156545412556986213279533.m3u8` |
| 4 | `bmtol-unofficial-palindra-km-05-600-b` | Tol Palembang-Indralaya KM 05+600 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/620290052888606951595901.m3u8` |
| 5 | `bmtol-unofficial-palindra-km-10-000-a` | Tol Palembang-Indralaya KM 10+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/421187275697827865888243.m3u8` |
| 6 | `bmtol-unofficial-palindra-km-10-000-b` | Tol Palembang-Indralaya KM 10+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/456870316790688303611820.m3u8` |
| 7 | `bmtol-unofficial-palindra-km-14-700-a` | Tol Palembang-Indralaya KM 14+700 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/830420490000028390395192.m3u8` |
| 8 | `bmtol-unofficial-palindra-km-14-700-b` | Tol Palembang-Indralaya KM 14+700 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/470984176555780160791642.m3u8` |
| 9 | `bmtol-unofficial-palindra-km-18-300-a` | Tol Palembang-Indralaya KM 18+300 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/426719818405515807543344.m3u8` |
| 10 | `bmtol-unofficial-palindra-km-18-300-b` | Tol Palembang-Indralaya KM 18+300 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/429890133451227723270508.m3u8` |

### Pekanbaru-Bangkinang Toll (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-pekbang-km-10-300-a` | Tol Pekanbaru-Bangkinang KM 10+300 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Bcet69FT0SCM1693210186954.m3u8` |
| 2 | `bmtol-unofficial-pekbang-km-14-045-b` | Tol Pekanbaru-Bangkinang KM 14+045 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/5uWd1tRJTp1X1693095312280.m3u8` |
| 3 | `bmtol-unofficial-pekbang-km-14-045-a` | Tol Pekanbaru-Bangkinang KM 14+045 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/UalcJIr87tTV1693095300722.m3u8` |
| 4 | `bmtol-unofficial-pekbang-km-13-045-b` | Tol Pekanbaru-Bangkinang KM 13+045 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/49oZDuThS13A1693095274425.m3u8` |
| 5 | `bmtol-unofficial-pekbang-km-13-045-a` | Tol Pekanbaru-Bangkinang KM 13+045 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/rMU0HsfKBQEz1693095287861.m3u8` |
| 6 | `bmtol-unofficial-pekbang-km-12-045-b` | Tol Pekanbaru-Bangkinang KM 12+045 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/5IzGtJDm3m9a1693095246182.m3u8` |
| 7 | `bmtol-unofficial-pekbang-km-12-045-a` | Tol Pekanbaru-Bangkinang KM 12+045 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/jtpLAEnzzebH1693095261030.m3u8` |
| 8 | `bmtol-unofficial-pekbang-km-11-045-b` | Tol Pekanbaru-Bangkinang KM 11+045 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Rx1FY5QgZkXH1693095036803.m3u8` |
| 9 | `bmtol-unofficial-pekbang-km-11-045-a` | Tol Pekanbaru-Bangkinang KM 11+045 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/HIe3YxSVk2Yl1693095227088.m3u8` |
| 10 | `bmtol-unofficial-pekbang-km-10-300-b` | Tol Pekanbaru-Bangkinang KM 10+300 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/oPKcYvefo2rU1693210325252.m3u8` |

### Indralaya-Prabumulih Toll (9)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-indraprabu-km-21-600-a` | Tol Indralaya-Prabumulih KM 21+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/syRFOnI1jdNy1699857260272.m3u8` |
| 2 | `bmtol-unofficial-indraprabu-km-21-600-b` | Tol Indralaya-Prabumulih KM 21+600 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/RAfDEslcMG041699857271131.m3u8` |
| 3 | `bmtol-unofficial-indraprabu-km-22-800-a` | Tol Indralaya-Prabumulih KM 22+800 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/vcKtpzygc5yw1700981332174.m3u8` |
| 4 | `bmtol-unofficial-indraprabu-km-22-800-b` | Tol Indralaya-Prabumulih KM 22+800 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/p320SDlQLgZY1700981344169.m3u8` |
| 5 | `bmtol-unofficial-indraprabu-km-23-600-a` | Tol Indralaya-Prabumulih KM 23+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/VMlV79oZVyaA1700981360450.m3u8` |
| 6 | `bmtol-unofficial-indraprabu-km-24-700-a` | Tol Indralaya-Prabumulih KM 24+700 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/FnFXfQPs1IUT1700981380912.m3u8` |
| 7 | `bmtol-unofficial-indraprabu-km-24-700-b` | Tol Indralaya-Prabumulih KM 24+700 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/3hI00vQHUVLN1700981390703.m3u8` |
| 8 | `bmtol-unofficial-indraprabu-km-25-600-a` | Tol Indralaya-Prabumulih KM 25+600 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/eoSBH5YINCoc1700981399972.m3u8` |
| 9 | `bmtol-unofficial-indraprabu-km-25-600-b` | Tol Indralaya-Prabumulih KM 25+600 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/OS5t8uF8AhRG1700981411712.m3u8` |

### Padaleunyi Toll (9)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-padcil-km-135-600` | Tol Padaleunyi KM 135+600 SS KOPO | HLS | `https://jmlive.jasamarga.com/hls/6/c76c10ca-31e7-40fb-8443-9fb12cb97306/index.m3u8` |
| 2 | `bmtol-unofficial-padcil-km-154-800` | Tol Padaleunyi KM 154+800 | HLS | `https://jmlive.jasamarga.com/hls/6/71ffc700-97ae-45c3-9e8c-9db1564f4aa9/index.m3u8` |
| 3 | `bmtol-unofficial-padcil-km-152-200` | Tol Padaleunyi KM 152+200 | HLS | `https://jmlive.jasamarga.com/hls/6/14a99231-df7f-48e3-afda-f562bc72c01c/index.m3u8` |
| 4 | `bmtol-unofficial-padcil-km-149-400` | Tol Padaleunyi KM 149+400 | HLS | `https://jmlive.jasamarga.com/hls/6/32c9a396-5b6f-48f2-b85c-14a59a7dd547/index.m3u8` |
| 5 | `bmtol-unofficial-padcil-km-147-600-a` | Tol Padaleunyi KM 147+600 A | HLS | `https://jmlive.jasamarga.com/hls/6/b33a6bfe-4611-4a48-9bb1-df7c8afcc45f/index.m3u8` |
| 6 | `bmtol-unofficial-padcil-km-142-000` | Tol Padaleunyi KM 142+000 SS BUAH BATU | HLS | `https://jmlive.jasamarga.com/hls/6/e851d0ed-bb7e-48c5-8d42-f7b77165634b/index.m3u8` |
| 7 | `bmtol-unofficial-padcil-km-138-500` | Tol Padaleunyi KM 138+500 SS M TOHA | HLS | `https://jmlive.jasamarga.com/hls/6/8bc51287-945d-4fd9-a3f4-7151a2804aee/index.m3u8` |
| 8 | `bmtol-unofficial-padcil-km-122-450-b` | Tol Padaleunyi KM 122+450 B | HLS | `https://jmlive.jasamarga.com/hls/6/8bd34605-3a76-4319-bb62-5529c048d9c9/index.m3u8` |
| 9 | `bmtol-unofficial-padcil-km-132-400` | Tol Padaleunyi KM 132+400 SS PASIR KOJA | HLS | `https://jmlive.jasamarga.com/hls/6/042ea5d3-bc15-4238-804b-13a5320f6a4d/index.m3u8` |

### Cipali Toll (Cikopo-Palimanan) (15)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-cipali-km-073-180` | Tol Cipali KM 73+180 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_73+180.m3u8` |
| 2 | `bmtol-unofficial-cipali-km-076-500` | Tol Cipali KM 76+500 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_76+500.m3u8` |
| 3 | `bmtol-unofficial-cipali-km-079-000` | Tol Cipali KM 79+000 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_79+000.m3u8` |
| 4 | `bmtol-unofficial-cipali-km-086-500` | Tol Cipali KM 86+500 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_86+500.m3u8` |
| 5 | `bmtol-unofficial-cipali-km-096-840` | Tol Cipali KM 96+840 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_96+840.m3u8` |
| 6 | `bmtol-unofficial-cipali-km-098-700` | Tol Cipali KM 98+700 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_98+700.m3u8` |
| 7 | `bmtol-unofficial-cipali-km-114-500` | Tol Cipali KM 114+500 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_114+500_A.m3u8` |
| 8 | `bmtol-unofficial-cipali-km-118-700-a` | Tol Cipali KM 118+700 A | HLS | `https://cctvastra.lintasmarga.com/barat/KM_118+700_A.m3u8` |
| 9 | `bmtol-unofficial-cipali-km-130-500-a` | Tol Cipali KM 130+500 A | HLS | `https://cctvastra.lintasmarga.com/barat/KM_130+500_A.m3u8` |
| 10 | `bmtol-unofficial-cipali-km-140-270-b` | Tol Cipali KM 140+270 B | HLS | `https://cctvastra.lintasmarga.com/barat/KM_140+270_B.m3u8` |
| 11 | `bmtol-unofficial-cipali-km-142-a` | Tol Cipali KM 142 A | HLS | `https://cctvastra.lintasmarga.com/barat/KM_142_A.m3u8` |
| 12 | `bmtol-unofficial-cipali-km-149-000-a` | Tol Cipali KM 149+000 A | HLS | `https://cctvastra.lintasmarga.com/barat/KM_149+000_A.m3u8` |
| 13 | `bmtol-unofficial-cipali-km-157-a` | Tol Cipali KM 157 A | HLS | `https://cctvastra.lintasmarga.com/barat/KM_157_A.m3u8` |
| 14 | `bmtol-unofficial-cipali-km-166` | Tol Cipali KM 166 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_166.m3u8` |
| 15 | `bmtol-unofficial-cipali-km-175` | Tol Cipali KM 175 | HLS | `https://cctvastra.lintasmarga.com/barat/KM_175.m3u8` |

### Pejagan-Pemalang Toll (22)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-pejalang-km-268-000-b` | Tol Pejagan-Pemalang KM 268+000 B | HLS | `https://pptrlive.co.id/memfs/d779afed-62ef-4d56-93cd-7c1584ed3ca4.m3u8` |
| 2 | `bmtol-unofficial-pejalang-km-257-000-a` | Tol Pejagan-Pemalang KM 257+000 A | HLS | `https://pptrlive.co.id/memfs/b7ae9046-2811-48be-92f6-773e5a5f5944.m3u8` |
| 3 | `bmtol-unofficial-pejalang-km-274-000-b` | Tol Pejagan-Pemalang KM 274+000 B | HLS | `https://pptrlive.co.id/memfs/f0a96354-8aed-41b0-a3cd-441029a47090.m3u8` |
| 4 | `bmtol-unofficial-pejalang-km-274-000-a` | Tol Pejagan-Pemalang KM 274+000 A | HLS | `https://pptrlive.co.id/memfs/d1b42cca-422e-4df6-a59a-3083d4ea7434.m3u8` |
| 5 | `bmtol-unofficial-pejalang-km-265-000-b` | Tol Pejagan-Pemalang KM 265+000 B | HLS | `https://pptrlive.co.id/memfs/f7cce244-a03c-446d-89a4-07a5b0ae1719.m3u8` |
| 6 | `bmtol-unofficial-pejalang-km-299-700-b` | Tol Pejagan-Pemalang KM 299+700 B | HLS | `https://pptrlive.co.id/memfs/fa122671-2b5a-4156-87bb-9bc2742bb281.m3u8` |
| 7 | `bmtol-unofficial-pejalang-km-301-600-b` | Tol Pejagan-Pemalang KM 301+600 B | HLS | `https://pptrlive.co.id/memfs/d60147d5-5b77-400c-9776-03e7febd6ab5.m3u8` |
| 8 | `bmtol-unofficial-pejalang-km-306-700-b` | Tol Pejagan-Pemalang KM 306+700 B | HLS | `https://pptrlive.co.id/memfs/f291992a-5818-478f-a9ff-ee35bace1a36.m3u8` |
| 9 | `bmtol-unofficial-pejalang-km-299-700-a` | Tol Pejagan-Pemalang KM 299+700 A | HLS | `https://pptrlive.co.id/memfs/b0ebbe6a-1173-4a44-9625-97844400e8a2.m3u8` |
| 10 | `bmtol-unofficial-pejalang-km-301-600-a` | Tol Pejagan-Pemalang KM 301+600 A | HLS | `https://pptrlive.co.id/memfs/38232800-c4f2-4cef-99fa-edde1ce04c4c.m3u8` |
| 11 | `bmtol-unofficial-pejalang-km-306-700-a` | Tol Pejagan-Pemalang KM 306+700 A | HLS | `https://pptrlive.co.id/memfs/2489b488-da4c-45cb-922f-215c8b01ace0.m3u8` |
| 12 | `bmtol-unofficial-pejalang-km-250-000-b` | Tol Pejagan-Pemalang KM 250+000 B | HLS | `https://pptrlive.co.id/memfs/d23482ad-2d81-47fd-99dd-5e4e90322b5e.m3u8` |
| 13 | `bmtol-unofficial-pejalang-km-265-000-a` | Tol Pejagan-Pemalang KM 265+000 A | HLS | `https://pptrlive.co.id/memfs/ca42777e-6629-4dcf-a419-ca3dc4d299ef.m3u8` |
| 14 | `bmtol-unofficial-pejalang-km-254-000-a` | Tol Pejagan-Pemalang KM 254+000 A | HLS | `https://pptrlive.co.id/memfs/deab9067-a35a-4c40-9245-fc60c24a47b8.m3u8` |
| 15 | `bmtol-unofficial-pejalang-km-254-000-b` | Tol Pejagan-Pemalang KM 254+000 B | HLS | `https://pptrlive.co.id/memfs/c06197b1-c3ca-4677-a5c3-67bc90cb9591.m3u8` |
| 16 | `bmtol-unofficial-pejalang-km-261-000-a` | Tol Pejagan-Pemalang KM 261+000 A | HLS | `https://pptrlive.co.id/memfs/a730a136-4d68-4e54-bed5-0de76014d272.m3u8` |
| 17 | `bmtol-unofficial-pejalang-km-257-000-b` | Tol Pejagan-Pemalang KM 257+000 B | HLS | `https://pptrlive.co.id/memfs/6db8b404-624c-4041-9888-3dadf85b4f51.m3u8` |
| 18 | `bmtol-unofficial-pejalang-km-250-000-a` | Tol Pejagan-Pemalang KM 250+000 A | HLS | `https://pptrlive.co.id/memfs/be49f2cd-535e-49a1-89e7-99b80a97f683.m3u8` |
| 19 | `bmtol-unofficial-pejalang-km-260-000-b` | Tol Pejagan-Pemalang KM 260+000 B | HLS | `https://pptrlive.co.id/memfs/fe188de6-b336-4807-ace1-79f9d4ece915.m3u8` |
| 20 | `bmtol-unofficial-pejalang-km-260-000-a` | Tol Pejagan-Pemalang KM 260+000 A | HLS | `https://pptrlive.co.id/memfs/db727a06-dbbc-4124-aa8f-b0cc6bc5ca9f.m3u8` |
| 21 | `bmtol-unofficial-pejalang-km-261-000-b` | Tol Pejagan-Pemalang KM 261+000 B | HLS | `https://pptrlive.co.id/memfs/d7277184-e582-4b9d-bf0c-262bd7e7f023.m3u8` |
| 22 | `bmtol-unofficial-pejalang-km-268-000-a` | Tol Pejagan-Pemalang KM 268+000 A | HLS | `https://pptrlive.co.id/memfs/e20e7a2a-c748-4e1e-80ce-445cdbe8d408.m3u8` |

### Ciawi-Sukabumi Toll (6)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-bocimi-km-047-200-a` | Tol Ciawi-Sukabumi KM 47+200 A | HLS | `https://www.tjt-info.co.id/LiveApp/streams/796749052161901029073168.m3u8` |
| 2 | `bmtol-unofficial-bocimi-km-051-050-b` | Tol Ciawi-Sukabumi KM 51+050 B | HLS | `https://www.tjt-info.co.id/LiveApp/streams/211884290923669138161535.m3u8` |
| 3 | `bmtol-unofficial-bocimi-km-048-200` | Tol Ciawi-Sukabumi KM 48+200 | HLS | `https://www.tjt-info.co.id/LiveApp/streams/357514173892609384751207.m3u8` |
| 4 | `bmtol-unofficial-bocimi-km-055-000-a` | Tol Ciawi-Sukabumi KM 55+000 A | HLS | `https://www.tjt-info.co.id/LiveApp/streams/021325546274001698409340.m3u8` |
| 5 | `bmtol-unofficial-bocimi-km-053-380` | Tol Ciawi-Sukabumi KM 53+380 | HLS | `https://www.tjt-info.co.id/LiveApp/streams/998223146655371157400972.m3u8` |
| 6 | `bmtol-unofficial-bocimi-km-060-150` | Tol Ciawi-Sukabumi KM 60+150 | HLS | `https://www.tjt-info.co.id/LiveApp/streams/336845911722359113982848.m3u8` |

### Palimanan-Kanci Toll (4)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-palkan-km-194-750` | Tol Palimanan-Kanci KM 194+750 | HLS | `https://jmlive.jasamarga.com/hls/12/e5c46b00-50bb-430a-824f-2b5e8fd81dde/index.m3u8` |
| 2 | `bmtol-unofficial-palkan-km-204-000` | Tol Palimanan-Kanci KM 204+000 | HLS | `https://jmlive.jasamarga.com/hls/12/6850a7cc-5e2f-4335-a611-119617da766b/index.m3u8` |
| 3 | `bmtol-unofficial-palkan-km-211-400` | Tol Palimanan-Kanci KM 211+400 | HLS | `https://jmlive.jasamarga.com/hls/12/99effe0c-641b-4a04-8010-7dd168ad61d7/index.m3u8` |
| 4 | `bmtol-unofficial-palkan-km-215-000` | Tol Palimanan-Kanci KM 215+000 | HLS | `https://jmlive.jasamarga.com/hls/12/66586045-1fc2-44ea-bc1e-ac5244c82024/index.m3u8` |

### Pemalang-Batang Toll (3)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-pembat-km-319-000` | Tol Pemalang-Batang KM 319+000 | HLS | `https://live.pbtr.co.id:5443/LiveApp/streams/0319.m3u8` |
| 2 | `bmtol-unofficial-pembat-km-307-000` | Tol Pemalang-Batang KM 307+000 | HLS | `https://live.pbtr.co.id:5443/LiveApp/streams/0307.m3u8` |
| 3 | `bmtol-unofficial-pembat-km-344-000` | Tol Pemalang-Batang KM 344+000 | HLS | `https://live.pbtr.co.id:5443/LiveApp/streams/0344.m3u8` |

### Terbanggi Besar-Kayu Agung Toll (10)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-terpeka-km-235-000-b` | Tol Terbanggi Besar-Kayu Agung KM 235+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/8NTlenir7evp1671470440611.m3u8` |
| 2 | `bmtol-unofficial-terpeka-km-235-000-a` | Tol Terbanggi Besar-Kayu Agung KM 235+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Fuz1xSJSZ6VS1671608975102.m3u8` |
| 3 | `bmtol-unofficial-terpeka-km-214-000-b` | Tol Terbanggi Besar-Kayu Agung KM 214+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/y3173vty9vYS1672387738008.m3u8` |
| 4 | `bmtol-unofficial-terpeka-km-209-000-b` | Tol Terbanggi Besar-Kayu Agung KM 209+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/1LVctZlG1CpM1672387244952.m3u8` |
| 5 | `bmtol-unofficial-terpeka-km-207-000-a` | Tol Terbanggi Besar-Kayu Agung KM 207+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/bBOqwjkIE2ZJ1672387107936.m3u8` |
| 6 | `bmtol-unofficial-terpeka-km-173-000-b` | Tol Terbanggi Besar-Kayu Agung KM 173+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/Ylilp78L1kJw1675839859824.m3u8` |
| 7 | `bmtol-unofficial-terpeka-km-173-000-a` | Tol Terbanggi Besar-Kayu Agung KM 173+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/bPzYpO8EqsGg1675839839551.m3u8` |
| 8 | `bmtol-unofficial-terpeka-km-172-000-b` | Tol Terbanggi Besar-Kayu Agung KM 172+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/RtnUTRHFxW2s1677120541641.m3u8` |
| 9 | `bmtol-unofficial-terpeka-km-162-000-b` | Tol Terbanggi Besar-Kayu Agung KM 162+000 B | HLS | `https://pub2.hk-opt.com/LiveApp/streams/rdxGSmqvd5kN1675831415195.m3u8` |
| 10 | `bmtol-unofficial-terpeka-km-162-000-a` | Tol Terbanggi Besar-Kayu Agung KM 162+000 A | HLS | `https://pub2.hk-opt.com/LiveApp/streams/bAoUDud5E4YR1675822282333.m3u8` |

### Ngawi-Kertosono Toll (4)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-ngker-km-585-100` | Tol Ngawi-Kertosono KM 585+100 | HLS | `https://jmlive.jasamarga.com/hls/17/bc4e6ae3-a01f-4a70-b621-04a5fffbb034/index.m3u8` |
| 2 | `bmtol-unofficial-ngker-km-595-500` | Tol Ngawi-Kertosono KM 595+500 | HLS | `https://jmlive.jasamarga.com/hls/17/2da759dc-5ae6-480e-9abb-0e06a60562f0/index.m3u8` |
| 3 | `bmtol-unofficial-ngker-km-601-000` | Tol Ngawi-Kertosono KM 601+000 | HLS | `https://jmlive.jasamarga.com/hls/17/dc02c192-f8a7-4827-872f-5c89eb22501c/index.m3u8` |
| 4 | `bmtol-unofficial-ngker-km-602-800` | Tol Ngawi-Kertosono KM 602+800 | HLS | `https://jmlive.jasamarga.com/hls/17/11ea38f3-0f09-445f-a313-474a0a17a7ab/index.m3u8` |

### Kertosono-Mojokerto Toll (3)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-kermoj-km-687-000` | Tol Kertosono-Mojokerto KM 687+000 | HLS | `https://api-cctv.margaharjaya.co.id/hls/icjbgb/stream.m3u8` |
| 2 | `bmtol-unofficial-kermoj-km-678-000` | Tol Kertosono-Mojokerto KM 678+000 | HLS | `https://api-cctv.margaharjaya.co.id/hls/kdmdepanmasuk/stream.m3u8` |
| 3 | `bmtol-unofficial-kermoj-km-706-000` | Tol Kertosono-Mojokerto KM 706+000 | HLS | `https://api-cctv.margaharjaya.co.id/hls/icmbrb/stream.m3u8` |

### Semarang-Solo Toll (2)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-semsol-km-430-200` | Tol Semarang-Solo KM 430+200 | HLS | `https://jmlive.jasamarga.com/hls/15/ce512402-dfa3-4460-8bd6-41b2a31a31d7/index.m3u8` |
| 2 | `bmtol-unofficial-semsol-km-437-800` | Tol Semarang-Solo KM 437+800 | HLS | `https://jmlive.jasamarga.com/hls/15/357f6ad4-0868-4ad4-97f0-a3dd258e2349/index.m3u8` |

### Manado-Bitung Toll (3)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-manbit-km-17-700` | Tol Manado-Bitung KM 17+700 | HLS | `https://jmlive.jasamarga.com/hls/30/4d8ac410-f018-432a-8d34-530df2fb346d/index.m3u8` |
| 2 | `bmtol-unofficial-manbit-km-25-600` | Tol Manado-Bitung KM 25+600 | HLS | `https://jmlive.jasamarga.com/hls/30/e5272894-69dc-4f6d-a541-161ff8936772/index.m3u8` |
| 3 | `bmtol-unofficial-manbit-km-36-250` | Tol Manado-Bitung KM 36+250 | HLS | `https://jmlive.jasamarga.com/hls/30/9944cb69-86f3-4da2-826f-5200e5c691a5/index.m3u8` |

### Cimanggis-Cibitung Toll (14)

| # | ID | Nama | Format | URL |
|---:|---|---|---|---|
| 1 | `bmtol-unofficial-cimcib-km-56-000` | Tol Cimanggis-Cibitung KM 56+000 | HLS | `https://streaming-cct.co.id/LiveApp/streams/808428562383454739684500.m3u8` |
| 2 | `bmtol-unofficial-cimcib-km-55-650` | Tol Cimanggis-Cibitung KM 55+650 | HLS | `https://streaming-cct.co.id/LiveApp/streams/753814245775591052124656.m3u8` |
| 3 | `bmtol-unofficial-cimcib-km-55-400` | Tol Cimanggis-Cibitung KM 55+400 | HLS | `https://streaming-cct.co.id/LiveApp/streams/419578865556916403624234.m3u8` |
| 4 | `bmtol-unofficial-cimcib-km-55-000` | Tol Cimanggis-Cibitung KM 55+000 | HLS | `https://streaming-cct.co.id/LiveApp/streams/240320474473743062493512.m3u8` |
| 5 | `bmtol-unofficial-cimcib-km-54-400` | Tol Cimanggis-Cibitung KM 54+400 | HLS | `https://streaming-cct.co.id/LiveApp/streams/042926552556500254096382.m3u8` |
| 6 | `bmtol-unofficial-cimcib-km-54-000` | Tol Cimanggis-Cibitung KM 54+000 | HLS | `https://streaming-cct.co.id/LiveApp/streams/513568218162926065451774.m3u8` |
| 7 | `bmtol-unofficial-cimcib-km-53-500` | Tol Cimanggis-Cibitung KM 53+500 | HLS | `https://streaming-cct.co.id/LiveApp/streams/728033679170510237677933.m3u8` |
| 8 | `bmtol-unofficial-cimcib-km-70-400` | Tol Cimanggis-Cibitung KM 70+400 | HLS | `https://streaming-cct.co.id/LiveApp/streams/871311996681478545431857.m3u8` |
| 9 | `bmtol-unofficial-cimcib-km-65-800` | Tol Cimanggis-Cibitung KM 65+800 | HLS | `https://streaming-cct.co.id/LiveApp/streams/380686335677885377945037.m3u8` |
| 10 | `bmtol-unofficial-cimcib-km-64-400` | Tol Cimanggis-Cibitung KM 64+400 | HLS | `https://streaming-cct.co.id/LiveApp/streams/167013141883764986350307.m3u8` |
| 11 | `bmtol-unofficial-cimcib-km-61-600` | Tol Cimanggis-Cibitung KM 61+600 | HLS | `https://streaming-cct.co.id/LiveApp/streams/859389239238521120834932.m3u8` |
| 12 | `bmtol-unofficial-cimcib-km-59-400` | Tol Cimanggis-Cibitung KM 59+400 | HLS | `https://streaming-cct.co.id/LiveApp/streams/309234587115641908709722.m3u8` |
| 13 | `bmtol-unofficial-cimcib-km-51-000` | Tol Cimanggis-Cibitung KM 51+000 | HLS | `https://streaming-cct.co.id/LiveApp/streams/418964061815952674729554.m3u8` |
| 14 | `bmtol-unofficial-cimcib-km-68-000` | Tol Cimanggis-Cibitung KM 68+000 | HLS | `https://streaming-cct.co.id/LiveApp/streams/507909711721836488619938.m3u8` |
