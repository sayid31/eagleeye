// Moved out of gevActions.js (gevActionsLocation).

import { CITY_POIS, findPoiByName, flyToLandmark, flyToPOI, flyToPresetLocation, searchAndFlyTo } from '../locations.js';
import { clampNumber, normalizeLocationId } from './gevActionsNormalize.js';

export async function flyToRequestedLocation(viewer, args, {
  onStart = null,
  runImmediate = null,
  beginDeferred = null,
  reassertDeferred = null,
} = {}) {
  const requestedRangeM = Number(args.rangeM);
  const rangeM = Number.isFinite(requestedRangeM)
    ? clampNumber(requestedRangeM, 100, 20000000, 900)
    : null;
  const locationId = normalizeLocationId(args.locationId || args.query);
  const immediate = (navigate) => (
    typeof runImmediate === 'function' ? runImmediate(navigate) : navigate()
  );
  const immediateOnStart = typeof runImmediate === 'function' ? null : onStart;
  const cancelled = (label) => ({
    ok: false,
    cancelled: true,
    action: 'fly_to_location',
    label,
  });
  let settleArrival = null;
  const arrival = args.waitForArrival === true
    ? new Promise((resolve) => { settleArrival = resolve; })
    : null;
  const arrivalHooks = arrival ? {
    onComplete: () => settleArrival?.('arrived'),
    onCancel: () => settleArrival?.('cancelled'),
  } : {};
  const afterArrival = async (result, label) => {
    if (!arrival || result?.ok !== true) return result;
    const status = await arrival;
    settleArrival = null;
    return status === 'arrived'
      ? { ...result, arrived: true }
      : cancelled(label);
  };

  if (locationId) {
    const result = immediate(() => flyToPresetLocation(viewer, locationId, {
      ...(rangeM || args.viewMode === 'close'
        ? { range: rangeM || 250 }
        : { viewMode: 'overview' }),
      duration: 2.2,
      onStart: immediateOnStart,
      ...arrivalHooks,
    }));
    if (result === false) return cancelled(CITY_POIS[locationId]?.name || locationId);
    const response = {
      ok: Boolean(result),
      action: 'fly_to_location',
      locationId,
      label: CITY_POIS[locationId]?.name || locationId,
      rangeM: result?.range ? Math.round(result.range) : (rangeM || null),
      navigationMode: rangeM
        ? 'explicit-range'
        : (args.viewMode === 'close' ? 'city-close' : (result?.navigationMode || 'city-overview')),
    };
    return afterArrival(response, response.label);
  }

  const latitude = Number(args.latitude);
  const longitude = Number(args.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const result = immediate(() => flyToLandmark(viewer, latitude, longitude, {
      range: rangeM || 250,
      pitch: -35,
      heading: 0,
      buildingHeight: 0,
      duration: 2.2,
      onStart: immediateOnStart,
      ...arrivalHooks,
    }));
    if (result === false) return cancelled(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    const response = {
      ok: true,
      action: 'fly_to_location',
      latitude,
      longitude,
      label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      rangeM: Math.round(rangeM || 250),
      navigationMode: rangeM ? 'explicit-range' : 'close-coordinate',
    };
    return afterArrival(response, response.label);
  }

  const query = String(args.query || '').trim();
  if (query) {
    // A query that names a curated preset POI ("the Texas State Capitol", "Golden Gate Bridge")
    // flies to its hand-tuned camera pose — the same beautiful framing as clicking the LOCATIONS
    // panel button — instead of generic geocode framing. An explicit rangeM still overrides distance.
    const poiMatch = findPoiByName(query);
    if (poiMatch) {
      const result = immediate(() => flyToPOI(viewer, poiMatch.cityId, poiMatch.index, {
        duration: 2.2,
        onStart: immediateOnStart,
        ...arrivalHooks,
        ...(rangeM ? { range: rangeM } : {}),
      }));
      const poi = CITY_POIS[poiMatch.cityId]?.pois?.[poiMatch.index];
      if (result === false) return cancelled(poi?.name || query);
      const response = {
        ok: Boolean(result),
        action: 'fly_to_location',
        query,
        label: poi?.name || query,
        navigationMode: rangeM ? 'preset-poi-range' : 'preset-poi',
        rangeM: result?.range ? Math.round(result.range) : (rangeM || null),
      };
      return afterArrival(response, response.label);
    }

    const generation = typeof beginDeferred === 'function' ? beginDeferred() : null;
    if (generation === false) return cancelled(query);
    const managedDeferred = typeof reassertDeferred === 'function';
    const destination = await searchAndFlyTo(viewer, query, {
      ...(rangeM ? { range: rangeM } : {}),
      forceClose: args.viewMode === 'close',
      // 'overview' frames the geocode viewport even for precise-place results —
      // previously dropped here, so "overview of Zilker Park" flew to a rooftop.
      viewMode: args.viewMode || null,
      duration: 2.2,
      ...arrivalHooks,
      beforeFly: managedDeferred ? () => reassertDeferred(generation) : null,
      onStart: managedDeferred ? null : onStart,
    });
    if (destination?.cancelled) return cancelled(query);
    const response = {
      ok: Boolean(destination),
      action: 'fly_to_location',
      query,
      label: destination?.label || query,
      navigationMode: destination?.navigationMode || null,
      rangeM: destination?.rangeM || rangeM || null,
    };
    return afterArrival(response, response.label);
  }

  throw new Error('fly_to_location needs a locationId, query, or latitude/longitude');
}
