# split-codemods-2026 — one-shot split scripts (archived)

Ini script sekali-pakai yang dipakai untuk split 16 file besar pada Oktober 2026
(branch `refactor/split-oversized-files`). **Jangan dijalankan ulang tanpa review
manual dulu.**

Kenapa berbahaya dijalankan ulang:

- `split.mjs --write` dan `splitclass.mjs --write` MENIMPA file induk
  (`src/ui.js`, `src/data/manager.js`, dst.) dan menulis modul sibling. File induk
  sekarang sudah versi hasil split, jadi menjalankannya lagi akan merusak kode.
- Semua cfg di `cfg/` menunjuk file asli sebelum split (`git show HEAD:<file>`
  dipakai sebagai pembanding), jadi hasilnya tidak bermakna di HEAD sekarang.
- Path internal masih `scripts/tmp-split/...`, jadi dari lokasi ini script memang
  tidak akan jalan apa adanya. Itu disengaja sebagai pengaman tambahan.

Isi (hanya referensi):

| File | Fungsi |
|---|---|
| `split.mjs`, `verify.mjs` | codemod layer object-literal (state `S`) + verifikasi reverse-diff |
| `splitclass.mjs`, `verifyclass.mjs` | class → mixin (`Object.assign(Class.prototype, …)`) + verifikasi verbatim |
| `freevars.mjs`, `lib.mjs`, `outline.mjs`, `analyze.mjs` | pembantu parse AST / free-variable check |
| `run.mjs`, `reverse.mjs`, `review.mjs`, `probe.mjs` | alat pilot awal (cctv) |
| `cfg/*.mjs`, `meta.*.json` | konfigurasi pemetaan fungsi→modul per file dan metadata hasil |

Jika perlu split lagi: mulai dari checkout bersih, salin ke `scripts/`, sesuaikan
path, jalankan tanpa `--write` dulu, dan bandingkan hasil dengan verifier.
