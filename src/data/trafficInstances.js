// Moved out of traffic.js (trafficInstances).

import { TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { loadRoadsForBounds } from './trafficLoad.js';
import { parseRoads } from './trafficParse.js';
import { loadRoadsForBoundsTimed, parseRoadsTimed } from './trafficTiming.js';

// Disabled-path contract: these references resolve directly to the original
// functions. Instrumentation adds no load-path callbacks or per-item checks.
export const _parseRoads = TRAFFIC_TIMING_ENABLED
  ? (data, trace) => (trace ? parseRoadsTimed(data, trace) : parseRoads(data))
  : parseRoads;

export const _loadRoadsForBounds = TRAFFIC_TIMING_ENABLED
  ? loadRoadsForBoundsTimed
  : loadRoadsForBounds;
