// src/admin/AdminApp.jsx
/** Route table of one dashboard area (`/admin` or `/dev`): one route per leaf of that area's nav. */
import { Navigate, Route, Routes } from 'react-router';
import { areaHome, areaLeaves, groupLanding, groupRedirects } from './adminNav.js';
import { AdminLayout } from './AdminLayout.jsx';
import { AiProviderPage } from './pages/AiProviderPage.jsx';
import { ApiKeysPage } from './pages/ApiKeysPage.jsx';
import { AuditLogPage } from './pages/AuditLogPage.jsx';
import { SystemHealthPage } from './pages/SystemHealthPage.jsx';
import { GeneralPage } from './pages/GeneralPage.jsx';
import { PersonaPage } from './pages/PersonaPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { ServerLogPage } from './pages/ServerLogPage.jsx';
import { UsagePage } from './pages/UsagePage.jsx';
import { AccountAuditPage } from './users/AccountAuditPage.jsx';
import { LoginLogPage } from './users/LoginLogPage.jsx';
import { UsersOverviewPage } from './users/UsersOverviewPage.jsx';
import { UsersPage } from './users/UsersPage.jsx';

/** Built pages by the `page` id a nav leaf names; a leaf without one renders the placeholder. */
const PAGES = {
  'server-log': ServerLogPage,
  'server-log-audit': AuditLogPage,
  'server-log-health': SystemHealthPage,
  'ai-general': GeneralPage,
  'ai-provider': AiProviderPage,
  'ai-persona': PersonaPage,
  'ai-usage': UsagePage,
  'api-keys': ApiKeysPage,
  users: UsersPage,
  'users-overview': UsersOverviewPage,
  'login-log': LoginLogPage,
  'account-audit': AccountAuditPage,
};

function pageFor(leaf, session, area) {
  const Page = leaf.page ? PAGES[leaf.page] : null;
  return Page ? <Page session={session} area={area} /> : <PlaceholderPage title={leaf.label} />;
}

function leafRoute(leaf, session, area) {
  if (leaf.path === '/') return <Route key={leaf.path} index element={pageFor(leaf, session, area)} />;
  return <Route key={leaf.path} path={leaf.path.slice(1)} element={pageFor(leaf, session, area)} />;
}

/** Routes of `area` inside the shared layout. */
export function AdminApp({ area, session }) {
  const home = areaHome(area);
  const leaves = areaLeaves(area);
  return (
    <Routes>
      <Route element={<AdminLayout area={area} session={session} />}>
        {/* The area home is the `/` leaf, so it is the index route (adminNav.test pins this). */}
        {/* Old /admin/login bookmarks land on the area home (login is /login now). */}
        <Route path="login" element={<Navigate to={home} replace />} />
        {groupRedirects(area).map((group) => (
          <Route key={group.id} path={group.path.slice(1)} element={<Navigate to={groupLanding(group)} replace />} />
        ))}
        {leaves.map((leaf) => leafRoute(leaf, session, area))}
        <Route path="*" element={<PlaceholderPage title="Halaman tidak ditemukan" notFound />} />
      </Route>
    </Routes>
  );
}
