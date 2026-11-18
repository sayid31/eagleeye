// src/admin/dev/killswitch/GateCard.jsx
/** One paid gate: name, what it stops, a Switch (menyala / dimatikan) and who changed it last, when and why. */
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { HealthBadge } from '../lib/HealthBadge.jsx';

/**
 * @param {{row: ReturnType<typeof import('./killSwitchView.js').gateRow>, onToggle: (gate: string, killed: boolean) => void}} props
 *   Turning the switch only asks for a change; the state flips after the confirmed save reloads the list.
 */
export function GateCard({ row, onToggle }) {
  return (
    <Card data-gate={row.gate} data-killed={row.killed || undefined} className={row.killed ? 'w-full ring-destructive/40' : 'w-full'}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{row.label}</CardTitle>
        <CardDescription>{row.stops}</CardDescription>
        <CardAction>
          <Switch checked={!row.killed} aria-label={row.switchLabel} onCheckedChange={(on) => onToggle(row.gate, !on)} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div><HealthBadge status={row.status} label={row.statusLabel} /></div>
        <p className="text-sm text-muted-foreground" title={row.absolute ?? undefined}>{row.lastChange}</p>
        {row.reason ? <p className="text-sm break-words">{row.reason}</p> : null}
      </CardContent>
    </Card>
  );
}
