// src/admin/AdminLayout.jsx
/** Layout route of an area: feeds AppShell with the area's menu, the signed-in user and the sign-out action. */
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AppShell } from '@/components/app/AppShell.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { APP_NAME } from '@/copy/id/common';
import { signOutAndLeave } from '../auth/authClientApi.js';
import { areaSwitchFor, navForArea } from './adminNav.js';
import { SHELL_COPY } from '@/copy/id/shell';

/** Developer area gets a badge so it never passes for /admin. */
const brandFor = (area) => ({ name: APP_NAME, badge: area === 'dev' ? SHELL_COPY.developerBadge : undefined });

/** Layout route of `area`; `session` is the `/api/me` v2 payload. */
export function AdminLayout({ area, session }) {
  const { pathname } = useLocation();
  const user = session?.user;
  return (
    <AppShell
      area={area}
      brand={brandFor(area)}
      groups={navForArea(area)}
      pathname={pathname}
      user={user}
      areaLink={areaSwitchFor(area, user?.role)}
      onSignOut={() => { void signOutAndLeave(); }}
    >
      <Suspense fallback={<LoadingState />}><Outlet /></Suspense>
    </AppShell>
  );
}
