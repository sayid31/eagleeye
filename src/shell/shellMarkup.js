// Static markup for the shell chrome (top bar, left icon rail, status bar).
// Strings only, so the structure is testable without a DOM.

/** Rail buttons proxy a click to an existing control, so no behavior is duplicated. */
export const RAIL_ITEMS = Object.freeze([
  { id: 'layers', label: 'Layer data', icon: 'layers', target: '.panel-collapse-btn[data-collapse-target="data-panel"]' },
  { id: 'camera', label: 'Kamera', icon: 'videocam', target: '.panel-collapse-btn[data-collapse-target="cctv-panel"]' },
  { id: 'scenes', label: 'Skenario', icon: 'movie', target: '.panel-collapse-btn[data-collapse-target="scene-panel"]' },
  { id: 'display', label: 'Tampilan', icon: 'tune', target: '.panel-collapse-btn[data-collapse-target="pp-toggles"]' },
  { id: 'context', label: 'Konteks', icon: 'monitoring', target: '.panel-collapse-btn[data-collapse-target="global-context-panel"]' },
  { id: 'reset', label: 'Pusatkan globe', icon: 'public', target: '#reset-globe-view' },
  { id: 'share', label: 'Bagikan tampilan', icon: 'share', target: '#share-btn', bottom: true },
]);

/** @returns {string} Top bar: search, source-health chips, UTC clock. */
export function topBarMarkup() {
  return `
  <header id="shell-topbar" aria-label="Bilah atas">
    <div class="shell-search" role="search">
      <span class="material-symbols-outlined" aria-hidden="true">search</span>
      <input id="shell-search-input" type="text" autocomplete="off" spellcheck="false"
        placeholder="Cari lokasi" aria-label="Cari lokasi" />
      <kbd class="ee-mono" aria-hidden="true">Ctrl K</kbd>
    </div>
    <div id="shell-health" class="shell-chip" role="status" aria-live="polite">
      <span class="shell-dot" data-tone="ok"></span><span id="shell-health-live">0 sumber live</span>
      <span id="shell-health-degraded-wrap" hidden><span class="shell-dot" data-tone="warn"></span><span id="shell-health-degraded"></span></span>
    </div>
    <div id="shell-clock" class="shell-chip ee-mono" aria-label="Waktu UTC">UTC --:--:--</div>
  </header>`;
}

/** @returns {string} Left icon rail. */
export function railMarkup() {
  const button = (item) => `
      <button type="button" class="shell-rail-btn" data-rail-id="${item.id}" aria-label="${item.label}" title="${item.label}">
        <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
      </button>`;
  const top = RAIL_ITEMS.filter((item) => !item.bottom).map(button).join('');
  const bottom = RAIL_ITEMS.filter((item) => item.bottom).map(button).join('');
  return `
  <nav id="shell-rail" aria-label="Navigasi utama">
    <div class="shell-rail-group">${top}</div>
    <div class="shell-rail-group">${bottom}</div>
  </nav>`;
}

/** @returns {string} Bottom status bar; the imagery attribution is the real #cesium-credits. */
export function statusBarMarkup() {
  return `
  <footer id="shell-statusbar" aria-label="Status posisi kamera" class="ee-mono">
    <span id="shell-coords">—</span>
    <span id="shell-mgrs">—</span>
    <span id="shell-alt">—</span>
  </footer>`;
}
