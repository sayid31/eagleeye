// Static skeleton of the camera search. Dynamic text (camera names come from
// third-party catalogs) is filled in with textContent by the controller, never
// interpolated here.
/** @returns {string} Search + "Cari manual" HTML, inserted after the CCTV panel header. */
export function inspectorMarkup() {
  return `
<section id="cam-inspector" class="cam-inspector" aria-label="Cari kamera">
  <div class="cam-search">
    <span class="material-symbols-outlined" aria-hidden="true">search</span>
    <input id="cam-search-input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Cari kamera CCTV" aria-label="Cari kamera CCTV" aria-controls="cam-search-results" />
  </div>
  <ul id="cam-search-results" class="cam-search-results" aria-label="Hasil pencarian kamera" hidden></ul>
  <button type="button" id="cam-inspector-advanced" class="cam-inspector-advanced" aria-expanded="false" aria-controls="cctv-panel">Cari manual</button>
</section>`;
}
