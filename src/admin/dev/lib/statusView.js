// src/admin/dev/lib/statusView.js
/**
 * Provider naming helper of the /dev system pages. (Health states render through StatusBadge.)
 *
 * @module admin/dev/lib/statusView
 */
import { PROVIDER_NAMES } from '../../../copy/en/system.js';

/** Provider display name for a key-store id; falls back to the server title (ALL CAPS), then the id. */
export function providerName(id, title) {
  return Object.hasOwn(PROVIDER_NAMES, id) ? PROVIDER_NAMES[id] : (title ?? id);
}
