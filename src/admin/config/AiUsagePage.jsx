// src/admin/config/AiUsagePage.jsx
/**
 * /dev → Konfigurasi AI → Pemakaian & Biaya: today's minutes against the daily cap, a per-day table priced with the
 * current GPT-Live rates, the per-session cost limits and what the estimate leaves out.
 */
import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { Button } from '@/components/ui/button';
import { USAGE_AI_COPY as T } from '@/copy/en/configForms';
import { USAGE_COPY } from '@/copy/en/system';
import { fetchVoiceUsage } from '../api/adminVoiceApi.js';
import { useResource } from '../users/useResource.js';
import { DailyCard, RatesCard, TodayCard } from './AiUsageSections.jsx';
import { CostLimitsCard } from './CostLimitsCard.jsx';
import { useVoiceSettingsResource } from './useVoiceSettingsResource.js';

const DEFAULT_DAYS = 30;

/** Pemakaian & Biaya page. */
export function AiUsagePage() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const usage = useResource(useCallback(() => fetchVoiceUsage(days), [days]), `usage-${days}`);
  const settings = useVoiceSettingsResource();
  const error = usage.error ?? settings.error;
  const ready = usage.data && settings.data;
  const reloadAll = () => { usage.reload(); settings.reload(); };

  let body;
  if (error && !ready) body = <ErrorState title={T.loadError} error={error} onRetry={reloadAll} />;
  else if (!ready) body = <LoadingState variant="cards" label={T.loading} />;
  else {
    body = (
      <div className="flex flex-col gap-4">
        <TodayCard usage={usage.data} />
        <DailyCard usage={usage.data} days={days} onDays={setDays} loading={usage.loading} />
        <CostLimitsCard usage={usage.data} settings={settings.data.settings} onSaved={reloadAll} />
        <RatesCard rates={usage.data.rates} />
      </div>
    );
  }
  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title={T.title}
        description={T.description}
        actions={(
          <Button variant="outline" size="sm" aria-disabled={usage.loading || undefined} onClick={() => { if (!usage.loading) reloadAll(); }}>
            <RefreshCw aria-hidden="true" data-icon="inline-start" className={usage.loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
            {USAGE_COPY.refresh}
          </Button>
        )}
      />
      {body}
    </div>
  );
}
