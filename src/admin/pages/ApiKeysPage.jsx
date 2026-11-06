// src/admin/pages/ApiKeysPage.jsx
/**
 * /admin → API Keys: the data-source provider keys (maps, ships, fires,
 * traffic, flights, launches). The AI model key (OpenAI) lives on
 * AI Configuration → AI Provider instead.
 */
import { KeyCard } from '../components/KeyCard.jsx';
import { SaveStatus } from '../components/FormControls.jsx';
import { partitionKeys, storeLabel } from './apiKeysView.js';
import { useProviderKeys } from './useProviderKeys.js';

export function ApiKeysPage() {
  const { data, loadError, status, busy, submit } = useProviderKeys();

  if (loadError) return <section className="adm-card"><h1>API Keys</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>API Keys</h1><p>Loading…</p></section>;

  const { data: keys } = partitionKeys(data.keys);
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>API Keys</h1>
        <p className="adm-muted" role="status">
          {keys.setCount} of {keys.total} configured · saved to {storeLabel(data.store)} on this computer. Key values are never shown.
          {' '}The OpenAI key is under AI Configuration → AI Provider.
        </p>
        <SaveStatus status={status} />
      </header>
      {keys.keys.map((key) => (
        <KeyCard key={key.id} keyInfo={key} note={data.testNotes?.[key.id] ?? ''} busy={busy} onSave={submit} onRemove={submit} />
      ))}
    </div>
  );
}
