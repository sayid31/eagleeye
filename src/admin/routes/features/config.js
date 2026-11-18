/**
 * Feature "Konfigurasi" (/dev only): API Keys and the AI Configuration pages (Umum, AI Provider, Persona, Pemakaian &
 * Biaya). Owner of: src/admin/config/**. Register a page here and give it a menu entry in ../../adminNav.js.
 *
 * @module admin/routes/features/config
 */
import { page } from '../pageRef.js';

/** @type {import('../index.js').RouteFeature} */
export const configRoutes = {
  id: 'config',
  pages: {
    'api-keys': page(() => import('../../config/ProvidersKeysPage.jsx'), 'ProvidersKeysPage'),
    'ai-provider': page(() => import('../../config/AiProviderPage.jsx'), 'AiProviderPage'),
    'ai-general': page(() => import('../../config/GeneralPage.jsx'), 'GeneralPage'),
    'ai-persona': page(() => import('../../config/PersonaPage.jsx'), 'PersonaPage'),
    'ai-usage': page(() => import('../../config/AiUsagePage.jsx'), 'AiUsagePage'),
  },
};
