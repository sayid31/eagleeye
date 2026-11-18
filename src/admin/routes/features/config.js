// src/admin/routes/features/config.js
/**
 * Feature "Konfigurasi" (/dev only): Penyedia & API Keys, Umum, Persona.
 * Owner of: src/admin/pages/{ai*,api-keys,general,persona}*, src/admin/components/KeyCard. Edit ONLY this file to add
 * or move a page of this feature (see access.js for the shape).
 *
 * Phase 0: "Penyedia & API Keys" still shows the two existing pages as tabs (API Keys | Penyedia AI); the merged
 * provider table replaces them in phase 1.
 *
 * @module admin/routes/features/config
 */
import { NAV_COPY } from '../../../copy/id/nav.js';
import { page } from '../pageRef.js';

const { items, tabs, groups } = NAV_COPY;

/** @type {import('../index.js').RouteFeature} */
export const configRoutes = {
  id: 'config',
  pages: {
    'api-keys': page(() => import('../../pages/ApiKeysPage.jsx'), 'ApiKeysPage'),
    'ai-provider': page(() => import('../../pages/AiProviderPage.jsx'), 'AiProviderPage'),
    'ai-general': page(() => import('../../pages/GeneralPage.jsx'), 'GeneralPage'),
    'ai-persona': page(() => import('../../pages/PersonaPage.jsx'), 'PersonaPage'),
  },
  nav: {
    admin: [],
    dev: [{
      order: 40,
      id: 'config',
      title: groups.config,
      items: [
        {
          id: 'providers',
          label: items.providers,
          path: '/providers',
          icon: 'providers',
          tabs: [
            { id: 'keys', label: tabs.apiKeys, path: '/providers/keys', page: 'api-keys' },
            { id: 'ai', label: tabs.aiProvider, path: '/providers/ai', page: 'ai-provider' },
          ],
        },
        { id: 'general', label: items.general, path: '/general', icon: 'general', page: 'ai-general' },
        { id: 'persona', label: items.persona, path: '/persona', icon: 'persona', page: 'ai-persona' },
      ],
    }],
  },
  redirects: {
    admin: {},
    dev: {
      '/api-keys': '/providers/keys',
      '/ai': '/general',
      '/ai/general': '/general',
      '/ai/provider': '/providers/ai',
      '/ai/persona': '/persona',
    },
  },
};
