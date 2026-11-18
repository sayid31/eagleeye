// src/admin/config/SaveBar.jsx
/**
 * Sticky save bar of a settings form: a polite live status ("Perubahan belum disimpan" / "Tersimpan • 14.02"), the
 * Batalkan / Simpan buttons and, when a save failed, the problems as an alert directly above them (so they are seen
 * where the person just clicked, however long the form is).
 */
import { CircleAlert, CircleCheck, CircleDot } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SAVE_COPY } from '@/copy/id/config';

function statusLine({ dirty, saving, savedAt }) {
  if (saving) return { Icon: null, text: SAVE_COPY.saving, className: 'text-muted-foreground' };
  if (dirty) return { Icon: CircleDot, text: SAVE_COPY.dirty, className: 'text-warning' };
  return { Icon: CircleCheck, text: savedAt ? SAVE_COPY.savedAt(savedAt) : SAVE_COPY.clean, className: 'text-muted-foreground' };
}

/**
 * @param {{dirty: boolean, saving: boolean, savedAt: string | null, messages?: string[], onDiscard: () => void}} props
 *   Rendered inside the form: the save button is the form's submit button.
 */
export function SaveBar({ dirty, saving, savedAt, messages = [], onDiscard }) {
  const { Icon, text, className } = statusLine({ dirty, saving, savedAt });
  return (
    <div className="sticky bottom-4 z-10 mt-6 flex flex-col gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-sm" role="group" aria-label={SAVE_COPY.barLabel}>
      {messages.length ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            {messages.length === 1 ? messages[0] : <ul className="list-disc pl-4">{messages.map((message) => <li key={message}>{message}</li>)}</ul>}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-medium ${className}`}>
          {saving ? <Spinner aria-hidden="true" /> : <Icon aria-hidden="true" className="size-4" />}
          {text}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={!dirty || saving} onClick={onDiscard}>{SAVE_COPY.discard}</Button>
          <Button type="submit" disabled={!dirty || saving}>{SAVE_COPY.save}</Button>
        </div>
      </div>
    </div>
  );
}
