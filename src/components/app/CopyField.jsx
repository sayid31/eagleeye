// src/components/app/CopyField.jsx
/** A read-only value (temporary password, URL, key) with a Salin button and an aria-live confirmation. */
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COPY_FIELD_COPY } from '@/copy/en/common';
import { useCopyToClipboard } from './useCopyToClipboard.js';

/** One copy button; `text` is what lands on the clipboard (may differ from the displayed value, e.g. a full message). */
function CopyButton({ label, text, variant, onCopied }) {
  const { status, copy } = useCopyToClipboard();
  const copied = status === 'copied';
  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={async () => { if (await copy(text)) onCopied?.(); }}
      >
        {copied ? <Check aria-hidden="true" data-icon="inline-start" /> : <Copy aria-hidden="true" data-icon="inline-start" />}
        {copied ? COPY_FIELD_COPY.copied : label}
      </Button>
      <span role="status" aria-live="polite" className={status === 'failed' ? 'basis-full text-sm text-destructive' : 'sr-only'}>
        {copied ? COPY_FIELD_COPY.copied : null}
        {status === 'failed' ? COPY_FIELD_COPY.copyFailed : null}
      </span>
    </>
  );
}

/**
 * @param {{label: string, value: string, id?: string, mono?: boolean, onCopied?: () => void,
 *   extraCopy?: {label: string, text: string}}} props
 *   `label` names the field for assistive tech. `extraCopy` adds a primary "copy message" action (e.g. "Salin pesan");
 *   the plain "Salin" button then becomes secondary.
 */
export function CopyField({ label, value, id, mono = true, onCopied, extraCopy }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input id={id} readOnly value={value} aria-label={label} className={`min-w-0 flex-1 ${mono ? 'font-mono' : ''}`} onFocus={(event) => event.target.select()} />
      {extraCopy ? <CopyButton label={extraCopy.label} text={extraCopy.text} variant="default" onCopied={onCopied} /> : null}
      <CopyButton label={COPY_FIELD_COPY.copy} text={value} variant={extraCopy ? 'outline' : 'default'} onCopied={onCopied} />
    </div>
  );
}
