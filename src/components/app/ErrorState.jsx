// src/components/app/ErrorState.jsx
/** A load or action failure in a person's words (never a raw code or status) with a retry button. */
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { COMMON_COPY, STATE_COPY } from '@/copy/id/common';
import { errorMessage } from '@/copy/id/errors';

/**
 * @param {{error?: unknown, message?: string, title?: string, onRetry?: () => void, retryLabel?: string, className?: string}} props
 *   `error` is anything `errorMessage()` accepts; `message` overrides it with an already-worded sentence.
 */
export function ErrorState({ error, message, title = STATE_COPY.errorTitle, onRetry, retryLabel = COMMON_COPY.retry, className }) {
  return (
    <Empty role="alert" className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive dark:bg-destructive/20"><CircleAlert aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message ?? errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? <EmptyContent><Button variant="outline" onClick={onRetry}>{retryLabel}</Button></EmptyContent> : null}
    </Empty>
  );
}
