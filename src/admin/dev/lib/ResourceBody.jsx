// src/admin/dev/lib/ResourceBody.jsx
/** The four states of a page that loads one resource: skeleton, error (retry), stale-data warning, content. */
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { errorMessage } from '@/copy/en/errors';

/**
 * @param {{
 *   resource: {data: any, error: unknown, loading: boolean, reload: () => void},
 *   loadingLabel: string, errorTitle: string, loadingVariant?: 'rows' | 'cards' | 'form',
 *   children: (data: any) => import('react').ReactNode,
 * }} props With data on screen, a failed reload keeps it and adds a warning instead of replacing the page.
 */
export function ResourceBody({ resource, loadingLabel, errorTitle, loadingVariant = 'cards', children }) {
  const { data, error, reload } = resource;
  if (!data && error) return <ErrorState title={errorTitle} error={error} onRetry={reload} />;
  if (!data) return <LoadingState variant={loadingVariant} label={loadingLabel} />;
  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{errorTitle}</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      {children(data)}
    </div>
  );
}
