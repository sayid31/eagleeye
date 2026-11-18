// src/admin/AdminApp.jsx
/**
 * Route table of one dashboard area (`/admin` or `/dev`), built from the composed navigation (adminNav.js): one lazy
 * route per page, tab items as nested routes under a RouteTabs strip, and a redirect for every legacy path. It owns no
 * page; pages register in src/admin/routes/features/*.js.
 */
import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { RouteTabs } from '@/components/app/RouteTabs.jsx';
import { SHELL_COPY } from '@/copy/id/shell';
import { PAGE_TABLE, areaHome, navForArea, redirectsFor } from './adminNav.js';
import { AdminLayout } from './AdminLayout.jsx';
import { loadPage } from './routes/pageRef.js';

const lazyPages = new Map();

/** One `React.lazy` component per page id (created once so a route change never remounts it). */
function lazyPage(id) {
  if (!lazyPages.has(id)) lazyPages.set(id, lazy(() => loadPage(PAGE_TABLE[id])));
  return lazyPages.get(id);
}

/** Client-side redirect that keeps the query string and hash (e.g. `/login-log?userId=…` → `/activity/login?userId=…`). */
function RedirectTo({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

function NotFoundPage() {
  return <EmptyState title={SHELL_COPY.notFoundTitle} description={SHELL_COPY.notFoundDescription} />;
}

function PageElement({ id, session, area }) {
  if (!PAGE_TABLE[id]) return <NotFoundPage />;
  const Page = lazyPage(id);
  return <Page session={session} area={area} />;
}

const relativePath = (path) => path.slice(1);

function itemRoute(item, session, area) {
  if (!item.tabs) {
    const element = <PageElement id={item.page} session={session} area={area} />;
    return item.path === '/' ? <Route key={item.id} index element={element} /> : <Route key={item.id} path={relativePath(item.path)} element={element} />;
  }
  return (
    <Route key={item.id} path={relativePath(item.path)} element={<RouteTabs label={item.label} tabs={item.tabs} />}>
      <Route index element={<RedirectTo to={item.tabs[0].path} />} />
      {item.tabs.map((tab) => (
        <Route key={tab.id} path={tab.path.slice(item.path.length + 1)} element={<PageElement id={tab.page} session={session} area={area} />} />
      ))}
    </Route>
  );
}

/** Routes of `area` inside the shared layout. */
export function AdminApp({ area, session }) {
  const home = areaHome(area);
  return (
    <Routes>
      <Route element={<AdminLayout area={area} session={session} />}>
        {/* Old /admin/login bookmarks land on the area home (login is /login now). */}
        <Route path="login" element={<RedirectTo to={home} />} />
        {Object.entries(redirectsFor(area)).map(([from, to]) => (
          <Route key={from} path={relativePath(from)} element={<RedirectTo to={to} />} />
        ))}
        {navForArea(area).flatMap((group) => group.items).map((item) => itemRoute(item, session, area))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
