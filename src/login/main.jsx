// src/login/main.jsx
/** Entry of `/login`, `/account` and `/account/password` (same bundle). Tailwind + tokens from src/ui/app.css; the old pages still use the legacy bridge styles. */
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppProviders } from '@/components/app/AppProviders.jsx';
import '../ui/app.css';
import '../admin/adminTheme.css';
import './login.css';
import { AccountPage } from './AccountPage.jsx';
import { ChangePasswordPage } from './ChangePasswordPage.jsx';
import { LoginApp } from './LoginApp.jsx';

createRoot(document.getElementById('login-root')).render(
  <AppProviders>
    <BrowserRouter>
      <Routes>
        <Route path="/account/password" element={<ChangePasswordPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<LoginApp />} />
      </Routes>
    </BrowserRouter>
  </AppProviders>,
);
