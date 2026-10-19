// Static skeleton of the camera inspector. Dynamic text (camera names come
// from third-party catalogs) is filled in with textContent by the controller,
// never interpolated here.
/** @returns {string} Inspector HTML, inserted after the CCTV panel header. */
export function inspectorMarkup() {
  return `
<section id="cam-inspector" class="cam-inspector" aria-label="Detail kamera">
  <div class="cam-search">
    <span class="material-symbols-outlined" aria-hidden="true">search</span>
    <input id="cam-search-input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Cari kamera CCTV" aria-label="Cari kamera CCTV" aria-controls="cam-search-results" />
  </div>
  <ul id="cam-search-results" class="cam-search-results" aria-label="Hasil pencarian kamera" hidden></ul>
  <div id="cam-inspector-empty" class="cam-inspector-empty">Pilih kamera untuk melihat detailnya.</div>
  <div id="cam-inspector-body" hidden>
    <div class="cam-inspector-head">
      <div class="cam-inspector-title">
        <strong id="cam-inspector-name"></strong>
        <span id="cam-inspector-city"></span>
      </div>
      <button type="button" id="cam-inspector-close" class="cam-inspector-close" aria-label="Tutup detail kamera">×</button>
    </div>
    <div id="cam-inspector-badges" class="cam-inspector-badges"></div>
    <dl id="cam-inspector-rows" class="cam-inspector-rows"></dl>
    <div class="cam-inspector-actions">
      <button type="button" id="cam-inspector-center" class="cam-inspector-btn cam-inspector-btn-primary">Pusatkan di peta</button>
      <button type="button" id="cam-inspector-calibrate" class="cam-inspector-btn" aria-pressed="false">Kalibrasi posisi</button>
    </div>
    <h3 class="cam-inspector-subhead">Kamera terdekat</h3>
    <ul id="cam-inspector-nearby" class="cam-inspector-nearby"></ul>
  </div>
  <button type="button" id="cam-inspector-advanced" class="cam-inspector-advanced" aria-expanded="false" aria-controls="cctv-panel">Cari manual</button>
</section>`;
}
