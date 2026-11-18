// src/components/app/PageHeader.jsx
/** The page's single <h1>, a one-line description and a slot for the primary actions; also sets the document title. */
import { useEffect } from 'react';
import { usePageTitleSetter } from './PageTitleContext.jsx';

/**
 * @param {{title: string, description?: string, actions?: import('react').ReactNode}} props
 */
export function PageHeader({ title, description, actions }) {
  const setTitle = usePageTitleSetter();
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
