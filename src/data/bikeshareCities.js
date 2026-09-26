/**
 * @module data/bikeshareCities
 * @description Static GBFS bikeshare city registry: raw entries, BCycle URL
 * builder, validation/normalization, and the derived lookup structures
 * bikeshare.js consumes at module load time.
 *
 * MONITORED_CITIES_NO_FEED separately documents 8 Indonesian metro cities
 * that have no live public GBFS feed yet — see its own doc comment for why
 * they aren't in the live registry.
 */

/** Default radius (km) for determining whether a city is in camera range. */
export const CITY_RANGE_BASE_KM = 100;

/**
 * Build GBFS endpoint URLs for a BCycle-hosted system.
 * @param {string} systemId - BCycle system identifier (e.g. 'bcycle_boulder').
 * @returns {{ stationInformationUrl: string, stationStatusUrl: string }}
 */
function buildBcycleUrls(systemId) {
  return {
    stationInformationUrl: `https://gbfs.bcycle.com/${systemId}/station_information.json`,
    stationStatusUrl: `https://gbfs.bcycle.com/${systemId}/station_status.json`,
  };
}

/**
 * Convenience factory for a BCycle-hosted city registry entry.
 * Merges caller-supplied metadata with auto-generated BCycle GBFS URLs.
 * @param {Object} opts
 * @param {string} opts.id - Unique city identifier.
 * @param {string} opts.city - Human-readable city name.
 * @param {number} opts.centerLat - City center latitude.
 * @param {number} opts.centerLon - City center longitude.
 * @param {string} opts.systemId - BCycle system identifier.
 * @param {number} [opts.loadRadiusKm=100] - Activation radius in km.
 * @param {string} [opts.provider='BCycle'] - Display provider name.
 * @returns {Object} Raw registry entry suitable for RAW_GBFS_CITY_REGISTRY.
 */
function bcycleEntry({ id, city, centerLat, centerLon, systemId, loadRadiusKm = 100, provider = 'BCycle' }) {
  return {
    id,
    city,
    centerLat,
    centerLon,
    loadRadiusKm,
    provider,
    ...buildBcycleUrls(systemId),
  };
}

/**
 * Raw registry of supported GBFS bikeshare cities.
 * Each entry specifies the city center, load radius, GBFS feed URLs, and provider name.
 * Entries using BCycle hosting are constructed via bcycleEntry() for brevity.
 * @type {Object[]}
 */
const RAW_GBFS_CITY_REGISTRY = [
  {
    id: 'nyc-citibike',
    city: 'New York, NY',
    centerLat: 40.7484,
    centerLon: -73.9967,
    loadRadiusKm: 140,
    stationInformationUrl: 'https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json',
    stationStatusUrl: 'https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_status.json',
    provider: 'Citi Bike',
  },
  {
    id: 'chicago-divvy',
    city: 'Chicago, IL',
    centerLat: 41.8781,
    centerLon: -87.6298,
    loadRadiusKm: 120,
    stationInformationUrl: 'https://gbfs.lyft.com/gbfs/2.3/chi/en/station_information.json',
    stationStatusUrl: 'https://gbfs.lyft.com/gbfs/2.3/chi/en/station_status.json',
    provider: 'Divvy',
  },
  {
    id: 'dc-capital-bikeshare',
    city: 'Washington, DC',
    centerLat: 38.9072,
    centerLon: -77.0369,
    loadRadiusKm: 120,
    stationInformationUrl: 'https://gbfs.lyft.com/gbfs/2.3/dca-cabi/en/station_information.json',
    stationStatusUrl: 'https://gbfs.lyft.com/gbfs/2.3/dca-cabi/en/station_status.json',
    provider: 'Capital Bikeshare',
  },
  {
    id: 'sf-bay-wheels',
    city: 'San Francisco, CA',
    centerLat: 37.7749,
    centerLon: -122.4194,
    loadRadiusKm: 110,
    stationInformationUrl: 'https://gbfs.lyft.com/gbfs/2.3/bay/en/station_information.json',
    stationStatusUrl: 'https://gbfs.lyft.com/gbfs/2.3/bay/en/station_status.json',
    provider: 'Bay Wheels',
  },
  {
    id: 'boston-bluebikes',
    city: 'Boston, MA',
    centerLat: 42.3601,
    centerLon: -71.0589,
    loadRadiusKm: 100,
    stationInformationUrl: 'https://gbfs.bluebikes.com/gbfs/en/station_information.json',
    stationStatusUrl: 'https://gbfs.bluebikes.com/gbfs/en/station_status.json',
    provider: 'Blue Bikes',
  },
  {
    id: 'philadelphia-indego',
    city: 'Philadelphia, PA',
    centerLat: 39.9526,
    centerLon: -75.1652,
    loadRadiusKm: 100,
    stationInformationUrl: 'https://gbfs.bcycle.com/bcycle_indego/station_information.json',
    stationStatusUrl: 'https://gbfs.bcycle.com/bcycle_indego/station_status.json',
    provider: 'Indego',
  },
  {
    id: 'portland-biketown',
    city: 'Portland, OR',
    centerLat: 45.5152,
    centerLon: -122.6784,
    loadRadiusKm: 95,
    stationInformationUrl: 'https://gbfs.biketownpdx.com/gbfs/2.3/en/station_information.json',
    stationStatusUrl: 'https://gbfs.biketownpdx.com/gbfs/2.3/en/station_status.json',
    provider: 'BIKETOWN',
  },
  {
    id: 'la-metro-bike',
    city: 'Los Angeles, CA',
    centerLat: 34.0522,
    centerLon: -118.2437,
    loadRadiusKm: 120,
    stationInformationUrl: 'https://gbfs.bcycle.com/bcycle_lametro/station_information.json',
    stationStatusUrl: 'https://gbfs.bcycle.com/bcycle_lametro/station_status.json',
    provider: 'Metro Bike',
  },
  {
    id: 'austin-capmetro',
    city: 'Austin, TX',
    centerLat: 30.2672,
    centerLon: -97.7431,
    loadRadiusKm: 90,
    stationInformationUrl: 'https://austin.publicbikesystem.net/customer/gbfs/v2/en/station_information.json',
    stationStatusUrl: 'https://austin.publicbikesystem.net/customer/gbfs/v2/en/station_status.json',
    provider: 'CapMetro',
  },
  {
    id: 'honolulu-biki',
    city: 'Honolulu, HI',
    centerLat: 21.3069,
    centerLon: -157.8583,
    loadRadiusKm: 90,
    stationInformationUrl: 'https://hon.publicbikesystem.net/customer/gbfs/v2/en/station_information.json',
    stationStatusUrl: 'https://hon.publicbikesystem.net/customer/gbfs/v2/en/station_status.json',
    provider: 'Biki',
  },
  {
    id: 'columbus-cogo',
    city: 'Columbus, OH',
    centerLat: 39.9612,
    centerLon: -82.9988,
    loadRadiusKm: 90,
    stationInformationUrl: 'https://gbfs.cogobikeshare.com/gbfs/2.3/en/station_information.json',
    stationStatusUrl: 'https://gbfs.cogobikeshare.com/gbfs/2.3/en/station_status.json',
    provider: 'CoGo',
  },
  {
    id: 'chattanooga-bikechatt',
    city: 'Chattanooga, TN',
    centerLat: 35.0456,
    centerLon: -85.3097,
    loadRadiusKm: 90,
    stationInformationUrl: 'https://chat.publicbikesystem.net/customer/gbfs/v2/en/station_information.json',
    stationStatusUrl: 'https://chat.publicbikesystem.net/customer/gbfs/v2/en/station_status.json',
    provider: 'Bike Chattanooga',
  },
  bcycleEntry({
    id: 'boulder-bcycle',
    city: 'Boulder, CO',
    centerLat: 40.0150,
    centerLon: -105.2705,
    systemId: 'bcycle_boulder',
  }),
  bcycleEntry({
    id: 'milwaukee-bublr',
    city: 'Milwaukee, WI',
    centerLat: 43.0389,
    centerLon: -87.9065,
    systemId: 'bcycle_bublr',
    provider: 'Bublr',
  }),
  bcycleEntry({
    id: 'madison-bcycle',
    city: 'Madison, WI',
    centerLat: 43.0731,
    centerLon: -89.4012,
    systemId: 'bcycle_madison',
  }),
  bcycleEntry({
    id: 'nashville-bcycle',
    city: 'Nashville, TN',
    centerLat: 36.1627,
    centerLon: -86.7816,
    systemId: 'bcycle_nashville',
  }),
  bcycleEntry({
    id: 'salt-lake-greenbike',
    city: 'Salt Lake City, UT',
    centerLat: 40.7608,
    centerLon: -111.8910,
    systemId: 'bcycle_greenbikeslc',
    provider: 'GREENbike',
  }),
  bcycleEntry({
    id: 'san-antonio-bcycle',
    city: 'San Antonio, TX',
    centerLat: 29.4241,
    centerLon: -98.4936,
    systemId: 'bcycle_sanantonio',
  }),
  bcycleEntry({
    id: 'cincinnati-red-bike',
    city: 'Cincinnati, OH',
    centerLat: 39.1031,
    centerLon: -84.5120,
    systemId: 'bcycle_cincyredbike',
    provider: 'Red Bike',
  }),
  bcycleEntry({
    id: 'el-paso-bcycle',
    city: 'El Paso, TX',
    centerLat: 31.7619,
    centerLon: -106.4850,
    systemId: 'bcycle_elpaso',
  }),
  bcycleEntry({
    id: 'indianapolis-pacers',
    city: 'Indianapolis, IN',
    centerLat: 39.7684,
    centerLon: -86.1581,
    systemId: 'bcycle_pacersbikeshare',
    provider: 'Pacers Bikeshare',
  }),
  bcycleEntry({
    id: 'fort-lauderdale-broward',
    city: 'Fort Lauderdale, FL',
    centerLat: 26.1224,
    centerLon: -80.1373,
    systemId: 'bcycle_broward',
    provider: 'Broward B-cycle',
  }),
  bcycleEntry({
    id: 'memphis-bcycle',
    city: 'Memphis, TN',
    centerLat: 35.1495,
    centerLon: -90.0490,
    systemId: 'bcycle_memphis',
  }),
  bcycleEntry({
    id: 'des-moines-bcycle',
    city: 'Des Moines, IA',
    centerLat: 41.5868,
    centerLon: -93.6250,
    systemId: 'bcycle_desmoines',
  }),
  bcycleEntry({
    id: 'tucson-tugo',
    city: 'Tucson, AZ',
    centerLat: 32.2226,
    centerLon: -110.9747,
    systemId: 'bcycle_tugo',
    provider: 'Tugo',
  }),
  bcycleEntry({
    id: 'fort-worth-trinity',
    city: 'Fort Worth, TX',
    centerLat: 32.7555,
    centerLon: -97.3308,
    systemId: 'bcycle_fortworth',
    provider: 'Trinity Metro',
  }),
  bcycleEntry({
    id: 'omaha-heartland',
    city: 'Omaha, NE',
    centerLat: 41.2565,
    centerLon: -95.9345,
    systemId: 'bcycle_heartland',
    provider: 'Heartland B-cycle',
  }),
  bcycleEntry({
    id: 'lincoln-bikelnk',
    city: 'Lincoln, NE',
    centerLat: 40.8136,
    centerLon: -96.7026,
    systemId: 'bcycle_bikelnk',
    provider: 'BikeLNK',
  }),
  bcycleEntry({
    id: 'greenville-sc-bcycle',
    city: 'Greenville, SC',
    centerLat: 34.8526,
    centerLon: -82.3940,
    systemId: 'bcycle_greenville',
  }),
  bcycleEntry({
    id: 'buffalo-reddy',
    city: 'Buffalo, NY',
    centerLat: 42.8864,
    centerLon: -78.8784,
    systemId: 'bcycle_reddy',
    provider: 'Reddy Bikeshare',
  }),
  bcycleEntry({
    id: 'las-vegas-rtc-bike-share',
    city: 'Las Vegas, NV',
    centerLat: 36.1699,
    centerLon: -115.1398,
    systemId: 'bcycle_rtcbikeshare',
    provider: 'RTC Bike Share',
  }),
  bcycleEntry({
    id: 'santa-barbara-bcycle',
    city: 'Santa Barbara, CA',
    centerLat: 34.4208,
    centerLon: -119.6982,
    systemId: 'bcycle_santabarbara',
  }),
];

/**
 * Indonesia metro cities with no live public GBFS feed as of 2026-09-09
 * (verified via WebSearch — no Indonesian bikeshare operator currently
 * publishes a GBFS feed; Jakarta's prior system ceased operating in late
 * 2022). These are NOT added to RAW_GBFS_CITY_REGISTRY because
 * normalizeRegistryEntry() requires a real, working station_information/
 * station_status URL pair — there is nothing to point at yet, and faking
 * a feed would render dummy data.
 *
 * This list exists so these 8 cities are documented as monitored-for-future
 * rather than silently absent, matching the CCTV registry's 8-city Indonesia
 * coverage (src/data/cctv.js). Re-check periodically; once any city here
 * gets a real GBFS feed, move it into RAW_GBFS_CITY_REGISTRY via
 * bcycleEntry()/a manual entry instead of adding it here.
 * @type {{ id: string, city: string, centerLat: number, centerLon: number }[]}
 */
export const MONITORED_CITIES_NO_FEED = [
  { id: 'jakarta-monitor', city: 'Jakarta', centerLat: -6.2088, centerLon: 106.8456 },
  { id: 'surabaya-monitor', city: 'Surabaya', centerLat: -7.2575, centerLon: 112.7521 },
  { id: 'bandung-monitor', city: 'Bandung', centerLat: -6.9175, centerLon: 107.6191 },
  { id: 'medan-monitor', city: 'Medan', centerLat: 3.5952, centerLon: 98.6722 },
  { id: 'semarang-monitor', city: 'Semarang', centerLat: -6.9667, centerLon: 110.4167 },
  { id: 'yogyakarta-monitor', city: 'Yogyakarta', centerLat: -7.7956, centerLon: 110.3695 },
  { id: 'makassar-monitor', city: 'Makassar', centerLat: -5.1477, centerLon: 119.4327 },
  { id: 'denpasar-monitor', city: 'Denpasar', centerLat: -8.6705, centerLon: 115.2126 },
];

/**
 * Validate and normalize a raw GBFS city registry entry.
 * Ensures required fields are present, URLs are HTTPS and match expected
 * GBFS endpoint patterns, and coordinates are finite numbers.
 * @param {Object} entry - Raw registry entry from RAW_GBFS_CITY_REGISTRY.
 * @returns {Object} Normalized entry with validated fields and extracted hostnames.
 * @throws {Error} If any required field is missing or invalid.
 */
function normalizeRegistryEntry(entry) {
  const id = String(entry?.id || '').trim().toLowerCase();
  const city = String(entry?.city || '').trim();
  const centerLat = Number(entry?.centerLat);
  const centerLon = Number(entry?.centerLon);
  const loadRadiusKm = Number(entry?.loadRadiusKm);
  const stationInformationUrl = new URL(String(entry?.stationInformationUrl || '').trim());
  const stationStatusUrl = new URL(String(entry?.stationStatusUrl || '').trim());

  if (!id) throw new Error('GBFS entry id is required');
  if (!city) throw new Error(`GBFS entry "${id}" city is required`);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
    throw new Error(`GBFS entry "${id}" has invalid center coordinates`);
  }
  // Enforce HTTPS-only for GBFS feeds
  if (stationInformationUrl.protocol !== 'https:' || stationStatusUrl.protocol !== 'https:') {
    throw new Error(`GBFS entry "${id}" must use https URLs`);
  }
  // Validate that URLs end with expected GBFS endpoint filenames
  if (!/\/station_information\.json$/i.test(stationInformationUrl.pathname)) {
    throw new Error(`GBFS entry "${id}" station_information URL is invalid`);
  }
  if (!/\/station_status\.json$/i.test(stationStatusUrl.pathname)) {
    throw new Error(`GBFS entry "${id}" station_status URL is invalid`);
  }

  // Deduplicate hostnames across both feed URLs for proxy allowlisting
  const hosts = Array.from(
    new Set([stationInformationUrl.hostname.toLowerCase(), stationStatusUrl.hostname.toLowerCase()])
  );

  return {
    id,
    city,
    centerLat,
    centerLon,
    loadRadiusKm: Number.isFinite(loadRadiusKm) && loadRadiusKm > 0 ? loadRadiusKm : CITY_RANGE_BASE_KM,
    stationInformationUrl: stationInformationUrl.toString(),
    stationStatusUrl: stationStatusUrl.toString(),
    provider: String(entry?.provider || 'GBFS').trim() || 'GBFS',
    hosts,
  };
}

/**
 * Validated and deduplicated city registry, built at module load time.
 * Throws if any entry fails validation or has a duplicate id.
 * @type {Object[]}
 */
export const GBFS_CITY_REGISTRY = (() => {
  const seen = new Set();
  return RAW_GBFS_CITY_REGISTRY.map((entry) => {
    const normalized = normalizeRegistryEntry(entry);
    if (seen.has(normalized.id)) {
      throw new Error(`Duplicate GBFS city id: ${normalized.id}`);
    }
    seen.add(normalized.id);
    return normalized;
  });
})();

/** Lookup map from city id to its normalized registry entry. */
export const CITY_BY_ID = new Map(GBFS_CITY_REGISTRY.map((entry) => [entry.id, entry]));
