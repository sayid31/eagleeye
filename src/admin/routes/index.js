// src/admin/routes/index.js
/**
 * The registry of route features. A feature file (features/<name>.js) registers its pages, menu groups and legacy
 * redirects; adminNav.js / AdminApp.jsx only compose what is listed here. Adding a feature = one import + one array entry.
 *
 * @module admin/routes
 * @typedef {import('./pageRef.js').PageRef} PageRef
 * @typedef {{order: number} & import('../../components/app/navModel.js').NavGroup} NavGroupFragment
 * @typedef {{id: string, pages: Record<string, PageRef>,
 *   nav: {admin: NavGroupFragment[], dev: NavGroupFragment[]},
 *   redirects: {admin: Record<string, string>, dev: Record<string, string>}}} RouteFeature
 */
import { accessRoutes } from './features/access.js';
import { configRoutes } from './features/config.js';
import { systemRoutes } from './features/system.js';

/** @type {readonly RouteFeature[]} */
export const ROUTE_FEATURES = Object.freeze([accessRoutes, systemRoutes, configRoutes]);
