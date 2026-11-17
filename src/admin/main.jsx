// src/admin/main.jsx
/**
 * Entry of the admin bundle, served for both `/admin/*` and `/dev/*`; the
 * browser path picks the area and its router basename. React is loaded only
 * from this bundle.
 */
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AdminApp } from './AdminApp.jsx';
import { AdminGate } from './AdminGate.jsx';
import { adminArea, adminBasename } from './adminNav.js';
import './adminTheme.css';
import './adminForms.css';

const { pathname } = window.location;

createRoot(document.getElementById('admin-root')).render(
  <BrowserRouter basename={adminBasename(pathname)}>
    <AdminGate>{(session) => <AdminApp area={adminArea(pathname)} session={session} />}</AdminGate>
  </BrowserRouter>,
);
