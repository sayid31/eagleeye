// src/admin/pages/AiProviderPage.jsx
/**
 * AI Configuration → AI Provider: the OpenAI key that powers the voice
 * assistant (status, replace, remove, test). Model and voice selection are
 * added in a later stage (T6); the provider stays OpenAI (plan decision 6).
 */
import { KeyCard } from '../components/KeyCard.jsx';
import { SaveStatus, Section } from '../components/FormControls.jsx';
import { partitionKeys, storeLabel } from './apiKeysView.js';
import { useProviderKeys } from './useProviderKeys.js';

export function AiProviderPage() {
  const { data, loadError, status, busy, submit } = useProviderKeys();

  if (loadError) return <section className="adm-card"><h1>AI Provider</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>AI Provider</h1><p>Loading…</p></section>;

  const { ai } = partitionKeys(data.keys);
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>AI Provider</h1>
        <p className="adm-muted">OpenAI powers the voice assistant, the screen reader and the HUD summary. The key is saved to {storeLabel(data.store)} on this computer and never shown.</p>
        <SaveStatus status={status} />
      </header>
      {ai.keys.map((key) => (
        <KeyCard key={key.id} keyInfo={key} note={data.testNotes?.[key.id] ?? ''} busy={busy} onSave={submit} onRemove={submit} />
      ))}
      <Section title="Model and voice" description="Choosing the OpenAI model and voice is added in a later stage. The current defaults stay in effect." />
    </div>
  );
}
