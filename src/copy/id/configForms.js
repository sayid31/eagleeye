// src/copy/id/configForms.js
/**
 * Indonesian copy of Umum, Persona and Pemakaian & Biaya (the voice-settings forms). Re-exported by config.js.
 * Pure data; the tool-group texts translate the server's English labels, which also go into the voice prompt.
 *
 * @module copy/id/configForms
 */

export const GENERAL_COPY = Object.freeze({
  title: 'Umum',
  description: 'Asisten suara: aktif atau nonaktif, nama, izin tools, dan batas sesi. Perubahan berlaku mulai sesi suara berikutnya.',
  loading: 'Memuat pengaturan',
  loadError: 'Pengaturan tidak bisa dimuat',
  storedInvalid: 'File pengaturan tersimpan tidak bisa dibaca. Pengaturan bawaan berlaku sampai Anda menyimpan.',
  enforced: {
    title: 'Yang berlaku sekarang',
    voice: 'Suara', coreRules: 'Aturan inti', topics: 'Batasan topik',
    topicsCount: (count) => `Batasan topik (${count})`,
    tools: (on, total) => `Grup tools (${on} dari ${total})`,
  },
  assistant: {
    title: 'Asisten',
    description: 'Aktif atau nonaktif, nama, dan gaya bicara.',
    enabled: { title: 'Asisten suara aktif', description: 'Nonaktif: tombol mic menolak memulai sesi baru.' },
    name: { label: 'Nama asisten', description: (max) => `Opsional, maksimal ${max} karakter. Kosong memakai nama bawaan.` },
    notes: {
      label: 'Catatan kepribadian',
      description: 'Hanya nada dan gaya bahasa. Selalu di bawah aturan inti; tidak bisa mengubah tools atau aturan.',
      placeholder: 'Contoh: ramah, singkat, memakai bahasa sehari-hari.',
    },
  },
  tools: {
    title: 'Izin tools',
    description: 'Grup yang nonaktif sama sekali tidak ditawarkan ke model suara, jadi tool di dalamnya tidak bisa dipanggil.',
    group: (label, count) => `${label} (${count} tools)`,
  },
  limits: {
    title: 'Batas sesi',
    description: 'Sesi ditutup otomatis saat batas tercapai. Kosongkan kolom untuk mematikan batas itu.',
    placeholder: 'Tanpa batas',
    range: (min, max, unit) => `${min}–${max} ${unit}`,
    hardCap: (max) => `Batas keras ${max} menit: satu sesi suara selalu berakhir paling lama ${max} menit, berapa pun nilai di sini. Nilai di atas ${max} tetap bisa disimpan tetapi tidak berlaku.`,
    aboveCap: (value, max) => `Nilai ${value} menit melebihi batas keras. Sesi tetap berakhir pada ${max} menit.`,
    fields: {
      dailyMinutes: { label: 'Menit suara per hari', unit: 'menit' },
      sessionMinutes: { label: 'Durasi sesi maksimal', unit: 'menit' },
      idleSeconds: { label: 'Tutup saat diam setelah', unit: 'detik' },
    },
    invalidSummary: 'Periksa isian batas sesi yang ditandai.',
    invalid: (label, min, max, unit) => `${label}: isi bilangan bulat ${min}–${max} ${unit}, atau kosongkan untuk tanpa batas.`,
    reset: 'Kembalikan batas bawaan',
  },
  toolGroups: {
    readOnly: { label: 'Hanya baca', description: 'Melihat isi layar dan menjawab pertanyaan tentangnya.' },
    camera: { label: 'Kamera & navigasi', description: 'Terbang, zoom, menggerakkan kamera, dan melacak pesawat atau kapal.' },
    display: { label: 'Tampilan & layer', description: 'Menyalakan atau mematikan layer, panel, HUD, gaya visual, basemap, dan skenario.' },
    media: { label: 'Media (CCTV & radio)', description: 'Membuka video CCTV pihak ketiga dan streaming radio internet.' },
    annotate: { label: 'Menggambar di peta', description: 'Menggambar tanda, area, dan rute di peta, lalu menghapusnya.' },
  },
  disableVoice: {
    title: 'Nonaktifkan asisten suara?',
    impact: 'Tombol mic akan menolak memulai sesi baru untuk semua pengguna. Sesi yang sedang berjalan tidak terputus. Bisa diaktifkan lagi kapan saja.',
    action: 'Nonaktifkan dan simpan',
  },
  resetLimits: {
    title: 'Kembalikan batas sesi ke bawaan?',
    impact: 'Ketiga batas di atas diisi dengan nilai bawaan aplikasi. Belum tersimpan sampai Anda menekan Simpan perubahan.',
    action: 'Kembalikan batas bawaan',
  },
  saved: 'Pengaturan tersimpan. Sesi suara baru memakai pengaturan ini; sesi yang sedang berjalan tetap memakai yang lama.',
});

export const PERSONA_COPY = Object.freeze({
  title: 'Persona',
  description: 'Satu gaya bicara tetap. Nama dan catatan kepribadian ada di halaman Umum; keduanya selalu di bawah aturan di sini.',
  loading: 'Memuat persona',
  loadError: 'Persona tidak bisa dimuat',
  core: {
    title: 'Aturan inti',
    description: 'Selalu berlaku dan terkunci. Dikirim di setiap sesi suara. Aturan berlabel Prompt hanya instruksi ke model dan bisa meleset; judge di Server Log mencatat jawaban yang keluar topik.',
    summary: (rules, groups, backed) => `${rules} aturan dalam ${groups} grup. ${backed} juga dijaga kode aplikasi, sisanya hanya oleh prompt suara.`,
    group: (rules, backed) => (backed ? `${rules} aturan · ${backed} dijaga kode` : `${rules} aturan`),
    forbid: 'Dilarang',
    instead: 'Gantinya',
    guards: { prompt: 'Prompt', 'prompt+code': 'Prompt + kode' },
  },
  extra: {
    title: 'Aturan tambahan',
    description: (max) => `Tambahkan maksimal ${max}. Hanya bisa menambah larangan; aturan yang mencoba melonggarkan aturan inti diabaikan asisten.`,
    guidance: 'Tulis satu larangan yang spesifik dan gantinya yang konkret. Larangan yang samar mudah dilewati model.',
    emptyTitle: 'Belum ada aturan tambahan',
    emptyDescription: 'Aturan inti sudah menjaga asisten tetap di konsol ini. Tambahkan aturan bila perlu mempersempit lagi.',
    add: 'Tambah aturan',
    remove: (index) => `Hapus aturan tambahan ${index}`,
    removeShort: 'Hapus aturan',
    ruleLabel: (index) => `Aturan tambahan ${index}`,
    forbidLabel: 'Dilarang',
    insteadLabel: 'Gantinya',
    forbidPlaceholder: 'Contoh: Membahas skor sepak bola',
    insteadPlaceholder: 'Contoh: Tolak dalam satu kalimat dan tawarkan bantuan peta',
    counter: (used, max) => `${used}/${max} karakter`,
  },
  topics: {
    title: 'Batasan topik',
    description: 'Aturan inti sudah menjaga asisten tetap di konsol ini. Daftar opsional ini mempersempit percakapan lagi. Berbasis prompt (upaya terbaik); perintah aplikasi dan pertanyaan seperti "ini di mana" tidak pernah ditolak.',
    enabled: 'Batasi hanya ke topik ini',
    allowed: { label: 'Topik yang diizinkan', description: (max) => `Satu per baris, maksimal ${max}.`, placeholder: 'Contoh: penerbangan\npelayaran\ncuaca' },
    refusal: { label: 'Kalimat penolakan', description: (max) => `Satu kalimat, maksimal ${max} karakter. Kosong memakai kalimat bawaan.` },
  },
  validation: {
    topicsEmpty: 'Batasan topik aktif: tambahkan minimal satu topik yang diizinkan (satu per baris).',
    ruleHalf: (index) => `Aturan tambahan ${index}: isi kolom Dilarang dan Gantinya.`,
    ruleLong: (index, max) => `Aturan tambahan ${index}: maksimal ${max} karakter per kolom.`,
    tooMany: (max) => `Maksimal ${max} aturan tambahan.`,
  },
  reset: {
    button: 'Kembalikan ke bawaan',
    title: 'Kembalikan persona ke bawaan?',
    impact: 'Semua aturan tambahan dihapus dan batasan topik dinonaktifkan. Aturan inti tidak berubah. Belum tersimpan sampai Anda menekan Simpan perubahan.',
    action: 'Kembalikan ke bawaan',
  },
  saved: 'Persona tersimpan. Sesi suara baru memakai aturan ini; sesi yang sedang berjalan tetap memakai yang lama.',
});

export const USAGE_AI_COPY = Object.freeze({
  title: 'Pemakaian & Biaya',
  description: 'Perkiraan dari meter mic sendiri, bukan tagihan OpenAI.',
  loading: 'Memuat pemakaian AI',
  loadError: 'Pemakaian & Biaya tidak bisa dimuat',
  today: {
    title: 'Hari ini',
    cost: 'Perkiraan biaya',
    audio: 'Audio terpakai',
    noLimit: (used) => `${used} terpakai hari ini. Tanpa batas harian.`,
    used: (used, daily) => `${used} dari ${daily} menit terpakai hari ini`,
    left: (left) => `Sisa ${left}.`,
    reached: 'Batas tercapai: sesi baru ditolak sampai tengah malam.',
    meterLabel: 'Menit suara hari ini',
  },
  daily: {
    title: 'Pemakaian harian',
    caption: 'Pemakaian harian',
    range: 'Rentang waktu',
    rangeOption: (days) => `${days} hari`,
    columns: { day: 'Hari', sessions: 'Sesi', audio: 'Audio', extras: 'Baca layar', judge: 'Panggilan judge', cost: 'Perkiraan biaya' },
    total: 'Total',
    emptyTitle: 'Belum ada pemakaian',
    emptyDescription: 'Belum ada sesi suara pada rentang waktu ini.',
    session: (count) => `${count} sesi`,
  },
  limits: {
    title: 'Batas biaya per sesi',
    description: (warn, cap) => `Kosong memakai default bawaan (peringatan ${warn}, berhenti ${cap}). Isi "off" untuk tanpa batas.`,
    effective: (warn, cap) => `Berlaku sekarang: peringatan ${warn}, batas keras ${cap}.`,
    off: 'nonaktif',
    warn: { label: 'Peringatan (USD)', placeholder: 'Bawaan' },
    cap: { label: 'Batas keras (USD)', placeholder: 'Bawaan' },
    invalid: 'Batas biaya: isi jumlah dolar, "off", atau kosongkan untuk default bawaan.',
    save: 'Simpan batas',
    saved: 'Batas biaya tersimpan. Berlaku mulai sesi suara berikutnya.',
  },
  rates: {
    title: 'Harga untuk perkiraan',
    description: (date) => `Tarif dicek pada ${date}; cocokkan dengan harga OpenAI saat rilis.`,
    live: (model, perMin) => `Audio live (${model}): $${perMin} per menit, ditagih per detik.`,
    reader: (model, input, output) => `Pembaca layar (${model}): $${input} / $${output} per 1 juta token input / output.`,
    excluded: 'Tidak termasuk: backend model yang didelegasikan dan tool call-nya, yang ditagih terpisah oleh OpenAI.',
    judge: (model, input, output, enabled) => `Judge keluar topik (${model}): $${input} / $${output} per 1 juta token input / output, sekitar $0.0002 per jawaban yang dinilai; ${enabled ? 'termasuk di tabel harian (Panggilan judge).' : 'sedang nonaktif.'}`,
  },
});
