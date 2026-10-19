// Static skeleton of the camera search. Dynamic text (camera names come from
// third-party catalogs) is filled in with textContent by the controller, never
// interpolated here.
/** @returns {string} Search HTML, inserted after the CCTV panel header. */
export function inspectorMarkup() {
  return `
<section id="cam-inspector" class="cam-inspector" aria-label="Cari kamera">
  <div class="cam-search">
    <span class="material-symbols-outlined" aria-hidden="true">search</span>
    <input id="cam-search-input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Cari kamera CCTV" aria-label="Cari kamera CCTV" aria-controls="cam-search-results" />
  </div>
  <ul id="cam-search-results" class="cam-search-results" aria-label="Hasil pencarian kamera" hidden></ul>
</section>`;
}
