// src/admin/AdminApp.jsx
/**
 * Route table of one dashboard area (`/admin` or `/dev`), built from the navigation (adminNav.js): one lazy route per
 * menu item, plus the bare-group redirect (`/ai` → `/ai/general`). It owns no page; pages register in
 * src/admin/routes/features/*.js.
 */
import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { SHELL_COPY } from '@/copy/id/shell';
import { PAGE_TABLE, areaHome, areaLeaves, groupRedirects } from './adminNav.js';
import { AdminLayout } from './AdminLayout.jsx';
import { loadPage } from './routes/pageRef.js';

const lazyPages = new Map();

/** One `React.lazy` component per page id (created once so a route change never remounts it). */
function lazyPage(id) {
  if (!lazyPages.has(id)) lazyPages.set(id, lazy(() => loadPage(PAGE_TABLE[id])));
  return lazyPages.get(id);
}

/** Client-side redirect that keeps the query string and hash. */
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

function leafRoute(leaf, session, area) {
  const element = <PageElement id={leaf.page} session={session} area={area} />;
  return leaf.path === '/' ? <Route key={leaf.path} index element={element} /> : <Route key={leaf.path} path={relativePath(leaf.path)} element={element} />;
}

/** Routes of `area` inside the shared layout. */
export function AdminApp({ area, session }) {
  const home = areaHome(area);
  return (
    <Routes>
      <Route element={<AdminLayout area={area} session={session} />}>
        {/* Old /admin/login bookmarks land on the area home (login is /login now). */}
        <Route path="login" element={<RedirectTo to={home} />} />
        {groupRedirects(area).map(({ path, to }) => (
          <Route key={path} path={relativePath(path)} element={<RedirectTo to={to} />} />
        ))}
        {areaLeaves(area).map((leaf) => leafRoute(leaf, session, area))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
