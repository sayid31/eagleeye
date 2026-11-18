// src/copy/en/config.js
/**
 * English copy of the /dev Konfigurasi pages: API Keys (keys table, "Ubah kunci" sheet, model and voice),
 * plus the strings shared by every settings form (save bar, leave warning). Umum, Persona and Usage & Cost live in
 * configForms.js and are re-exported from here. Pure data; no API error codes (see errors.js).
 *
 * @module copy/en/config
 */
export * from './configForms.js';

/** Per-provider name and purpose; keys are the registry ids of GET /api/admin/keys. */
export const PROVIDER_COPY = Object.freeze({
  'google-maps': { name: 'Google Maps', purpose: 'Photorealistic 3D globe and place search. This key is used by the server only.' },
  openai: { name: 'OpenAI', purpose: 'Voice assistant, screen reader, and HUD summaries.' },
  aisstream: { name: 'AISStream', purpose: 'Live vessel positions worldwide.' },
  firms: { name: 'NASA FIRMS', purpose: 'Live active-fire detection.' },
  tomtom: { name: 'TomTom', purpose: 'Real traffic. Without a key, the map runs a simulation.' },
  'cesium-ion': { name: 'Cesium ion', purpose: 'Bing imagery and world terrain.' },
  opensky: { name: 'OpenSky', purpose: 'Larger flight polling quota. Without a key it still works anonymously.' },
  'launch-library': { name: 'Launch Library', purpose: 'Larger quota for space mission data requests.' },
});

/** Field label per environment variable of a provider with several fields (a single field is labelled "API key"). */
export const KEY_FIELD_LABELS = Object.freeze({
  OPENSKY_CLIENT_ID: 'Client ID',
  OPENSKY_CLIENT_SECRET: 'Client secret',
  CESIUM_ION_TOKEN: 'Token',
});

/** What a connection test does, per provider (the server's notes are English). */
export const KEY_TEST_NOTES = Object.freeze({
  openai: 'Reads the model list; no usage cost.',
  firms: 'Reads key status; uses no transactions.',
  'cesium-ion': 'Reads terrain metadata only.',
  tomtom: 'Fetches one traffic tile from the daily quota.',
  opensky: 'Requests one OAuth token.',
  'launch-library': 'Reads the remaining request quota.',
  aisstream: 'Uses the running vessel feed; if there is none, opens a short connection.',
  'google-maps': 'Cannot be tested from the server without a paid Google request. Make sure the Google 3D globe shows.',
});

/** Test outcome code → sentence. `unreachableHint` adds provider-specific advice to "tidak terhubung". */
export const KEY_TEST_RESULTS = Object.freeze({
  ok: { label: 'Success', text: 'The provider accepts this key.' },
  rejected: { label: 'Rejected', text: 'The provider rejected this key. Check the key or replace it with a new one.' },
  unreachable: { label: 'Not connected', text: 'The provider could not be reached, so the key was not checked. Try again in a moment.' },
  untestable: { label: 'Cannot be tested', text: 'This key cannot be tested from the server.' },
  not_set: { label: 'No key yet', text: 'Add a key before testing the connection.' },
  unknown: { label: 'Unknown', text: 'The test result was not recognized.' },
});
export const KEY_UNREACHABLE_HINTS = Object.freeze({
  aisstream: ' AISStream allows one connection per key; turn on the Vessels layer to check it through the live feed.',
});

/** Shared by every settings form: the sticky save bar and the warning when leaving with unsaved changes. */
export const SAVE_COPY = Object.freeze({
  dirty: 'Unsaved changes',
  clean: 'All changes are saved',
  saving: 'Saving…',
  savedAt: (time) => `Saved • ${time}`,
  save: 'Save changes',
  discard: 'Discard changes',
  discarded: 'Changes discarded.',
  barLabel: 'Save settings',
  leave: {
    title: 'Leave this page?',
    impact: 'Unsaved changes will be lost. Settings that are already saved are not affected.',
    action: 'Leave page',
    stay: 'Stay here',
  },
});

export const PROVIDERS_COPY = Object.freeze({
  title: 'API Keys',
  aiTitle: 'AI Provider',
  keysDescription: 'Data and AI service keys used by the server. Key values are never shown, only whether one is set.',
  aiDescription: 'Voice and model for the voice assistant. The OpenAI key is managed in API Keys.',
  loading: 'Loading providers',
  loadError: 'Providers could not be loaded',
  tableCaption: 'Providers and API key status',
  summary: (set, total, store) => `${set} of ${total} providers have a key. Keys are stored in ${store} on this computer.`,
  stores: { env: 'the project\'s .env file', pinokio: 'the Pinokio ENVIRONMENT file' },
  restarting: {
    title: 'Server is restarting',
    description: 'The server restarts so every feature uses the latest keys. This page reloads itself; wait a few seconds.',
  },
  columns: { provider: 'Provider', status: 'Key status', source: 'Sources', test: 'Last connection test', actions: 'Actions' },
  status: { set: 'Key set', unset: 'Not set', rejected: 'Rejected' },
  sources: { env: '.env', pinokio: 'Pinokio ENVIRONMENT', external: 'Keychain or shell', none: '—' },
  tier: { metered: 'Paid account', free: 'Free' },
  test: { never: 'Not tested', at: (label, time) => `${label} • ${time}` },
  actions: { change: 'Change key', install: 'Add key', changeLabel: (name) => `Change key for ${name}`, installLabel: (name) => `Add key for ${name}` },
  empty: { title: 'No providers', description: 'The server did not send a provider list. Reload the page.' },
});

export const KEY_SHEET_COPY = Object.freeze({
  title: (name, set) => (set ? `Change key for ${name}` : `Add key for ${name}`),
  getKey: 'Get a key',
  externalTitle: 'Managed outside the app',
  externalBody: 'This key is managed where the server runs (shell, Keychain, or launcher), so it can only be changed there. You can still test its connection.',
  browserTitle: 'This key is sent to the browser',
  browserBody: 'This token is deliberately sent to the browser so the map can load imagery. Restrict its use on the provider\'s side.',
  singleField: 'API key',
  keepHint: 'Leave empty to keep the stored key.',
  placeholderSet: '•••••••••••• stored',
  placeholderUnset: 'Paste the key here',
  neverShown: 'The stored key is never shown. What you type is sent to the server only once.',
  testSection: 'Test connection',
  testButton: 'Test connection',
  testNeedsKey: 'Add a key first to test.',
  testFailed: 'Test failed',
  testing: 'Testing…',
  save: 'Save key',
  replace: 'Replace key',
  saving: 'Saving…',
  remove: 'Delete key',
  close: 'Close',
  saved: (name) => `${name} key saved.`,
  removed: (name) => `${name} key deleted.`,
  errors: {
    fieldEmpty: (label) => `${label} is required.`,
    fieldSpace: (label) => `${label} cannot contain spaces.`,
    allFields: 'Fill in every field; this key has several parts and they are saved together.',
  },
  removeConfirm: {
    title: (name) => `Delete ${name} key?`,
    impact: (name, purpose) => `Features that use ${name} will stop or fall back to keyless mode: ${purpose} The key can be added again at any time, but the old value cannot be recovered from here.`,
    action: (name) => `Delete ${name} key`,
  },
});

export const AI_PROVIDER_COPY = Object.freeze({
  keyCard: { title: 'OpenAI key', description: 'The key that runs the voice assistant.', manage: 'Manage in API Keys', missing: 'There is no OpenAI key yet, so the voice assistant cannot be used.' },
  model: {
    title: 'Model and voice',
    description: (model, source) => `Voice model: ${model} (${source}). The voice cannot change while a session is running.`,
    voice: { label: 'Voice', description: (value, source) => `In use: ${value} (${source}).` },
    backend: { label: 'Model backend (tools and reasoning)', description: (value, source) => `In use: ${value} (${source}). Billed separately by OpenAI and not included in the cost meter.` },
    defaultChoice: 'Default (.env or app default)',
  },
  sources: { admin: 'chosen here', env: 'from .env', default: 'built-in default' },
  errors: { voice: 'Voice: pick one from the list.', backend: 'Model backend: pick one from the list.' },
  saved: 'Saved. New voice sessions use this voice and model.',
  loading: 'Loading model settings',
  loadError: 'Model settings could not be loaded',
});
