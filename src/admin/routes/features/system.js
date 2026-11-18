// src/admin/routes/features/system.js
/**
 * Feature "Sistem" (/dev only): system overview, Sakelar darurat, Pemakaian & Biaya, Log server (+ audit trail, health).
 * Owner of: src/admin/dev/** (overview, killswitch, usage, logs). Edit ONLY this file to add or move a page of this
 * feature (see access.js for the shape). The "Pemakaian AI" tab (`ai-usage`) is the W4 page src/admin/config/AiUsagePage.jsx.
 *
 * @module admin/routes/features/system
 */
import { NAV_COPY } from '../../../copy/id/nav.js';
import { page } from '../pageRef.js';

const { items, tabs, groups } = NAV_COPY;

/** @type {import('../index.js').RouteFeature} */
export const systemRoutes = {
  id: 'system',
  pages: {
    'dev-overview': page(() => import('../../dev/overview/SystemOverviewPage.jsx'), 'SystemOverviewPage'),
    'dev-kill-switches': page(() => import('../../dev/killswitch/KillSwitchPage.jsx'), 'KillSwitchPage'),
    'dev-usage': page(() => import('../../dev/usage/UsageBudgetPage.jsx'), 'UsageBudgetPage'),
    'ai-usage': page(() => import('../../config/AiUsagePage.jsx'), 'AiUsagePage'),
    'server-log': page(() => import('../../dev/logs/ServerLogPage.jsx'), 'ServerLogPage'),
    'server-log-audit': page(() => import('../../dev/logs/AuditLogPage.jsx'), 'AuditLogPage'),
    'server-log-health': page(() => import('../../dev/logs/HealthPage.jsx'), 'HealthPage'),
    'ui-kit': page(() => import('../../dev/UiKitPage.jsx'), 'UiKitPage'),
  },
  nav: {
    admin: [],
    dev: [
      {
        order: 10,
        id: 'overview',
        title: null,
        items: [{ id: 'overview', label: items.systemOverview, path: '/', icon: 'overview', page: 'dev-overview' }],
      },
      {
        order: 30,
        id: 'control',
        title: groups.control,
        items: [
          { id: 'kill-switches', label: items.killSwitches, path: '/kill-switches', icon: 'killSwitch', page: 'dev-kill-switches' },
          {
            id: 'usage',
            label: items.usageAndCost,
            path: '/usage',
            icon: 'usage',
            tabs: [
              { id: 'budget', label: tabs.providerBudget, path: '/usage/budget', page: 'dev-usage' },
              { id: 'ai', label: tabs.aiUsage, path: '/usage/ai', page: 'ai-usage' },
            ],
          },
        ],
      },
      {
        order: 50,
        id: 'system',
        title: groups.system,
        items: [{
          id: 'ui-kit',
          label: items.uiKit,
          path: '/ui-kit',
          icon: 'general',
          hidden: true,
          page: 'ui-kit',
        }, {
          id: 'logs',
          label: items.logs,
          path: '/logs',
          icon: 'logs',
          tabs: [
            { id: 'server', label: tabs.serverLog, path: '/logs/server', page: 'server-log' },
            { id: 'audit', label: tabs.keyAudit, path: '/logs/audit', page: 'server-log-audit' },
            { id: 'health', label: tabs.health, path: '/logs/health', page: 'server-log-health' },
          ],
        }],
      },
    ],
  },
  redirects: {
    admin: {},
    dev: {
      '/ai/usage': '/usage/ai',
      '/server-log': '/logs/server',
      '/server-log/audit': '/logs/audit',
      '/server-log/health': '/logs/health',
    },
  },
};
