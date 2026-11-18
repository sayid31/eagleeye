// src/admin/routes/features/system.js
/**
 * Feature "Sistem" (/dev only): system overview, Sakelar darurat, Pemakaian & Biaya, Log server (+ audit trail, health).
 * Owner of: src/admin/dev/**, src/admin/pages/{log,audit,health,usage}*. Edit ONLY this file to add or move a page of
 * this feature (see access.js for the shape).
 *
 * @module admin/routes/features/system
 */
import { NAV_COPY } from '../../../copy/id/nav.js';
import { page } from '../pageRef.js';

const { items, tabs, groups } = NAV_COPY;
const devPage = (id) => page(() => import('../../dev/devPages.js'), (module) => module.DEV_PAGES[id]);

/** @type {import('../index.js').RouteFeature} */
export const systemRoutes = {
  id: 'system',
  pages: {
    'dev-overview': devPage('dev-overview'),
    'dev-kill-switches': devPage('dev-kill-switches'),
    'dev-usage': devPage('dev-usage'),
    'ai-usage': page(() => import('../../pages/UsagePage.jsx'), 'UsagePage'),
    'server-log': page(() => import('../../pages/ServerLogPage.jsx'), 'ServerLogPage'),
    'server-log-audit': page(() => import('../../pages/AuditLogPage.jsx'), 'AuditLogPage'),
    'server-log-health': page(() => import('../../pages/SystemHealthPage.jsx'), 'SystemHealthPage'),
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
