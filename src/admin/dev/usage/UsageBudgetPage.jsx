// src/admin/dev/usage/UsageBudgetPage.jsx
/**
 * /dev → Pemakaian (Pemakaian & budget): OpenSky credits (governor), TomTom daily tile budget and OpenAI voice
 * usage, read-only, from the server's own counters. A provider without a key shows an empty state, not zeros.
 */
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { USAGE_COPY as T } from '@/copy/en/system';
import { fetchUsage } from '../devApi.js';
import { RefreshBar } from '../lib/RefreshBar.jsx';
import { ResourceBody } from '../lib/ResourceBody.jsx';
import { useDevResource } from '../lib/useDevResource.js';
import { ProviderCard } from './ProviderCard.jsx';
import { VoiceDaysCard } from './VoiceDaysCard.jsx';
import { providerCards } from './usageBudgetView.js';

/** Pemakaian page. */
export function UsageBudgetPage() {
  const resource = useDevResource(fetchUsage);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={T.title}
        description={T.description}
        actions={<RefreshBar label={T.refresh} updatedAt={resource.data?.generatedAt} loading={resource.loading} onRefresh={resource.reload} />}
      />
      <ResourceBody resource={resource} loadingLabel={T.loadingLabel} errorTitle={T.errorTitle}>
        {(report) => {
          const voice = report.providers.find((provider) => provider.id === 'openai');
          return (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {providerCards(report).map((card) => <ProviderCard key={card.id} card={card} />)}
              </div>
              {voice?.data ? <VoiceDaysCard days={voice.data.days} /> : null}
            </>
          );
        }}
      </ResourceBody>
    </div>
  );
}
