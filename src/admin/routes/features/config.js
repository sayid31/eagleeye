// src/admin/routes/features/config.js
/**
 * Feature "Konfigurasi" (/dev only): Penyedia & API Keys, Umum, Persona.
 * Owner of: src/admin/config/** (provider table + key sheet, model and voice, Umum, Persona, Pemakaian AI). Edit ONLY
 * this file to add or move a page of this feature (see access.js for the shape). The "Pemakaian AI" tab of
 * Pemakaian & Biaya (`ai-usage`) belongs to this feature's code but is placed in the system feature's nav.
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
    'api-keys': page(() => import('../../config/ProvidersKeysPage.jsx'), 'ProvidersKeysPage'),
    'ai-provider': page(() => import('../../config/AiProviderPage.jsx'), 'AiProviderPage'),
    'ai-general': page(() => import('../../config/GeneralPage.jsx'), 'GeneralPage'),
    'ai-persona': page(() => import('../../config/PersonaPage.jsx'), 'PersonaPage'),
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
