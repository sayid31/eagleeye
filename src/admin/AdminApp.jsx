// src/admin/AdminApp.jsx
/** Route table of the /admin dashboard: one route per leaf in ADMIN_NAV. */
import { Navigate, Route, Routes } from 'react-router';
import { ADMIN_HOME_PATH, ADMIN_NAV, adminLeaves, groupLanding } from './adminNav.js';
import { AdminLayout } from './AdminLayout.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';

export function AdminApp({ session }) {
  return (
    <Routes>
      <Route element={<AdminLayout session={session} />}>
        <Route index element={<Navigate to={ADMIN_HOME_PATH} replace />} />
        {/* Signed-in visitors who reopen the login URL land on the dashboard. */}
        <Route path="login" element={<Navigate to={ADMIN_HOME_PATH} replace />} />
        {ADMIN_NAV.filter((group) => group.children).map((group) => (
          <Route key={group.id} path={group.path.slice(1)} element={<Navigate to={groupLanding(group)} replace />} />
        ))}
        {adminLeaves().map((leaf) => (
          <Route key={leaf.path} path={leaf.path.slice(1)} element={<PlaceholderPage title={leaf.label} soon={leaf.soon} />} />
        ))}
        <Route path="*" element={<PlaceholderPage title="Page not found" notFound />} />
      </Route>
    </Routes>
  );
}
