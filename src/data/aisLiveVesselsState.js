// Moved out of aisLiveVessels.js (aisLiveVesselsState).

import * as Cesium from 'cesium';
import { DEFAULT_AIS_RUNTIME, DEFAULT_VESSEL_OVERLAY_HOST } from './aisLiveVesselsConstants.js';

export const _scratchFocusScreen = new Cesium.Cartesian2();

/** Mutable layer state (formerly module-private `let` variables of aisLiveVessels.js). */
export const S = {
  /** Camera pose signature at the last vessel rotation pass. */
  _lastCamPoseSig: '',
  _vesselOverlayHost: DEFAULT_VESSEL_OVERLAY_HOST,
  _aisRuntime: DEFAULT_AIS_RUNTIME,
  _aisSessionSequence: 0,
  // AIS_HEALTHY_STATUSES, deriveAisFeedError, classifyAisFeedSnapshot now live
  // in ./aisFeedClassify.js (Wave 2 split #20) and are imported above.
  // mapAnalystRecord, vesselDatumHeightM, reduceVesselSelection now live in
  // ./aisVesselRecords.js (Wave 2 split #20) and are imported above. Re-exported
  // below (this module's own tests import them from aisLiveVessels.js).

  /**
  * True once the EGM96 geoid grid has loaded (fire-and-forget warm at
  * enable(), aircraft idiom — see militaryFlights.js). Gates all synchronous
  * geoidHeight() reads so a poll can never throw pre-load.
  * @type {boolean}
  */
  _geoidReady: false,
};
