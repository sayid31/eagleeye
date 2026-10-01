// Moved out of radio.js (radioUpdate).

import { radioRequestIsCurrent } from './radioTunerMath.js';
import { DIRECTORY_ENDPOINT, RADIO_DIRECTORY_FUTURE_SKEW_MS, RADIO_DIRECTORY_STALE_MS } from './radioConstants.js';
import { reconcileStations } from './radioOverlay.js';
import { createAcceptedCatalogSnapshot, freezeRadioStation, isValidRadioDirectoryStation } from './radioPolicy.js';
import { updateSelectionEntity } from './radioSelection.js';
import { emitState } from './radioSelectors.js';
import { S } from './radioState.js';

export async function updateRadioLayer() {
    if (!S._enabled) return;
    const generation = ++S._requestGeneration;
    const sessionGeneration = S._sessionGeneration;
    S._abortController?.abort();
    S._abortController = new AbortController();
    S._loading = true;
    S._error = null;
    emitState();
    try {
      const response = await fetch(DIRECTORY_ENDPOINT, { signal: S._abortController.signal });
      if (!response.ok) throw new Error(`Radio directory returned ${response.status}`);
      const body = await response.json();
      if (!radioRequestIsCurrent(
        generation,
        S._requestGeneration,
        S._enabled,
        sessionGeneration,
        S._sessionGeneration,
      )) return;
      if (!Array.isArray(body?.stations)) throw new Error('Radio directory response was malformed');
      const updatedAt = typeof body.updatedAt === 'string' && Number.isFinite(Date.parse(body.updatedAt))
        ? body.updatedAt
        : null;
      const updatedAtMs = updatedAt ? Date.parse(updatedAt) : NaN;
      if (
        !updatedAt
        || updatedAtMs < Date.now() - RADIO_DIRECTORY_STALE_MS
        || updatedAtMs > Date.now() + RADIO_DIRECTORY_FUTURE_SKEW_MS
        || typeof body.stale !== 'boolean'
        || typeof body.degraded !== 'boolean'
      ) throw new Error('Radio directory freshness metadata was malformed');
      const rows = body.stations;
      const acceptedRows = rows.filter(isValidRadioDirectoryStation);
      if (!acceptedRows.length) throw new Error('Radio directory returned no usable stations');
      if (acceptedRows.length !== rows.length) {
        throw new Error('Radio directory response contained malformed stations');
      }
      const acceptedGeneration = body.acceptedGeneration;
      if (
        acceptedGeneration !== null
        && (!Number.isSafeInteger(acceptedGeneration) || acceptedGeneration < 1)
      ) throw new Error('Radio directory generation metadata was malformed');
      if (!body.stale && !body.degraded && acceptedGeneration === null) {
        throw new Error('Radio directory omitted its accepted generation');
      }
      const catalogInstance = body.catalogInstance;
      if (!body.stale && !body.degraded && (typeof catalogInstance !== 'string' || !catalogInstance)) {
        throw new Error('Radio directory omitted its catalog instance');
      }
      const preservingWarmCatalog = S._stations.length > 0 && (body.stale || body.degraded);
      // Generations are only comparable within one producer instance. A new
      // instance token (server restart, different proxy process) starts a fresh
      // sequence: never a repeat and never a regression.
      const sameCatalogInstance = S._acceptedCatalogSnapshot?.instance === catalogInstance;
      const currentAcceptedGeneration = sameCatalogInstance
        ? S._acceptedCatalogSnapshot?.generation
        : null;
      if (
        !body.stale
        && !body.degraded
        && Number.isSafeInteger(currentAcceptedGeneration)
        && acceptedGeneration < currentAcceptedGeneration
      ) throw new Error('Radio directory generation regressed');
      const repeatingAcceptedGeneration = (
        !body.stale
        && !body.degraded
        && Number.isSafeInteger(currentAcceptedGeneration)
        && acceptedGeneration === currentAcceptedGeneration
      );
      if (!preservingWarmCatalog) {
        const immutableRows = acceptedRows.map(freezeRadioStation);
        if (repeatingAcceptedGeneration) {
          S._updatedAt = S._acceptedCatalogSnapshot.updatedAt;
          if (!S._tuningActive && S._cancelledTuningPresentationStation) {
            S._cancelledTuningPresentationStation = null;
            updateSelectionEntity();
          }
        } else if (!body.stale && !body.degraded) {
          const acceptedSnapshot = createAcceptedCatalogSnapshot(
            catalogInstance,
            acceptedGeneration,
            updatedAt,
            immutableRows,
          );
          if (!acceptedSnapshot) throw new Error('Radio directory generation metadata was malformed');
          S._acceptedCatalogSnapshot = acceptedSnapshot;
          reconcileStations(acceptedSnapshot.stations);
        } else {
          reconcileStations(immutableRows);
        }
        if (!repeatingAcceptedGeneration) S._updatedAt = updatedAt;
      }
      S._degraded = body.degraded;
      S._stale = body.stale;
      S._error = preservingWarmCatalog
        ? 'Directory refresh degraded; showing the previous station catalog.'
        : (S._degraded ? 'Radio directory coverage is degraded.' : null);
    } catch (error) {
      if (error?.name === 'AbortError' || !radioRequestIsCurrent(
        generation,
        S._requestGeneration,
        S._enabled,
        sessionGeneration,
        S._sessionGeneration,
      )) return;
      S._error = S._stations.length
        ? 'Directory refresh failed; showing the previous station catalog.'
        : 'Radio directory is temporarily unavailable.';
      S._stale = S._stations.length > 0;
      S._degraded = S._stations.length > 0;
    } finally {
      if (generation === S._requestGeneration && sessionGeneration === S._sessionGeneration) {
        S._loading = false;
        S._abortController = null;
        emitState();
      }
    }
  }
