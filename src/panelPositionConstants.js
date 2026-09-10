/**
 * Shared panel-position/z-order constants used both by `ui.js` (constructor,
 * `_maybeNotifyLayoutReset`) and by `panelAdaptiveLayoutMixin.js`. Lives in
 * its own module so neither side needs to import the other for these values.
 */

/**
 * Position keys are versioned separately from collapsed-state keys so layout
 * default changes (e.g. right-rail origin) can reset positions without also
 * resetting every panel's open/closed preference.
 */
export const PANEL_POSITION_STORAGE_VERSION = 'v8';

/** Z ladder: panels promote within [100, 139]; voice pill 150, toast 200, clean-view-exit 300. */
export const PANEL_Z_BASE = 100;
export const PANEL_Z_MAX = 139;
