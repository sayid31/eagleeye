/**
 * The one-time view of a temporary password (after create and after reset), shown inside the same dialog that made
 * it. "Selesai" stays disabled until the box "Saya sudah menyalin password ini" is ticked, and closing any other way
 * (Esc, outside click, ×) before that asks "Password hanya tampil sekali". The password lives only in props.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { CopyField } from '@/components/app/CopyField.jsx';
import { USERS_COPY } from '../../copy/id/users.js';
import { handoverMessage } from './usersView.js';

const COPY = USERS_COPY.oneTime;

/**
 * Close gate of a dialog that may be showing a one-time password: while `locked`, a close request opens the warning
 * instead of closing.
 * @param {{locked: boolean, onClose: () => void}} options
 */
export function useOneTimeGuard({ locked, onClose }) {
  const [warning, setWarning] = useState(false);
  return {
    warning,
    setWarning,
    onOpenChange: (next) => {
      if (next) return;
      if (locked) setWarning(true);
      else onClose();
    },
  };
}

/** "Password hanya tampil sekali": closing without copying is the destructive choice, going back is the default. */
export function DiscardPasswordDialog({ open, onOpenChange, onDiscard }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={COPY.discard.title}
      impact={COPY.discard.impact}
      actionLabel={COPY.discard.action}
      cancelLabel={COPY.discard.cancel}
      onConfirm={onDiscard}
    />
  );
}

/**
 * @param {{heading: string, email: string, password: string, reset?: boolean, acknowledged: boolean,
 *   onAcknowledged: (value: boolean) => void, onDone: () => void}} props
 */
export function OneTimePasswordPanel({ heading, email, password, reset = false, acknowledged, onAcknowledged, onDone }) {
  const titleRef = useRef(null);
  const ackId = useId();
  const message = useMemo(() => handoverMessage({ origin: window.location.origin, email, password, reset }), [email, password, reset]);

  // The form that made the password just unmounted, taking focus with it: land on the heading, never on <body>.
  useEffect(() => { titleRef.current?.focus(); }, []);

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg leading-snug outline-none">{heading}</DialogTitle>
        <DialogDescription>{COPY.lead}</DialogDescription>
      </DialogHeader>
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">{COPY.account}</dt>
        <dd className="min-w-0 truncate font-medium" title={email}>{email}</dd>
      </dl>
      <div className="grid gap-2">
        <CopyField label={COPY.passwordLabel} value={password} extraCopy={{ label: COPY.copyMessage, text: message }} />
        <p className="text-sm text-muted-foreground">{COPY.messageHint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={ackId} checked={acknowledged} onCheckedChange={(value) => onAcknowledged(value === true)} />
        <Label htmlFor={ackId}>{COPY.acknowledge}</Label>
      </div>
      <DialogFooter>
        <Button type="button" disabled={!acknowledged} onClick={onDone}>{COPY.done}</Button>
      </DialogFooter>
    </>
  );
}
