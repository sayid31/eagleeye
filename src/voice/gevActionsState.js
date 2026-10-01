// Moved out of gevActions.js (gevActionsState).



/**
 * Analyst query — spoken questions over data already on the client
 * ("how many flights over Texas?", "biggest fire near LA?", "which ships
 * are headed to Oakland?"). The ENGINE (analystEngine.js) does the query
 * logic; this wiring supplies live providers and compacts the result for
 * the voice payload. One engine per runner keeps follow-up memory
 * ("which of those is closest?") scoped to the session.
 */
/** layerId → epoch ms of last voice-driven enable (analyst warm-up honesty). */
export const _layerEnabledAt = new Map();

/** Mutable layer state (formerly module-private `let` variables of gevActions.js). */
export const S = {
  _analystEngine: null,
};
