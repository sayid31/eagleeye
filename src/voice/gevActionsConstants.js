// Moved out of gevActions.js (gevActionsConstants).



export const ALLOWED_STYLES = new Set(['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir', 'snow']);

export const PANEL_ALIASES = new Map([
  ['data', 'data-panel'],
  ['data layers', 'data-panel'],
  ['layers', 'data-panel'],
  ['layer menu', 'data-panel'],
  ['data layer menu', 'data-panel'],
  ['locations', 'location-bar'],
  ['location', 'location-bar'],
  ['styles', 'control-panel'],
  ['filters', 'control-panel'],
  ['visual styles', 'control-panel'],
  ['cctv', 'cctv-panel'],
  ['cameras', 'cctv-panel'],
  ['radio', 'radio-panel'],
  ['internet radio', 'radio-panel'],
  ['radio stations', 'radio-panel'],
  ['context', 'global-context-panel'],
  ['context panel', 'global-context-panel'],
  ['global context', 'global-context-panel'],
  ['right context', 'global-context-panel'],
  ['context right panel', 'global-context-panel'],
  ['scenes', 'scene-panel'],
  ['scene', 'scene-panel'],
  ['post processing', 'pp-toggles'],
  ['hud controls', 'pp-toggles'],
  ['map stack', 'control-panel'],
  ['stack', 'control-panel'],
  ['basemap', 'control-panel'],
  ['map sources', 'control-panel'],
  ['sources', 'control-panel'],
]);

export const PANEL_IDS = new Set(['data-panel', 'location-bar', 'control-panel', 'cctv-panel', 'radio-panel', 'global-context-panel', 'scene-panel', 'pp-toggles']);

export const CONTEXT_MODE_ALIASES = new Map([
  ['off', 'off'],
  ['none', 'off'],
  ['clear', 'off'],
  ['contacts', 'flights'],
  ['contact', 'flights'],
  ['flights', 'flights'],
  ['space missions', 'space-missions'],
  ['space-mission', 'space-missions'],
  ['space mission', 'space-missions'],
  ['space-missions', 'space-missions'],
  ['missions', 'space-missions'],
]);

/**
 * Every model-readable field that carries a context-mode id, and what an
 * absent value means for each.
 *
 * `mode` always names a mode, so nothing is 'off'. `entering` and `priorMode`
 * are absent when there is no such mode at all — calling those 'off' would
 * assert a state that does not exist.
 */
export const CONTEXT_MODE_RESULT_FIELDS = Object.freeze([
  { field: 'mode', emptyAs: 'off' },
  { field: 'entering', emptyAs: null },
  { field: 'priorMode', emptyAs: null },
]);

/** Nested results that are themselves context-mode payloads the model reads. */
export const NESTED_CONTEXT_RESULT_FIELDS = Object.freeze(['context', 'contextRollback']);

export const COCKPIT_ACTION_ALIASES = new Map([
  ['next', 'next'],
  ['previous', 'previous'],
  ['prev', 'previous'],
  ['enter', 'enter'],
  ['exit', 'exit'],
  ['status', 'status'],
  ['state', 'status'],
  ['next military', 'next'],
  ['next military aircraft', 'next'],
  ['next helicopter', 'next'],
  ['next closest', 'next'],
  ['next closest helicopter', 'next'],
  ['next closest military', 'next'],
  ['go to next', 'next'],
]);

export const COCKPIT_TARGET_LAYERS = new Set(['flights', 'military', 'ais-live-vessels', 'military-installations']);

export const LAYER_ALIASES = new Map([
  ['flights', 'flights'],
  ['planes', 'flights'],
  ['aircraft', 'flights'],
  ['military', 'military'],
  ['military flights', 'military'],
  ['earthquakes', 'earthquakes'],
  ['quakes', 'earthquakes'],
  ['satellites', 'satellites'],
  ['space mission', 'rocket-launches'],
  ['space missions', 'rocket-launches'],
  ['missions', 'rocket-launches'],
  ['traffic', 'traffic'],
  ['street traffic', 'traffic'],
  ['cctv', 'cctv'],
  ['cameras', 'cctv'],
  ['radio', 'radio'],
  ['internet radio', 'radio'],
  ['radio stations', 'radio'],
  ['bikeshare', 'bikeshare'],
  ['bikes', 'bikeshare'],
  ['ais', 'ais-live-vessels'],
  ['ships', 'ais-live-vessels'],
  ['vessels', 'ais-live-vessels'],
  ['live vessels', 'ais-live-vessels'],
  ['datacenters', 'local-datacenters'],
  ['data centers', 'local-datacenters'],
  ['data centres', 'local-datacenters'],
  ['dams', 'local-dams'],
  ['submarine cables', 'telegeography-submarine-cables'],
  ['cables', 'telegeography-submarine-cables'],
  ['telegeography', 'telegeography-submarine-cables'],
  ['firms', 'local-firms'],
  ['fires', 'local-firms'],
  ['active fires', 'local-firms'],
]);

export const CITY_ALIASES = new Map([
  ['new york', 'nyc'],
  ['new york city', 'nyc'],
  ['san francisco', 'sf'],
  ['washington', 'dc'],
  ['washington dc', 'dc'],
  ['washington d.c.', 'dc'],
]);

// Basemap stack vocabulary. Switching requires an explicit stack name
// ("Bing aerial", "road map", "OSM", "Google 3D") — any "satellite(s)"
// phrasing ALWAYS means the satellites DATA LAYER, never a basemap; the
// session instructions carry the decision table.
//
// Road phrasings resolve to OSM, the one shipped road basemap. Every alias
// must name a live `MAP_STACKS` id: an alias for a retired stack would resolve
// cleanly and then fail at the controller with "Unknown map stack", which reads
// to the operator as a broken command rather than a retired source.
export const STACK_ALIASES = new Map([
  ['photoreal', 'photoreal'],
  ['google 3d', 'photoreal'],
  ['google', 'photoreal'],
  ['3d', 'photoreal'],
  ['photorealistic', 'photoreal'],
  ['bing-aerial', 'bing-aerial'],
  ['bing aerial', 'bing-aerial'],
  ['bing-labels', 'bing-labels'],
  ['bing labels', 'bing-labels'],
  ['labels', 'bing-labels'],
  ['aerial with labels', 'bing-labels'],
  ['esri-imagery', 'esri-imagery'],
  ['esri', 'esri-imagery'],
  ['esri imagery', 'esri-imagery'],
  ['esri satellite', 'esri-imagery'],
  ['esri-dark-gray', 'esri-dark-gray'],
  ['esri dark gray', 'esri-dark-gray'],
  ['dark gray', 'esri-dark-gray'],
  ['dark mode', 'esri-dark-gray'],
  ['dark canvas', 'esri-dark-gray'],
  ['gray canvas', 'esri-dark-gray'],
  ['osm', 'osm'],
  ['openstreetmap', 'osm'],
  ['open street map', 'osm'],
  ['road', 'osm'],
  ['roads', 'osm'],
  ['road map', 'osm'],
]);

/** Search order for track_entity across entity layer families. */
export const TRACKABLE_FAMILIES = [
  { layerId: 'flights', kind: 'aircraft' },
  { layerId: 'military', kind: 'aircraft' },
  { layerId: 'ais-live-vessels', kind: 'vessel' },
  { layerId: 'satellites', kind: 'satellite' },
];

export const FRAME_TARGETS = new Map([
  ['flights', 'flights'],
  ['planes', 'flights'],
  ['aircraft', 'flights'],
  ['military', 'military'],
  ['military flights', 'military'],
  ['satellites', 'satellites'],
  ['vessels', 'ais-live-vessels'],
  ['ships', 'ais-live-vessels'],
]);

export const VISIBLE_ENTITY_SHORTLIST = 64;

export const viewTargetCache = new WeakMap();

// Abuse guards: a single tool call may not request more than this many marks,
// each route no more waypoints than this, and free-text fields are clamped so a
// runaway model call can't drive unbounded geocode/Overpass/OSRM/DOM work. These
// mirror the tool-schema caps (defense-in-depth: a direct or schema-ignoring call
// is still bounded here).
export const MAX_ANNOTATIONS_PER_CALL = 24;

export const MAX_ROUTE_POINTS = 12;

export const MAX_TARGET_LEN = 200;

export const MAX_LABEL_LEN = 120;

export const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

/**
 * Radius within which a requested centre counts as the Contacts subject's own
 * position. Generous enough to absorb the fix-vs-display offset between what
 * the model read off a card and where the contact is now, tight enough that a
 * neighbouring landmark is never mistaken for the subject.
 */
export const SUBJECT_CENTER_TOLERANCE_KM = 1;

/** Layers whose loaded set follows the camera, so a loaded count is not a world count. */
export const VIEWPORT_LOADED_LAYERS = new Set(['flights']);
