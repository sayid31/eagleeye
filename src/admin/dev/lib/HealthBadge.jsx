// src/admin/dev/lib/HealthBadge.jsx
/** Status pill of the system pages: tinted tone + icon + word (ok / warn / error / off / unknown). */
import { CircleCheck, CircleHelp, CircleMinus, CircleX, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TONE_CLASSES } from '@/components/app/statusBadgeView.js';
import { cn } from '@/lib/utils';
import { healthBadge } from './statusView.js';

const ICONS = { check: CircleCheck, warning: TriangleAlert, x: CircleX, minus: CircleMinus, help: CircleHelp };

/**
 * @param {{status: string, label?: string, className?: string}} props `label` replaces the default word.
 */
export function HealthBadge({ status, label, className }) {
  const view = healthBadge(status, label);
  const Icon = ICONS[view.icon];
  return (
    <Badge variant="outline" className={cn('border-transparent', TONE_CLASSES[view.tone], className)} data-status={view.status}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      {view.label}
    </Badge>
  );
}
