// src/admin/routes/pageRef.js
/**
 * A page registration: a lazy loader plus how to pick the component out of the module. Pure data (no React import),
 * so adminNav and its tests can compose routes in node; AdminApp turns each ref into `React.lazy`.
 *
 * @module admin/routes/pageRef
 * @typedef {{loader: () => Promise<Record<string, any>>, pick: string | ((module: any) => any)}} PageRef
 */

/**
 * @param {() => Promise<Record<string, any>>} loader e.g. `() => import('../../users/UsersPage.jsx')`
 * @param {string | ((module: any) => any)} pick Export name, or a function returning the component from the module.
 * @returns {PageRef}
 */
export function page(loader, pick) {
  return { loader, pick };
}

/**
 * Load the module and return the `{default: Component}` shape `React.lazy` expects.
 * @param {PageRef} ref
 * @returns {Promise<{default: any}>}
 */
export async function loadPage(ref) {
  const module = await ref.loader();
  const component = typeof ref.pick === 'function' ? ref.pick(module) : module[ref.pick];
  if (!component) throw new Error(`Page export not found: ${typeof ref.pick === 'function' ? 'pick()' : ref.pick}`);
  return { default: component };
}
