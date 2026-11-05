// src/admin/AdminLayout.jsx
/** Sidebar + topbar frame shared by every admin page, including the theme toggle. */
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ADMIN_NAV } from './adminNav.js';
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
          {leaf.soon ? <span className="adm-badge">Soon</span> : null}
        </NavLink>
      ))}
    </div>
  );
}

export function AdminLayout() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    try { window.localStorage.setItem(ADMIN_THEME_KEY, theme); } catch { /* storage blocked: choice lasts this visit only */ }
  }, [theme]);

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar" aria-label="Admin navigation">
        <div className="adm-brand">EagleEye <span>Admin</span></div>
        <nav>{ADMIN_NAV.map((group) => <NavGroup key={group.id} group={group} />)}</nav>
      </aside>
      <div className="adm-main">
        <header className="adm-topbar">
          <a className="adm-link" href="/">Back to map</a>
          <button type="button" className="adm-btn" onClick={() => setTheme(nextTheme(theme))} aria-label={`Switch to ${nextTheme(theme)} mode`}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </header>
        <main className="adm-content"><Outlet /></main>
      </div>
    </div>
  );
}
