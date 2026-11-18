// src/admin/main.jsx
/**
 * Entry of the admin bundle, served for both `/admin/*` and `/dev/*`; the browser path picks the area and its router
 * basename. React and Tailwind (src/ui/app.css) are loaded only from the React entries, never from the map.
 */
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppProviders } from '@/components/app/AppProviders.jsx';
import '../ui/app.css';
import './adminTheme.css';
import './adminForms.css';
import { AdminApp } from './AdminApp.jsx';
import { AdminGate } from './AdminGate.jsx';
import { adminArea, adminBasename } from './adminNav.js';

const { pathname } = window.location;

createRoot(document.getElementById('admin-root')).render(
  <AppProviders>
    <BrowserRouter basename={adminBasename(pathname)}>
      <AdminGate>{(session) => <AdminApp area={adminArea(pathname)} session={session} />}</AdminGate>
    </BrowserRouter>
  </AppProviders>,
);
