// src/admin/routes/index.js
/**
 * The registry of route features. A feature file (features/<name>.js) registers its lazy pages; the menu itself
 * (labels, order, groups, paths) is the one table in adminNav.js, and AdminApp.jsx only composes both. Adding a feature = one import + one array entry.
 *
 * @module admin/routes
 * @typedef {import('./pageRef.js').PageRef} PageRef
 * @typedef {{id: string, pages: Record<string, PageRef>}} RouteFeature
 */
import { accessRoutes } from './features/access.js';
import { configRoutes } from './features/config.js';
import { systemRoutes } from './features/system.js';

/** @type {readonly RouteFeature[]} */
export const ROUTE_FEATURES = Object.freeze([accessRoutes, systemRoutes, configRoutes]);
