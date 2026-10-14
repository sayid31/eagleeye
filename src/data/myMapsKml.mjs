/**
 * myMapsKml.mjs — pure parser: a Google My Maps KML export → GeoJSON point
 * features. No network, no DOM. Only the fields the console shows are kept;
 * the hosted photos embedded in placemark descriptions are dropped.
 */

const PLACEMARK_RE = /<Placemark>([\s\S]*?)<\/Placemark>/g;
const NAME_RE = /<name>([\s\S]*?)<\/name>/;
const DESCRIPTION_RE = /<description>([\s\S]*?)<\/description>/;
const COORDINATES_RE = /<Point>[\s\S]*?<coordinates>\s*([^<\s]+)\s*<\/coordinates>/;
const CDATA_RE = /^<!\[CDATA\[([\s\S]*?)\]\]>$/;

/** Description keys (My Maps truncates long field names to 10 chars) → feature property. */
const FIELD_ALIASES = Object.freeze({
  alamat: 'address',
  fungsi: 'function',
  jumlah_lantai: 'floors',
  jumlah_lan: 'floors',
  kapasitas: 'capacity',
  uji_kelayakan: 'feasibilityTest',
  uji_kelaya: 'feasibilityTest',
  keterangan: 'note',
  lokasi: 'region',
  kepemilika: 'owner',
  kepemilikan: 'owner',
  tahun: 'year',
  kondisi: 'status',
});

const ENTITIES = Object.freeze({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" });

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (match) => ENTITIES[match] ?? match);
}

function unwrap(raw) {
  const trimmed = String(raw ?? '').trim();
  const cdata = CDATA_RE.exec(trimmed);
  return cdata ? cdata[1] : decodeEntities(trimmed);
}

/**
 * Split a placemark description ("Key   Value <br> Key   Value …") into a
 * property map. Images and unknown keys are ignored; "-" and blanks become absent.
 * @param {string} html
 * @returns {Record<string,string>}
 */
export function parseDescriptionFields(html) {
  const out = {};
  const lines = String(html ?? '')
    .replace(/<img\b[^>]*>/gi, ' ')
    .split(/<br\s*\/?>/i);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_]+)\s+(.*?)\s*$/.exec(line.replace(/<[^>]+>/g, ' '));
    if (!match) continue;
    const property = FIELD_ALIASES[match[1].toLowerCase()];
    const value = match[2].replace(/\s+/g, ' ').trim();
    if (!property || !value || value === '-' || out[property] !== undefined) continue;
    out[property] = value;
  }
  return out;
}

/**
 * @param {string} kml - KML document text.
 * @param {'shelter'|'siren'} kind - Dataset kind recorded on every feature.
 * @returns {Array<{type:'Feature',geometry:{type:'Point',coordinates:number[]},properties:object}>}
 *   Point placemarks with a finite in-range coordinate; others are skipped.
 */
export function parseMyMapsKml(kml, kind) {
  const features = [];
  for (const [, body] of String(kml ?? '').matchAll(PLACEMARK_RE)) {
    const coords = COORDINATES_RE.exec(body)?.[1]?.split(',').map(Number);
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const name = unwrap(NAME_RE.exec(body)?.[1]).replace(/\s+/g, ' ').trim();
    const fields = parseDescriptionFields(unwrap(DESCRIPTION_RE.exec(body)?.[1]));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { name: name || (kind === 'siren' ? 'Tsunami siren' : 'Tsunami shelter'), kind, ...fields },
    });
  }
  return features;
}

/**
 * Serialize features as JSON Lines, the format the local GeoJSON layer loads.
 * @param {object[]} features
 * @returns {string}
 */
export function featuresToJsonLines(features) {
  return features.map((feature) => JSON.stringify(feature)).join('\n');
}
