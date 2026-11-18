// src/components/app/EmptyState.jsx
/** Nothing to show yet: icon, title, one line of explanation and an optional call to action. */
import { Inbox } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { STATE_COPY } from '@/copy/en/common';

/**
 * @param {{icon?: import('react').ElementType, title?: string, description?: string, action?: import('react').ReactNode, className?: string}} props
 */
export function EmptyState({ icon: Icon = Inbox, title = STATE_COPY.emptyTitle, description = STATE_COPY.emptyDescription, action = null, className }) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
