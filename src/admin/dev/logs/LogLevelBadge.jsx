// src/admin/dev/logs/LogLevelBadge.jsx
/** Level pill of a log row: tone + icon + word (Error / Peringatan / Info). */
import { CircleX, Info, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TONE_CLASSES } from '@/components/app/statusBadgeView.js';
import { cn } from '@/lib/utils';

const ICONS = { x: CircleX, warning: TriangleAlert, info: Info };

/** @param {{badge: ReturnType<typeof import('./serverLogView.js').levelBadge>}} props */
export function LogLevelBadge({ badge }) {
  const Icon = ICONS[badge.icon];
  return (
    <Badge variant="outline" className={cn('border-transparent', TONE_CLASSES[badge.tone])} data-level={badge.level}>
      <Icon aria-hidden="true" data-icon="inline-start" />
      {badge.label}
    </Badge>
  );
}
