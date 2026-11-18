// src/admin/dev/killswitch/KillSwitchPage.jsx
/**
 * /dev → Kill switch: one card per paid gate (Layer data, Voice & AI, Peta premium & pencarian). Switching one off
 * is refused for every account, super_admin included, until it is switched back on. A change opens ConfirmDialog
 * (impact, reason, password); the server re-checks identity and writes the `killswitch.update` audit row.
 */
import { useCallback, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { KILL_SWITCH_COPY as T } from '@/copy/en/system';
import { fetchKillSwitches, updateKillSwitch } from '../devApi.js';
import { RefreshBar } from '../lib/RefreshBar.jsx';
import { ResourceBody } from '../lib/ResourceBody.jsx';
import { useDevResource } from '../lib/useDevResource.js';
import { GateCard } from './GateCard.jsx';
import { dialogConfig, gateRows, savedToast, updateBody } from './killSwitchView.js';

/** Kill switch page. */
export function KillSwitchPage() {
  const resource = useDevResource(fetchKillSwitches);
  const [change, setChange] = useState(null);
  // The dialog keeps its wording while it animates closed.
  const lastChange = useRef(null);
  if (change) lastChange.current = change;
  const config = lastChange.current ? dialogConfig(lastChange.current) : null;

  const confirm = useCallback(async (values) => {
    const result = await updateKillSwitch(updateBody(lastChange.current, values));
    const outcome = savedToast(result);
    toast[outcome.kind](outcome.text);
    await resource.reload();
  }, [resource]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={T.title}
        description={T.description}
        actions={<RefreshBar label={T.refresh} loading={resource.loading} onRefresh={resource.reload} />}
      />
      <Alert>
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>{T.notice.title}</AlertTitle>
        <AlertDescription>{T.notice.body}</AlertDescription>
      </Alert>
      <ResourceBody resource={resource} loadingLabel={T.loadingLabel} errorTitle={T.errorTitle}>
        {(data) => (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label={T.title}>
            {gateRows(data.switches, Date.now()).map((row) => (
              <li key={row.gate} className="flex">
                <GateCard row={row} onToggle={(gate, killed) => setChange({ gate, killed })} />
              </li>
            ))}
          </ul>
        )}
      </ResourceBody>
      {config ? (
        <ConfirmDialog
          open={Boolean(change)}
          onOpenChange={(open) => { if (!open) setChange(null); }}
          title={config.title}
          impact={config.impact}
          actionLabel={config.actionLabel}
          destructive={config.destructive}
          reason={config.reason}
          password={config.password}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}
