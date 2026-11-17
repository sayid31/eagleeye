// src/login/main.jsx
/** Entry of `/login` and `/account*` (same bundle). Shares the /admin theme tokens and Google button. */
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ADMIN_THEME_KEY, resolveTheme } from '../admin/adminTheme.js';
import { ChangePasswordPage } from './ChangePasswordPage.jsx';
import { LoginApp } from './LoginApp.jsx';
import '../admin/adminTheme.css';
import './login.css';

function applySavedTheme() {
  let stored = null;
  try { stored = window.localStorage.getItem(ADMIN_THEME_KEY); } catch { /* storage blocked: follow the OS */ }
  document.documentElement.dataset.adminTheme = resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches);
}

applySavedTheme();
createRoot(document.getElementById('login-root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/account/*" element={<ChangePasswordPage />} />
      <Route path="*" element={<LoginApp />} />
    </Routes>
  </BrowserRouter>,
);
