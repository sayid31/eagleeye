// src/admin/pages/PlaceholderPage.jsx
/** Stand-in for pages built in later stages (T2–T7); replaced one by one. */
export function PlaceholderPage({ title, soon = false, notFound = false }) {
  let note = 'This page is built in a later stage.';
  if (soon) note = 'Planned after Server Log. Not available yet.';
  if (notFound) note = 'This admin page does not exist.';
  return (
    <section className="adm-card">
      <h1>{title}</h1>
      <p>{note}</p>
    </section>
  );
}
