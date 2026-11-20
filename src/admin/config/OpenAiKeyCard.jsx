// src/admin/config/OpenAiKeyCard.jsx
/**
 * The OpenAI key, managed in place on AI Provider: status, the visible Test connection button and the same side sheet as API Keys (set, replace,
 * test, delete). Key values are never shown. Saving restarts the server, so the buttons stay off afterwards.
 */
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AI_PROVIDER_COPY as T, PROVIDERS_COPY } from '@/copy/en/config';
import { SettingsCard } from './GeneralSections.jsx';
import { KeySheet } from './KeySheet.jsx';
import { KeyStatusBadge, ProviderActions, TestCell } from './ProviderCells.jsx';
import { AI_PROVIDER_PAGE_OWNER, providerRows } from './providerKeysView.js';

/** @param {{keys: ReturnType<import('./useProviderKeys.js').useProviderKeys>}} props */
export function OpenAiKeyCard({ keys }) {
  const [open, setOpen] = useState(false);
  const row = keys.payload ? providerRows(keys.payload, keys.tests, AI_PROVIDER_PAGE_OWNER).find((r) => r.id === 'openai') : null;
  if (!row) return null;
  const P = PROVIDERS_COPY;
  return (
    <>
      <SettingsCard title={T.keyCard.title} description={T.keyCard.description}>
        {keys.restarting ? (
          <Alert role="status">
            <RotateCw aria-hidden="true" />
            <AlertTitle>{P.restarting.title}</AlertTitle>
            <AlertDescription>{P.restarting.description}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <KeyStatusBadge status={row.status} />
            <span className="flex flex-wrap items-center gap-1.5 text-sm"><span className="text-muted-foreground">{P.columns.test}:</span><TestCell row={row} /></span>
          </div>
          <ProviderActions row={row} onOpen={() => setOpen(true)} onTest={keys.runTest} testing={keys.testing} disabled={keys.restarting} />
        </div>
        {row.key.set ? null : <p className="text-sm text-muted-foreground">{T.keyCard.missing}</p>}
      </SettingsCard>
      <KeySheet row={open ? row : null} onOpenChange={setOpen} onSaved={keys.applySaved} onTested={keys.recordTest} />
    </>
  );
}
