/**
 * Feature "Sistem" (/dev only): System Overview, Kill switch, Pemakaian, and the Server Log group (Server Log, Audit
 * Log, System Health). Owner of: src/admin/dev/**. Register a page here and give it a menu entry in ../../adminNav.js.
 *
 * @module admin/routes/features/system
 */
import { page } from '../pageRef.js';

/** @type {import('../index.js').RouteFeature} */
export const systemRoutes = {
  id: 'system',
  pages: {
    'dev-overview': page(() => import('../../dev/overview/SystemOverviewPage.jsx'), 'SystemOverviewPage'),
    'dev-kill-switches': page(() => import('../../dev/killswitch/KillSwitchPage.jsx'), 'KillSwitchPage'),
    'dev-usage': page(() => import('../../dev/usage/UsageBudgetPage.jsx'), 'UsageBudgetPage'),
    'server-log': page(() => import('../../dev/logs/ServerLogPage.jsx'), 'ServerLogPage'),
    'server-log-audit': page(() => import('../../dev/logs/AuditLogPage.jsx'), 'AuditLogPage'),
    'server-log-health': page(() => import('../../dev/logs/HealthPage.jsx'), 'HealthPage'),
    'ui-kit': page(() => import('../../dev/UiKitPage.jsx'), 'UiKitPage'),
  },
};
