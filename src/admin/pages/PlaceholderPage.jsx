// src/admin/pages/PlaceholderPage.jsx
/** Stand-in for pages built in later stages (T2–T7); replaced one by one. */
export function PlaceholderPage({ title, soon = false, notFound = false }) {
  let note = 'Halaman ini dibuat di tahap berikutnya.';
  if (soon) note = 'Direncanakan setelah Server Log. Belum tersedia.';
  if (notFound) note = 'Halaman admin ini tidak ada.';
  return (
    <section className="adm-card">
      <h1>{title}</h1>
      <p>{note}</p>
    </section>
  );
}
