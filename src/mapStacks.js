/**
 * Map stack catalogue: the basemap choices and the upstream endpoints and
 * credits they draw from. Data only — `MapStackController` owns switching.
 * Split out of mapStackController.js (file-health pass, 2026-11-12).
 *
 * @module mapStacks
 */
import * as Cesium from 'cesium';

export const MAP_STACKS = [
  {
    id: 'photoreal',
    label: 'Google 3D',
    shortLabel: '3D',
    kind: 'photoreal',
    requiresIon: false,
  },
  {
    id: 'bing-aerial',
    label: 'Bing Aerial',
    shortLabel: 'Aerial',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL,
    requiresIon: true,
  },
  {
    id: 'bing-labels',
    label: 'Bing Labels',
    shortLabel: 'Labels',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    requiresIon: true,
  },
  {
    id: 'esri-imagery',
    label: 'Esri Satellite',
    shortLabel: 'SAT',
    kind: 'esri-imagery',
    requiresIon: false,
  },
  {
    id: 'esri-dark-gray',
    label: 'Esri Dark Gray',
    shortLabel: 'DARK',
    kind: 'esri-dark-gray',
    requiresIon: false,
  },
  {
    id: 'osm',
    label: 'OSM',
    shortLabel: 'OSM',
    kind: 'osm',
    requiresIon: false,
  },
];

export const DEFAULT_OSM_CREDIT = '© OpenStreetMap contributors';

// Esri World Imagery — the keyless satellite basemap and the default keyless
// landing (a spy-satellite simulator should open on satellite imagery, not a
// street map). The classic ArcGIS Online tile service answers without a key;
// attribution is required and the provider carries the service's own credit
// line. Terms note in DATA_SOURCES.md.
export const ESRI_WORLD_IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
export const ESRI_IMAGERY_CREDIT =
  'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
// Esri Dark Gray Canvas — a second keyless classic ArcGIS Online service, same
// no-key/attribution-required terms as World Imagery above (DATA_SOURCES.md).
// A muted dark basemap meant to pair with this app's HUD visual styles rather
// than compete with them the way a bright satellite image does.
export const ESRI_DARK_GRAY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer';
export const ESRI_DARK_GRAY_CREDIT = 'Powered by Esri — Source: Esri, HERE, Garmin, and the GIS User Community';
// The on-screen notice Esri requires when a third-party library draws its
// service. Rendered via an explicit static credit (see _syncEsriAttribution) —
// the provider's own `credit` option is ignored for tiled ArcGIS servers.
export const ESRI_ATTRIBUTION_HTML =
  '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a>';
// Every stack that draws an Esri-hosted classic ArcGIS Online tile service —
// shares one on-screen attribution credit and one OSM tile-failure fallback
// watchdog (see _syncEsriAttribution / _watchEsriProvider). A stack id added
// here automatically inherits both; omitting a real Esri stack would silently
// leave it without either.
export const ESRI_ATTRIBUTED_STACK_IDS = new Set(['esri-imagery', 'esri-dark-gray']);

// Keyless global ellipsoidal terrain (Re:Earth Terrain / Mapterhorn, CC BY 4.0,
// EGM2008 geoid via NGA) — quantized-mesh 1.0, `ellipsoid` data-type. Fixes
// regime C (keyless globe stacks previously rendered a flat
// EllipsoidTerrainProvider — see docs/superpowers/specs/2026-07-05-entity-height-datum-design.md
// §1a). Constructed via `.fromUrl()`, never a hand-built `{z}/{x}/{y}.terrain`
// URL (review correction, spec §1a).
export const REEARTH_TERRAIN_URL = 'https://terrain.reearth.land/cesium-mesh/ellipsoid';
