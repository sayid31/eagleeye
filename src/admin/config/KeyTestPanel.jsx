// src/admin/config/KeyTestPanel.jsx
/** "Uji koneksi": runs the provider's connection test and shows the result inline (a polite live region, never a raw status). */
import { useState } from 'react';
import { CircleCheck, CircleX, TriangleAlert, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { KEY_SHEET_COPY as T } from '@/copy/id/config';
import { testKey } from '../api/adminKeysApi.js';
import { failureMessage } from './failureMessage.js';
import { describeTestResult, testNote } from './providerKeysView.js';

const TONES = {
  success: { Icon: CircleCheck, className: 'text-success' },
  destructive: { Icon: CircleX, className: 'text-destructive' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  muted: { Icon: Info, className: 'text-muted-foreground' },
};

/** @param {{row: {id: string, testable: boolean}, onTested: (id: string, outcome: object) => void}} props */
export function KeyTestPanel({ row, onTested }) {
  const [running, setRunning] = useState(false);
  const [view, setView] = useState(null);
  const run = async () => {
    setRunning(true);
    setView(null);
    try {
      const outcome = await testKey(row.id);
      onTested(row.id, outcome);
      setView(describeTestResult(outcome, row.id));
    } catch (failure) {
      setView({ label: T.testFailed, text: failureMessage(failure), tone: 'destructive' });
    } finally {
      setRunning(false);
    }
  };
  const tone = view ? TONES[view.tone] : null;
  return (
    <section aria-labelledby="key-test-title" className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 id="key-test-title" className="text-sm font-medium">{T.testSection}</h3>
      <p className="text-sm text-muted-foreground">{testNote(row.id)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={!row.testable || running} onClick={run}>
          {running ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {running ? T.testing : T.testButton}
        </Button>
        {row.testable ? null : <span className="text-sm text-muted-foreground">{T.testNeedsKey}</span>}
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {view ? (
          <span className={`flex items-start gap-2 ${tone.className}`}>
            <tone.Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span><span className="font-medium">{view.label}.</span> <span className="text-foreground">{view.text}</span></span>
          </span>
        ) : null}
      </p>
    </section>
  );
}
