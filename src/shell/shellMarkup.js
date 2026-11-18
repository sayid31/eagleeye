// Static markup for the shell chrome (top bar, left icon rail, status bar).
// Strings only, so the structure is testable without a DOM.

/** Rail buttons proxy a click to an existing control, so no behavior is duplicated. */
export const RAIL_ITEMS = Object.freeze([
  { id: 'layers', label: 'Data layers', icon: 'layers', target: '.panel-collapse-btn[data-collapse-target="data-panel"]' },
  { id: 'camera', label: 'Camera', icon: 'videocam', target: '.panel-collapse-btn[data-collapse-target="cctv-panel"]' },
  { id: 'scenes', label: 'Skenario', icon: 'movie', target: '.panel-collapse-btn[data-collapse-target="scene-panel"]' },
  { id: 'display', label: 'View', icon: 'tune', target: '.panel-collapse-btn[data-collapse-target="pp-toggles"]' },
  { id: 'context', label: 'Context', icon: 'monitoring', target: '.panel-collapse-btn[data-collapse-target="global-context-panel"]' },
]);

/** Rail slot the controller moves the visual-style picker (#control-panel) into. */
export const RAIL_STYLE_SLOT_ID = 'shell-rail-style-slot';

/** @returns {string} Top bar: search, source-health chips, UTC clock. */
export function topBarMarkup() {
  return `
  <header id="shell-topbar" aria-label="Top bar">
    <div class="shell-search" role="search">
      <span class="material-symbols-outlined" aria-hidden="true">search</span>
      <input id="shell-search-input" type="text" autocomplete="off" spellcheck="false"
        placeholder="Search location" aria-label="Search location" />
      <kbd class="ee-mono" aria-hidden="true">Ctrl K</kbd>
    </div>
    <div id="shell-health" class="shell-chip" role="status" aria-live="polite">
      <span class="shell-dot" data-tone="ok"></span><span id="shell-health-live">Live sources: 0</span>
      <span id="shell-health-degraded-wrap" hidden><span class="shell-dot" data-tone="warn"></span><span id="shell-health-degraded"></span></span>
    </div>
    <div id="shell-clock" class="shell-chip ee-mono" aria-label="UTC time">UTC --:--:--</div>
  </header>`;
}

/** @returns {string} Left icon rail. */
export function railMarkup() {
  const button = (item) => `
      <button type="button" class="shell-rail-btn" data-rail-id="${item.id}" aria-label="${item.label}" title="${item.label}">
        <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
      </button>`;
  return `
  <nav id="shell-rail" aria-label="Navigasi utama">
    <div class="shell-rail-group">${RAIL_ITEMS.map(button).join('')}</div>
    <div class="shell-rail-group" id="${RAIL_STYLE_SLOT_ID}"></div>
  </nav>`;
}

/** @returns {string} Bottom status bar; the imagery attribution is the real #cesium-credits. */
export function statusBarMarkup() {
  return `
  <footer id="shell-statusbar" aria-label="Camera position status" class="ee-mono">
    <span id="shell-coords">—</span>
    <span id="shell-mgrs">—</span>
    <span id="shell-alt">—</span>
  </footer>`;
}
