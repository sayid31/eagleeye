// src/admin/dev/logs/HealthPage.jsx
/**
 * /dev → Log server → Kesehatan: one status per thing that can break — API keys (last connection test), the live AIS
 * feed, external services seen in traffic, quotas, voice limits and the log files. Read-only: nothing here calls a
 * provider; re-check a key with "Uji koneksi" on the providers page.
 */
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { RouteTabNav } from '@/components/app/RouteTabs.jsx';
import { HEALTH_COPY as T } from '@/copy/id/systemLogs';
import { StatusBadge } from '@/components/app/StatusBadge';
import { RefreshBar } from '../lib/RefreshBar.jsx';
import { ResourceBody } from '../lib/ResourceBody.jsx';
import { useDevResource } from '../lib/useDevResource.js';
import { fetchHealth } from './logsApi.js';
import { healthView } from './healthView.js';

function SectionCard({ section }) {
  return (
    <Card data-section={section.id} className="mb-4 break-inside-avoid">
      <CardHeader><CardTitle role="heading" aria-level={2}>{section.title}</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y">
          {section.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{item.label}</p>
                <p className="text-sm break-words text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} className="shrink-0 self-start" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Log server → Kesehatan tab. */
export function HealthPage() {
  const resource = useDevResource(fetchHealth);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={T.title} description={T.description} actions={<RefreshBar label={T.refresh} loading={resource.loading} onRefresh={resource.reload} />} tabs={<RouteTabNav />} />
      <ResourceBody resource={resource} loadingLabel={T.loadingLabel} errorTitle={T.errorTitle}>
        {(report) => {
          const view = healthView(report);
          return (
            <>
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>{view.summary}</CardTitle>
                  <CardDescription>{view.checkedAt} · {T.testHint}</CardDescription>
                  <CardAction><StatusBadge status={view.status} /></CardAction>
                </CardHeader>
              </Card>
              <div className="gap-4 lg:columns-2">
                {view.sections.map((section) => <SectionCard key={section.id} section={section} />)}
              </div>
            </>
          );
        }}
      </ResourceBody>
    </div>
  );
}
