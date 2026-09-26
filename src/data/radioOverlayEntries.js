/**
 * Pure Radio overlay-entry builders, globe-label formatting, and the shared
 * cluster-identity-reconciliation/volume-transition-scheduling helpers.
 *
 * Extracted from `radio.js` (Wave 1 split program, item #14) — mechanical
 * relocation of already-pure/already-exported functions, zero behavior
 * change. Two symbols close over module-level Radio state and were left
 * behind in `radio.js` on purpose: `resetRadioClusterOverlayIdentities`
 * (mutates `_clusterOverlayIdentities`) and `cancelRadioVolumeTransition`
 * (mutates `_volumeTransitionGeneration`/`_voiceRestoreTimer`/
 * `_volumeFadeFrame`).
 *
 * @module radioOverlayEntries
 */
import {
  GLOBAL_RADIO_ALTITUDE_M,
  RADIO_CATEGORY_COLORS,
  RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
  RADIO_OVERLAY_COHORT_LIMIT,
  RADIO_SINGLETON_GLOBAL_LIMIT,
  RADIO_SINGLETON_MID_LIMIT,
  RADIO_SINGLETON_NEAR_LIMIT,
  radioCategoryColor,
  radioStationCategoryId,
} from './radio.js';

const HORIZON_CAMERA_MOVE_EPSILON_M = 1;

const RADIO_GLOBE_LABEL_MAX_CHARS = 30;
const RADIO_LABEL_SEGMENTER = typeof Intl?.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function compactRadioLabelText(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const graphemes = RADIO_LABEL_SEGMENTER
    ? [...RADIO_LABEL_SEGMENTER.segment(text)].map((segment) => segment.segment)
    : Array.from(text);
  if (graphemes.length <= maxChars) return text;
  return `${graphemes.slice(0, Math.max(1, maxChars - 1)).join('').trimEnd()}…`;
}

function cleanRadioLabelName(value) {
  return String(value || '')
    .replace(/^[\s|:·\-–—]+|[\s|:·\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\([^()]{1,40}\)$/, '')
    .replace(/\s+FM$/i, '')
    .trim();
}

/** Return compact frequency-first text for a Radio globe label. */
export function radioGlobeLabel(station) {
  const fullName = String(station?.name || '').replace(/\s+/g, ' ').trim();
  if (!fullName) return '';

  let frequency = null;
  let labelName = '';
  const explicitMatches = [...fullName.matchAll(/(\d{2,3}(?:\.\d{1,2})?)\s*FM\b/gi)];
  const explicit = explicitMatches.find((match) => {
    const value = Number(match[1]);
    return value >= 64 && value <= 108;
  });
  if (explicit) {
    frequency = explicit[1];
    const before = cleanRadioLabelName(fullName.slice(0, explicit.index));
    const after = cleanRadioLabelName(fullName.slice(explicit.index + explicit[0].length));
    labelName = before || after;
  } else {
    // Infer only a leading decimal in the conventional FM band. Integers such
    // as "80's" or "100 GREATEST" and domains such as "1.fm" stay names.
    const leading = fullName.match(/^(\d{2,3}\.\d{1,2})(?:\s+|\s*[-–—]\s*)(.+)$/);
    const value = Number(leading?.[1]);
    if (leading && value >= 87.5 && value <= 108) {
      frequency = leading[1];
      labelName = cleanRadioLabelName(leading[2].split(/\s+[-–—]\s+/)[0]);
    }
  }

  if (!frequency) return compactRadioLabelText(fullName, RADIO_GLOBE_LABEL_MAX_CHARS);
  const prefix = `${frequency} FM`;
  if (!labelName) return prefix;
  const nameBudget = RADIO_GLOBE_LABEL_MAX_CHARS - prefix.length - 3;
  return `${prefix} — ${compactRadioLabelText(labelName, nameBudget)}`;
}

/** Build the protected selected-station text published through WorldOverlay. */
export function createRadioSelectedOverlayEntry(station, position) {
  if (!station?.id || !station?.name || !position) return null;
  return {
    id: `selected:${station.id}`,
    position,
    variant: 'selected',
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-label',
    priority: Number.MAX_SAFE_INTEGER,
    title: radioGlobeLabel(station),
    accent: radioCategoryColor(radioStationCategoryId(station)),
    interactive: false,
    anchorRadiusPx: 20,
    minAnchorGapPx: 8,
    verticalOnly: true,
    placement: 'above',
    gapPx: 8,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    maxDistance: RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
  };
}

/** Build one bounded ambient cluster badge for the shared overlay host. */
export function createRadioClusterOverlayEntry({ id, position, text, accent, stationCount }) {
  if (!id || !position || !text) return null;
  return {
    id: `cluster:${id}`,
    position,
    variant: 'label',
    paintLane: 'ambient-label',
    collisionGroup: 'ambient-label',
    priority: Math.max(1, Number(stationCount) || 1),
    title: text,
    accent: accent || RADIO_CATEGORY_COLORS.other,
    interactive: false,
    anchorRadiusPx: Math.min(13, 6 + Math.log2(Math.max(1, Number(stationCount) || 1)) * 0.8),
    minAnchorGapPx: 4,
    verticalOnly: true,
    placement: 'above',
    gapPx: 6,
    // Cluster membership/counts update continuously while the camera moves.
    // Paint them as hard-opacity incumbents so a replacement count never
    // cross-fades with its predecessor or dims merely for leaving the keyhole.
    // Collision, viewport rejection, and horizon culling remain host-owned.
    stateless: true,
    edgeFade: 'none',
    horizonCull: true,
    terrainOcclusion: false,
    // The camera can sit above 24,000 km in the supported full-globe view, and
    // horizon clusters are farther from it than the camera's surface altitude.
    maxDistance: RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
    distanceScale: {
      near: 100_000,
      nearValue: 1.08,
      far: RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
      farValue: 0.92,
    },
  };
}

/** Build one ambient station label while Cesium retains its point and picking. */
export function createRadioSingletonOverlayEntry({ station, position, priority = 1 }) {
  if (!station?.id || !station?.name || !position) return null;
  return {
    id: `station:${station.id}`,
    position,
    variant: 'label',
    paintLane: 'ambient-label',
    collisionGroup: 'ambient-label',
    priority: Math.max(1, Number(priority) || 1),
    title: radioGlobeLabel(station),
    accent: radioCategoryColor(radioStationCategoryId(station)),
    interactive: false,
    anchorRadiusPx: 9,
    minAnchorGapPx: 4,
    verticalOnly: true,
    placement: 'above',
    gapPx: 5,
    // Camera/filter changes replace this bounded cohort. Prevent the prior
    // cohort from fading over the current visible points.
    stateless: true,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    maxDistance: RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
    distanceScale: {
      near: 100_000,
      nearValue: 1,
      far: RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
      farValue: 0.86,
    },
  };
}

/** Return the bounded singleton-label allowance for the current camera scale. */
export function radioSingletonLabelLimit(cameraHeightM) {
  const height = Math.max(0, Number(cameraHeightM) || 0);
  if (height >= GLOBAL_RADIO_ALTITUDE_M) return RADIO_SINGLETON_GLOBAL_LIMIT;
  if (height >= 250_000) return RADIO_SINGLETON_MID_LIMIT;
  return RADIO_SINGLETON_NEAR_LIMIT;
}

/** Rank visible singleton stations by camera distance and stable station id. */
export function selectRadioSingletonCandidates(candidates, limit = RADIO_SINGLETON_NEAR_LIMIT) {
  const distance = (candidate) => {
    const value = Number(candidate?.distanceM);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return [...(candidates || [])]
    .sort((a, b) => (
      distance(a) - distance(b)
      || String(a?.station?.id || a?.id || '').localeCompare(String(b?.station?.id || b?.id || ''))
    ))
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

/** Rank and cap ambient Radio clusters before shared-host entry allocation. */
export function selectRadioClusterCandidates(candidates, limit = RADIO_OVERLAY_COHORT_LIMIT) {
  return [...(candidates || [])]
    .sort((a, b) => (
      (Number(b?.stationCount) || 0) - (Number(a?.stationCount) || 0)
      || String(a?.id || '').localeCompare(String(b?.id || ''))
    ))
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

/**
 * Preserve one-to-one overlay identity for overlapping clusters.
 * Cesium clustering is screen-space, so a small camera move may alter exact
 * membership even when the same geographic cluster remains visible. Every
 * positive overlap participates in greatest-contributor discovery, while
 * inheritance remains mutual-best: a current cluster accepts only one of its
 * greatest contributors and a prior identity transfers only to one of its
 * strongest split children.
 */
export function reconcileRadioClusterCandidates(candidates, previous = [], createId = null) {
  const current = (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const stationIds = [...new Set((candidate?.stationIds || []).map((id) => String(id)))].sort();
    const membershipId = String(candidate?.id || `membership:${stationIds.join('|')}`);
    return {
      ...candidate,
      _reconcileIndex: index,
      _reconcileMembershipId: membershipId,
      _reconcileCanonicalKey: `${membershipId}\u0000${stationIds.join('\u0000')}`,
      stationIds,
    };
  });
  const priorMembershipsByIdentity = new Map();
  for (const candidate of Array.isArray(previous) ? previous : []) {
    const identityId = String(candidate?.identityId || candidate?.id || '');
    if (!identityId) continue;
    if (!priorMembershipsByIdentity.has(identityId)) {
      priorMembershipsByIdentity.set(identityId, new Set());
    }
    const membership = priorMembershipsByIdentity.get(identityId);
    for (const stationId of candidate?.stationIds || []) membership.add(String(stationId));
  }
  const prior = [...priorMembershipsByIdentity]
    .map(([identityId, stationIds]) => ({
      identityId,
      stationIds: [...stationIds].sort(),
    }))
    .filter((candidate) => candidate.stationIds.length)
    .sort((a, b) => a.identityId.localeCompare(b.identityId));
  const priorByStation = new Map();
  for (let priorIndex = 0; priorIndex < prior.length; priorIndex += 1) {
    for (const stationId of prior[priorIndex].stationIds) {
      if (!priorByStation.has(stationId)) priorByStation.set(stationId, []);
      priorByStation.get(stationId).push(priorIndex);
    }
  }

  const edges = [];
  const greatestOverlapByCurrent = new Map();
  const greatestOverlapByPrior = new Map();
  for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
    const overlapByPrior = new Map();
    for (const stationId of current[currentIndex].stationIds) {
      for (const priorIndex of priorByStation.get(stationId) || []) {
        overlapByPrior.set(priorIndex, (overlapByPrior.get(priorIndex) || 0) + 1);
      }
    }
    for (const [priorIndex, overlap] of overlapByPrior) {
      const union = current[currentIndex].stationIds.length + prior[priorIndex].stationIds.length - overlap;
      const smaller = Math.min(current[currentIndex].stationIds.length, prior[priorIndex].stationIds.length);
      const score = smaller > 0 ? overlap / smaller : 0;
      const similarity = union > 0 ? overlap / union : 0;
      edges.push({ currentIndex, priorIndex, overlap, score, similarity });
      greatestOverlapByCurrent.set(
        currentIndex,
        Math.max(greatestOverlapByCurrent.get(currentIndex) || 0, overlap),
      );
      greatestOverlapByPrior.set(
        priorIndex,
        Math.max(greatestOverlapByPrior.get(priorIndex) || 0, overlap),
      );
    }
  }
  const eligibleEdges = edges.filter((edge) => (
    edge.overlap === greatestOverlapByCurrent.get(edge.currentIndex)
    && edge.overlap === greatestOverlapByPrior.get(edge.priorIndex)
  ));
  eligibleEdges.sort((a, b) => (
    // Identity follows the contributor representing the largest share of the
    // new cluster. Overlap-coefficient-first incorrectly lets a fully retained
    // two-station minority beat a larger partial contributor during a merge.
    b.overlap - a.overlap
    || b.score - a.score
    || b.similarity - a.similarity
    || current[a.currentIndex]._reconcileCanonicalKey
      .localeCompare(current[b.currentIndex]._reconcileCanonicalKey)
    || prior[a.priorIndex].identityId.localeCompare(prior[b.priorIndex].identityId)
  ));

  const inheritedByCurrent = new Map();
  const usedPriorIdentities = new Set();
  for (const edge of eligibleEdges) {
    const identityId = prior[edge.priorIndex].identityId;
    if (inheritedByCurrent.has(edge.currentIndex) || usedPriorIdentities.has(identityId)) continue;
    inheritedByCurrent.set(edge.currentIndex, prior[edge.priorIndex].identityId);
    usedPriorIdentities.add(identityId);
  }

  const generatedByCurrent = new Map();
  if (typeof createId === 'function') {
    const freshIndices = current
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ index }) => !inheritedByCurrent.has(index))
      .sort((a, b) => (
        a.candidate._reconcileCanonicalKey.localeCompare(b.candidate._reconcileCanonicalKey)
      ));
    for (const { candidate, index } of freshIndices) {
      generatedByCurrent.set(index, String(createId(candidate, index) || ''));
    }
  }

  return current.map((candidate, index) => {
    const membershipId = candidate._reconcileMembershipId;
    const inherited = inheritedByCurrent.get(index);
    const generated = generatedByCurrent.get(index) || '';
    const identityId = inherited || generated || membershipId;
    const {
      _reconcileIndex,
      _reconcileMembershipId,
      _reconcileCanonicalKey,
      ...rest
    } = candidate;
    return { ...rest, membershipId, identityId, id: identityId };
  });
}

export function emptyRadioOverlayDiagnostics() {
  return {
    entryCount: 0,
    selectedCount: 0,
    singletonTexts: [],
    singletonIds: [],
    clusterTexts: [],
    clusterIds: [],
    clusterMemberships: [],
  };
}

export function clampRadioVolume(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

/** Return whether camera translation materially changes horizon visibility. */
export function radioCameraPositionChanged(previous, current, epsilonM = HORIZON_CAMERA_MOVE_EPSILON_M) {
  if (!previous || !current) return true;
  const dx = Number(current.x) - Number(previous.x);
  const dy = Number(current.y) - Number(previous.y);
  const dz = Number(current.z) - Number(previous.z);
  if (![dx, dy, dz].every(Number.isFinite)) return true;
  const threshold = Math.max(0, Number(epsilonM) || 0);
  return dx * dx + dy * dy + dz * dz > threshold * threshold;
}

export function scheduleVolumeFrame(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(Date.now()), 16);
}

export function volumeClock() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
