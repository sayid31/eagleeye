/**
 * Provider key setup — the pure core.
 *
 * One registry, a few pure functions, zero dependencies. The /admin → API
 * Keys store and routes (src/admin/keys/) are thin shells over this module,
 * so what a key is called, what it unlocks, and how a .env line is written
 * each live in exactly one place.
 *
 * Nothing here touches the filesystem, the network, or process.env — callers
 * pass environments in and write text out, which is also what makes every
 * behavior below unit-testable.
 */

/** Longest accepted key/token value. Real provider keys are all far shorter. */
export const KEY_SETUP_VALUE_LIMIT = 512;

/** Most env vars accepted in one save. The registry defines nine. */
export const KEY_SETUP_UPDATE_LIMIT = 16;

/**
 * Header line written above keys appended to a .env file. The text predates
 * /admin (POWER UP wrote it); it stays as is so existing .env files keep ONE
 * header instead of gaining a second one.
 */
export const KEY_SETUP_APPEND_HEADER = '# Keys added by the in-app POWER UP panel';

/**
 * Every key the panel offers, in the order it offers them — most magic per
 * minute first. `tier` mirrors the README's color legend: 'metered' (🔴) is a
 * billing-enabled account, 'free' (🟡) is a register-and-paste key.
 * `clientExposed` marks the two keys that are injected into the browser
 * bundle by design (restrict them at the provider, per SECURITY.md).
 */
export const KEY_SETUP_KEYS = Object.freeze([
  Object.freeze({
    id: 'google-maps',
    title: 'GOOGLE MAPS',
    unlocks: 'The photorealistic 3D planet + place search',
    getUrl: 'https://developers.google.com/maps/documentation/tile/get-api-key',
    envVars: Object.freeze(['GOOGLE_MAPS_API_KEY']),
    tier: 'metered',
    clientExposed: true,
  }),
  Object.freeze({
    id: 'openai',
    title: 'OPENAI',
    unlocks: 'Voice control — talk to the planet',
    getUrl: 'https://platform.openai.com/api-keys',
    envVars: Object.freeze(['OPENAI_API_KEY']),
    tier: 'metered',
  }),
  Object.freeze({
    id: 'aisstream',
    title: 'AISSTREAM',
    unlocks: 'Live ships, worldwide',
    getUrl: 'https://aisstream.io',
    envVars: Object.freeze(['AISSTREAM_API_KEY']),
    tier: 'free',
  }),
  Object.freeze({
    id: 'firms',
    title: 'NASA FIRMS',
    unlocks: 'Live active-fire detections',
    getUrl: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/',
    envVars: Object.freeze(['FIRMS_MAP_KEY']),
    tier: 'free',
  }),
  Object.freeze({
    id: 'tomtom',
    title: 'TOMTOM',
    unlocks: 'Real live traffic (keyless runs a simulation)',
    getUrl: 'https://developer.tomtom.com',
    envVars: Object.freeze(['TOMTOM_API_KEY']),
    tier: 'free',
  }),
  Object.freeze({
    id: 'cesium-ion',
    title: 'CESIUM ION',
    unlocks: 'Bing imagery map stacks + world terrain',
    getUrl: 'https://ion.cesium.com/tokens',
    envVars: Object.freeze(['CESIUM_ION_TOKEN']),
    tier: 'free',
    clientExposed: true,
  }),
  Object.freeze({
    id: 'opensky',
    title: 'OPENSKY',
    unlocks: 'More flight-polling credits (anonymous works without)',
    getUrl: 'https://opensky-network.org',
    envVars: Object.freeze(['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET']),
    tier: 'free',
  }),
  Object.freeze({
    id: 'launch-library',
    title: 'LAUNCH LIBRARY',
    unlocks: 'Higher space-missions request allowance',
    getUrl: 'https://thespacedevs.com',
    envVars: Object.freeze(['LL2_API_TOKEN']),
    tier: 'free',
  }),
]);

/** True only for a subprocess that exited normally and successfully. */
export function commandCompletedSuccessfully(result) {
  return !!result && !result.error && !result.signal && result.status === 0;
}

/** Parse one RFC-4180-shaped CSV record, sufficient for `whoami /fo csv`. */
function parseCsvRecord(text) {
  const source = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!source || /[\r\n]/.test(source)) return null;
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) return null;
  fields.push(field);
  return fields;
}

/**
 * Extract the current token's user SID from `whoami /user /fo csv /nh`.
 * The SID must be the second CSV field and a user-shaped local/domain or Entra
 * SID; matching an SID-looking account name or a broad group SID is forbidden.
 */
export function parseWindowsUserSid(stdout) {
  const fields = parseCsvRecord(stdout);
  if (!fields || fields.length !== 2) return null;
  const sid = fields[1].trim();
  return /^(?:S-1-5-21-(?:\d+-){3}\d+|S-1-12-1-(?:\d+-){3}\d+)$/i.test(sid)
    ? sid
    : null;
}

/** @returns {Set<string>} every env var the panel is allowed to write. */
export function knownKeySetupEnvVars() {
  const names = new Set();
  for (const entry of KEY_SETUP_KEYS) {
    for (const envVar of entry.envVars) names.add(envVar);
  }
  return names;
}

/**
 * Decide whether a live provider value belongs to a source outside the store
 * Provider Settings is allowed to edit. `wasExternalAtBoot` carries source
 * provenance without carrying the credential itself; it closes the otherwise
 * undecidable case where an exported value and a dotenv assignment happen to
 * contain the same bytes.
 * @param {{effectiveValue: unknown, storedValue: unknown, wasExternalAtBoot?: boolean}} input
 */
export function isKeySetupExternallyManaged({
  effectiveValue,
  storedValue,
  wasExternalAtBoot = false,
} = {}) {
  const effective = String(effectiveValue ?? '').trim();
  const stored = String(storedValue ?? '').trim();
  return effective !== '' && (wasExternalAtBoot || effective !== stored);
}

/**
 * Build the status payload the panel renders from: the registry, plus
 * per-entry `set` resolved against the given environment. It never includes
 * a value, suffix, or other credential material.
 * @param {Record<string, string|undefined>} env e.g. process.env
 */
export function keySetupStatus(env = {}) {
  const keys = KEY_SETUP_KEYS.map((entry) => {
    const values = entry.envVars.map((name) => String(env[name] ?? '').trim());
    const set = values.every((value) => value.length > 0);
    return {
      id: entry.id,
      title: entry.title,
      unlocks: entry.unlocks,
      getUrl: entry.getUrl,
      envVars: [...entry.envVars],
      tier: entry.tier,
      clientExposed: Boolean(entry.clientExposed),
      set,
    };
  });
  return {
    keys,
    setCount: keys.filter((key) => key.set).length,
    total: keys.length,
  };
}

/**
 * Validate a POST body into a clean {ENV_VAR: value} map, or say exactly why
 * not. Values must be single-line printable ASCII with no spaces — every real
 * provider credential is — which is also what makes the raw `KEY=value` line
 * below safe to write without quoting rules. A `null` value means REMOVE:
 * the writer comments the assignment back out, returning the file to its
 * template state for that key.
 * @param {unknown} body Parsed JSON from the request.
 */
export function validateKeySetupUpdates(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Isi harus berupa objek JSON {ENV_VAR: nilai}' };
  }
  const entries = Object.entries(body);
  if (entries.length === 0) return { ok: false, error: 'Tidak ada kunci yang diberikan' };
  if (entries.length > KEY_SETUP_UPDATE_LIMIT) {
    return { ok: false, error: `Maksimal ${KEY_SETUP_UPDATE_LIMIT} kunci per simpan` };
  }
  const known = knownKeySetupEnvVars();
  const updates = {};
  for (const [name, raw] of entries) {
    if (!known.has(name)) return { ok: false, error: `Kunci tidak dikenal: ${name}` };
    if (raw === null) {
      updates[name] = null;
      continue;
    }
    if (typeof raw !== 'string') return { ok: false, error: `${name} harus berupa string` };
    const value = raw.trim();
    if (!value) return { ok: false, error: `${name} kosong` };
    if (value.length > KEY_SETUP_VALUE_LIMIT) {
      return { ok: false, error: `${name} lebih panjang dari kunci asli (maks ${KEY_SETUP_VALUE_LIMIT})` };
    }
    if (!/^[\x21-\x7e]+$/.test(value)) {
      return { ok: false, error: `${name} hanya boleh berisi karakter yang dapat dicetak tanpa spasi` };
    }
    // Reject the dotenv metacharacters that would round-trip WRONG when written
    // unquoted (# starts a comment, quotes redelimit, $ expands, backslash and
    // backtick are escapes) — so a saved value can never differ from what Node's
    // parseEnv and Vite's expansion read back. Real provider keys never contain
    // these; they are base64url / hex / JWT alphabets.
    if (/[#"'$\\`]/.test(value)) {
      return { ok: false, error: `${name} berisi karakter yang tidak valid untuk kunci (#, tanda kutip, $, \\, atau backtick)` };
    }
    updates[name] = value;
  }
  return { ok: true, updates };
}

/**
 * Upsert `KEY=value` lines into dotenv text, disturbing nothing else.
 *
 * Placement, per key: the LAST active assignment is replaced in place (last
 * is what dotenv parsing lets win); failing that, the last commented-out
 * assignment is uncommented in place, so a file copied from .env.example
 * keeps its curated shape; failing both, the line is appended at the end
 * under one shared header. Every untouched line — comments, blanks, other
 * keys — survives byte for byte, and the result always ends in a newline.
 *
 * A `null` value REMOVES: every active assignment for that key is commented
 * back out (`# KEY=`), returning the file to its template shape; a key with
 * no active assignment is left untouched.
 * @param {string} text Existing file content ('' births a new file).
 * @param {Record<string, string|null>} updates Validated {ENV_VAR: value} map.
 */
export function upsertDotenvValues(text, updates) {
  const source = typeof text === 'string' ? text : '';
  const lines = source.length ? source.split(/\r?\n/) : [];
  const additions = [];
  for (const [name, value] of Object.entries(updates)) {
    const active = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
    const commented = new RegExp(`^\\s*#\\s*(?:export\\s+)?${name}\\s*=`);
    if (value === null) {
      lines.forEach((line, index) => {
        if (active.test(line)) lines[index] = `# ${name}=`;
      });
      continue;
    }
    const assignment = `${name}=${value}`;
    let lastActive = -1;
    let lastCommented = -1;
    lines.forEach((line, index) => {
      if (active.test(line)) lastActive = index;
      else if (commented.test(line)) lastCommented = index;
    });
    if (lastActive >= 0) lines[lastActive] = assignment;
    else if (lastCommented >= 0) lines[lastCommented] = assignment;
    else additions.push(assignment);
  }
  if (additions.length) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (!lines.some((line) => line.trim() === KEY_SETUP_APPEND_HEADER)) {
      if (lines.length) lines.push('');
      lines.push(KEY_SETUP_APPEND_HEADER);
    }
    lines.push(...additions);
  }
  const joined = lines.join('\n');
  if (!joined) return '';
  return joined.endsWith('\n') ? joined : `${joined}\n`;
}
