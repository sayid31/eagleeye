// src/components/app/StatusBadge.jsx
/** Status pills that always pair colour with an icon and a word, plus capability chips (name + sr-only on/off). */
import { CircleCheck, CircleMinus, CircleX, Clock, Info, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_CLASSES, capabilityPresentation, statusPresentation } from './statusBadgeView.js';

const ICONS = { check: CircleCheck, minus: CircleMinus, x: CircleX, clock: Clock, key: KeyRound, info: Info };

function Pill({ view, children, className }) {
  const Icon = ICONS[view.icon] ?? Info;
  return (
    <Badge variant="outline" className={cn('border-transparent', TONE_CLASSES[view.tone], className)}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      {children}
    </Badge>
  );
}

/**
 * @param {{status: string, label?: string, className?: string}} props `status` is a key of STATUSES (active, inactive,
 *   throttled, mustChangePassword, success, failed).
 */
export function StatusBadge({ status, label, className }) {
  const view = statusPresentation(status, label);
  return <Pill view={view} className={className}>{view.label}</Pill>;
}

/**
 * Capability chip such as "Layer data": the name is always shown; on/off is an icon plus text for screen readers.
 * @param {{name: string, enabled: boolean, className?: string}} props
 */
export function CapabilityChip({ name, enabled, className }) {
  const view = capabilityPresentation(name, enabled);
  return (
    <Pill view={view} className={className}>
      {view.label}
      <span className="sr-only">: {view.srText}</span>
    </Pill>
  );
}
