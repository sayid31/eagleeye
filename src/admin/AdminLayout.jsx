// src/admin/AdminLayout.jsx
/** Sidebar frame shared by every page of both areas: brand, menu, and the account/theme controls at its foot. */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { areaLabel, areaSwitchFor, breadcrumbFor, navForArea, roleLabel } from './adminNav.js';
import { signOutAndLeave } from '../auth/authClientApi.js';
import { ADMIN_THEME_KEY, nextTheme, resolveTheme } from './adminTheme.js';

function readInitialTheme() {
  let stored = null;
  try { stored = window.localStorage.getItem(ADMIN_THEME_KEY); } catch { /* storage blocked: follow the OS */ }
  return resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function NavGroup({ group }) {
  if (!group.children) {
    return <NavLink className="adm-nav-link" to={group.path} end>{group.label}</NavLink>;
  }
  return (
    <div className="adm-nav-group">
      <div className="adm-nav-heading">{group.label}</div>
      {group.children.map((leaf) => (
        <NavLink key={leaf.path} className="adm-nav-link adm-nav-child" to={leaf.path} end>{leaf.label}</NavLink>
      ))}
    </div>
  );
}

/** Layout route of `area`; `session` is the `/api/me` v2 payload. */
export function AdminLayout({ area, session }) {
  const [theme, setTheme] = useState(readInitialTheme);
  const crumbs = breadcrumbFor(area, useLocation().pathname);
  const user = session?.user;
  const areaSwitch = areaSwitchFor(area, user?.role);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    try { window.localStorage.setItem(ADMIN_THEME_KEY, theme); } catch { /* storage blocked: choice lasts this visit only */ }
  }, [theme]);

  const signOut = () => { void signOutAndLeave(); };

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar" aria-label={`Navigasi ${areaLabel(area)}`}>
        <div className="adm-brand"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>Eagle</b>Eye</span><span className="adm-brand-sub">{areaLabel(area)}</span></div>
        <nav className="adm-nav">{navForArea(area).map((group) => <NavGroup key={group.id} group={group} />)}</nav>
        <div className="adm-sidebar-foot">
          <a className="adm-nav-link adm-back" href="/app">← Kembali ke peta</a>
          {areaSwitch ? <a className="adm-nav-link" href={areaSwitch.href}>{areaSwitch.label}</a> : null}
          <div className="adm-account">
            <span className="adm-account-label">Masuk sebagai</span>
            <span className="adm-user" title={user?.email}>{user?.email}</span>
            <span className="adm-account-label">{roleLabel(user?.role)}</span>
          </div>
          <div className="adm-sidebar-actions">
            <button type="button" className="adm-btn" onClick={() => setTheme(nextTheme(theme))} aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}>
              {theme === 'dark' ? 'Terang' : 'Gelap'}
            </button>
            <button type="button" className="adm-btn" onClick={signOut}>Keluar</button>
          </div>
        </div>
      </aside>
      <div className="adm-main">
        <main className="adm-content">
          {crumbs.length ? <p className="adm-crumbs" aria-label="Lokasi">{crumbs.join(' / ')}</p> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
