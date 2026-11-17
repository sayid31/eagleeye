// src/admin/pages/PlaceholderPage.jsx
/** Stand-in for a menu page that is not built yet, and the not-found page. No data. */
export function PlaceholderPage({ title, notFound = false }) {
  return (
    <section className="adm-card">
      <h1>{title}</h1>
      <p>{notFound ? 'Halaman ini tidak ada.' : 'Halaman ini sedang disiapkan.'}</p>
    </section>
  );
}
