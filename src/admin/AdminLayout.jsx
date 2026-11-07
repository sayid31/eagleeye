// src/admin/AdminLayout.jsx
/** Sidebar + topbar frame shared by every admin page, including the theme toggle. */
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ADMIN_NAV } from './adminNav.js';
import { logout } from './adminSessionApi.js';
import { ADMIN_THEME_KEY, nextTheme, resolveTheme } from './adminTheme.js';

function readInitialTheme() {
  let stored = null;
  try { stored = window.localStorage.getItem(ADMIN_THEME_KEY); } catch { /* storage blocked: follow the OS */ }
  return resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function NavGroup({ group }) {
  if (!group.children) {
    return <NavLink className="adm-nav-link" to={group.path}>{group.label}</NavLink>;
  }
  return (
    <div className="adm-nav-group">
      <div className="adm-nav-heading">{group.label}</div>
      {group.children.map((leaf) => (
        <NavLink key={leaf.path} className="adm-nav-link adm-nav-child" to={leaf.path} end>
          {leaf.label}
          {leaf.soon ? <span className="adm-badge">Segera</span> : null}
        </NavLink>
      ))}
    </div>
  );
}

export function AdminLayout({ session }) {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    try { window.localStorage.setItem(ADMIN_THEME_KEY, theme); } catch { /* storage blocked: choice lasts this visit only */ }
  }, [theme]);

  const signOut = () => logout()
    .catch((error) => console.warn(`[admin] ${error.message}`))
    .finally(() => window.location.assign('/admin'));

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar" aria-label="Navigasi admin">
        <div className="adm-brand"><img src="/logo.svg" alt="" width="28" height="28" /><span><b>Eagle</b>Eye</span><span className="adm-brand-sub">Admin</span></div>
        <nav>{ADMIN_NAV.map((group) => <NavGroup key={group.id} group={group} />)}</nav>
      </aside>
      <div className="adm-main">
        <header className="adm-topbar">
          <a className="adm-link" href="/">← Kembali ke peta</a>
          <div className="adm-topbar-actions">
            <span className="adm-user">{session?.email}</span>
            <button type="button" className="adm-btn" onClick={() => setTheme(nextTheme(theme))} aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}>
              {theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            </button>
            <button type="button" className="adm-btn" onClick={signOut}>Keluar</button>
          </div>
        </header>
        <main className="adm-content"><Outlet /></main>
      </div>
    </div>
  );
}
