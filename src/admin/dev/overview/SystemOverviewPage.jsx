// src/admin/dev/overview/SystemOverviewPage.jsx
/**
 * /dev → Ringkasan sistem: version, uptime, login configuration, Kill switch state, recent log errors, API key
 * presence per provider (never a value) and the doctor's login warnings. Read-only; one reload button.
 */
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { OVERVIEW_COPY as T } from '@/copy/id/system';
import { fetchSystemSummary } from '../devApi.js';
import { RefreshBar } from '../lib/RefreshBar.jsx';
import { ResourceBody } from '../lib/ResourceBody.jsx';
import { useDevResource } from '../lib/useDevResource.js';
import { DoctorCard } from './DoctorCard.jsx';
import { KeyPresenceCard } from './KeyPresenceCard.jsx';
import { OverviewCards } from './OverviewCards.jsx';

/** Ringkasan sistem page. */
export function SystemOverviewPage() {
  const resource = useDevResource(fetchSystemSummary);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={T.title}
        description={T.description}
        actions={<RefreshBar label={T.refresh} updatedAt={resource.data?.generatedAt} loading={resource.loading} onRefresh={resource.reload} />}
      />
      <ResourceBody resource={resource} loadingLabel={T.loadingLabel} errorTitle={T.errorTitle}>
        {(summary) => (
          <>
            <OverviewCards summary={summary} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <KeyPresenceCard keys={summary.keys} />
              <DoctorCard checks={summary.doctor} />
            </div>
          </>
        )}
      </ResourceBody>
    </div>
  );
}
