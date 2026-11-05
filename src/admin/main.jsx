// src/admin/main.jsx
/** Entry of the /admin dashboard. React is loaded only from this bundle. */
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AdminApp } from './AdminApp.jsx';
import './adminTheme.css';

createRoot(document.getElementById('admin-root')).render(
  <BrowserRouter basename="/admin">
    <AdminApp />
  </BrowserRouter>,
);
