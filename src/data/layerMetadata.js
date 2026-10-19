/**
 * Single source of truth for toggle-panel display metadata (id, name, icon,
 * source, showInTogglePanel, hasRowControls) for every layer that is (or is
 * being converted to) a `registerLazy(...)` entry in `manager.js`.
 *
 * Each in-scope layer file spreads its slice of this object into its own
 * layer literal instead of duplicating the fields inline — a one-directional
 * dependency (layer files import this, never the reverse), so there is no
 * circular-import risk. `manager.js`'s `_registerLayer` (eager path) also
 * computes an equivalent `staticMeta` straight off the module itself, so
 * `getAll()`/`_renderToggles()` have one uniform read regardless of whether
 * a layer is eager or lazy (see `layerMetadata.test.mjs` for the drift
 * guard between the two).
 *
 * `localLayers.js`'s 4 bundled layers (dams, datacenters, submarine cables,
 * fires) are OUT OF SCOPE — they stay eager and keep their metadata inline.
 * Do not add them here without also wiring a corresponding `registerLazy`
 * conversion; an entry here with no matching lazy registration is dead
 * weight, not a head start.
 */
export const LAYER_METADATA = Object.freeze({
  flights: Object.freeze({
    id: 'flights',
    name: 'Live Flights',
    icon: '✈️',
    source: 'OpenSky Network',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  military: Object.freeze({
    id: 'military',
    name: 'Military Flights',
    icon: '🎖️',
    source: 'adsb.lol',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  traffic: Object.freeze({
    id: 'traffic',
    name: 'Street Traffic',
    icon: '🚗',
    source: 'OpenStreetMap',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  satellites: Object.freeze({
    id: 'satellites',
    name: 'Satellites',
    icon: '🛰️',
    source: 'CelesTrak',
    showInTogglePanel: true,
    hasRowControls: true,
  }),
  cctv: Object.freeze({
    id: 'cctv',
    name: 'CCTV',
    icon: '📹',
    source: 'CCTV + cadangan Street View',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  radio: Object.freeze({
    id: 'radio',
    name: 'Radio',
    icon: '◉',
    source: 'Radio Browser',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  bikeshare: Object.freeze({
    id: 'bikeshare',
    name: 'Bikeshare',
    icon: '🚲',
    source: 'GBFS',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  'ais-live-vessels': Object.freeze({
    id: 'ais-live-vessels',
    name: 'Live AIS Vessels',
    icon: '◭',
    source: 'AISStream',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  'rocket-launches': Object.freeze({
    id: 'rocket-launches',
    name: 'Space Missions (30d)',
    icon: '🚀',
    source: 'Launch Library 2',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  'military-installations': Object.freeze({
    id: 'military-installations',
    name: 'Mapped Installations',
    icon: '⌖',
    source: 'OpenStreetMap + Google Maps Places (opsional)',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
  'military-awareness': Object.freeze({
    id: 'military-awareness',
    name: 'Global Context',
    icon: '◎',
    source: 'Konteks kedekatan sumber terbuka',
    // Context is entered from its dedicated right rail, not as a raw layer.
    showInTogglePanel: false,
    hasRowControls: false,
  }),
  earthquakes: Object.freeze({
    id: 'earthquakes',
    name: 'Earthquakes (24h)',
    icon: '🌋',
    source: 'USGS',
    showInTogglePanel: true,
    hasRowControls: false,
  }),
});
