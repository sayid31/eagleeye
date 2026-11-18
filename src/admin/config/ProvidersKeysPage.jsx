// src/admin/config/ProvidersKeysPage.jsx
/**
 * /dev → Penyedia & API Keys → API Keys: one row per provider (key present or not, where it comes from, last connection
 * test) and a sheet to set, replace, test or remove a key. Key values are never shown, only sent.
 */
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { RouteTabNav } from '@/components/app/RouteTabs.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PROVIDERS_COPY as T } from '@/copy/id/config';
import { KeySheet } from './KeySheet.jsx';
import { ProviderTable } from './ProviderTable.jsx';
import { providerRows, providersSummary } from './providerKeysView.js';
import { useProviderKeys } from './useProviderKeys.js';

/** API Keys tab. */
export function ProvidersKeysPage() {
  const keys = useProviderKeys();
  const [openId, setOpenId] = useState(null);
  const rows = keys.payload ? providerRows(keys.payload, keys.tests) : [];
  // The sheet row is looked up by id so it follows the refreshed payload after a test or a save.
  const sheetRow = rows.find((row) => row.id === openId) ?? null;
  return (
    <>
      <PageHeader title={T.title} description={keys.payload ? providersSummary(keys.payload) : T.keysDescription} tabs={<RouteTabNav />} />
      {keys.restarting ? (
        <Alert className="mb-4" role="status">
          <RotateCw aria-hidden="true" />
          <AlertTitle>{T.restarting.title}</AlertTitle>
          <AlertDescription>{T.restarting.description}</AlertDescription>
        </Alert>
      ) : null}
      <ProviderTable rows={rows} loading={keys.loading} error={keys.payload ? null : keys.error} onRetry={keys.reload} busy={keys.restarting} onOpen={setOpenId} />
      <KeySheet row={sheetRow} onOpenChange={(open) => { if (!open) setOpenId(null); }} onSaved={keys.applySaved} onTested={keys.recordTest} />
    </>
  );
}
