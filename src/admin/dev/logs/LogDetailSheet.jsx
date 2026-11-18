// src/admin/dev/logs/LogDetailSheet.jsx
/** Full text of one log entry (the table clips long messages): code, message, counts, times, context. */
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SERVER_LOG_COPY as T } from '@/copy/en/systemLogs';
import { useReturnFocus } from '@/lib/useReturnFocus';
import { LogLevelBadge } from './LogLevelBadge.jsx';
import { describeContext, detailFacts, levelBadge } from './serverLogView.js';

/**
 * @param {{entry: object | null, now: number, onOpenChange: (open: boolean) => void}} props The sheet is open while `entry` is set.
 */
export function LogDetailSheet({ entry, now, onOpenChange }) {
  const open = Boolean(entry);
  const returnFocus = useReturnFocus(open);
  const facts = entry ? detailFacts(entry, now) : [];
  const context = entry ? describeContext(entry) : '';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg" onCloseAutoFocus={returnFocus}>
        <SheetHeader>
          <SheetTitle>{T.sheet.title}</SheetTitle>
          <SheetDescription>{T.sheet.description}</SheetDescription>
        </SheetHeader>
        {entry ? (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <LogLevelBadge badge={levelBadge(entry.level)} />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{entry.code}</code>
            </div>
            <section aria-labelledby="log-message-heading" className="flex flex-col gap-1.5">
              <h3 id="log-message-heading" className="text-sm font-medium">{T.sheet.message}</h3>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs break-words whitespace-pre-wrap">{entry.message || T.sheet.noMessage}</pre>
            </section>
            <dl className="grid gap-2 text-sm">
              {facts.map((fact) => (
                <div key={fact.id} className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="font-medium tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {context ? (
              <section aria-labelledby="log-context-heading" className="flex flex-col gap-1.5">
                <h3 id="log-context-heading" className="text-sm font-medium">{T.sheet.context}</h3>
                <p className="font-mono text-xs break-words">{context}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
