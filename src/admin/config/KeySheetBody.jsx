// src/admin/config/KeySheetBody.jsx
/**
 * Content of the "Ubah kunci" sheet. Its state (typed values, errors, busy flag) lives here, so closing the sheet
 * discards what was typed. Secret fields are PasswordInputs; the saved value is never shown, only sent once.
 */
import { useState } from 'react';
import { ExternalLink, Info, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { FormField } from '@/components/app/FormField.jsx';
import { PasswordInput } from '@/components/app/PasswordInput.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { KEY_SHEET_COPY as T } from '@/copy/id/config';
import { saveKeys } from '../api/adminKeysApi.js';
import { failureMessage } from './failureMessage.js';
import { KeyTestPanel } from './KeyTestPanel.jsx';
import { buildKeyRemoval, buildKeyUpdate, fieldLabel } from './providerKeysView.js';

/** @param {{row: object, onClose: () => void, onSaved: (reply: object) => void, onTested: (id: string, outcome: object) => void}} props */
export function KeySheetBody({ row, onClose, onSaved, onTested }) {
  const { key } = row;
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    const built = buildKeyUpdate(key, values);
    setErrors(built.ok ? {} : built.errors);
    setFailure('');
    if (!built.ok) return;
    setSaving(true);
    try {
      onSaved(await saveKeys(built.updates));
      toast.success(T.saved(row.name));
      onClose();
    } catch (problem) {
      setFailure(failureMessage(problem));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    onSaved(await saveKeys(buildKeyRemoval(key)));
    toast.success(T.removed(row.name));
    onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{T.title(row.name, key.set)}</SheetTitle>
        <SheetDescription>{row.purpose}</SheetDescription>
        <a className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-4" href={key.getUrl} target="_blank" rel="noreferrer noopener">
          {T.getKey}<ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
        {!row.editable ? (
          <Alert><Info aria-hidden="true" /><AlertTitle>{T.externalTitle}</AlertTitle><AlertDescription>{T.externalBody}</AlertDescription></Alert>
        ) : (
          <form id="key-form" noValidate onSubmit={save} className="flex flex-col gap-4">
            {key.clientExposed ? <Alert><Info aria-hidden="true" /><AlertTitle>{T.browserTitle}</AlertTitle><AlertDescription>{T.browserBody}</AlertDescription></Alert> : null}
            {key.envVars.map((name) => (
              <FormField key={name} label={fieldLabel(key, name)} description={key.set ? T.keepHint : T.neverShown} error={errors[name]}>
                <PasswordInput
                  autoComplete="off"
                  value={values[name] ?? ''}
                  placeholder={key.set ? T.placeholderSet : T.placeholderUnset}
                  onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                />
              </FormField>
            ))}
            {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
          </form>
        )}
        <KeyTestPanel row={row} onTested={onTested} />
      </div>
      <SheetFooter className="sm:flex-row sm:justify-between">
        {row.editable && key.set ? (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmRemove(true)}>
            <Trash2 aria-hidden="true" data-icon="inline-start" />{T.remove}
          </Button>
        ) : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>{T.close}</Button>
          {row.editable ? (
            <Button type="submit" form="key-form" disabled={saving}>
              {saving ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {saving ? T.saving : (key.set ? T.replace : T.save)}
            </Button>
          ) : null}
        </div>
      </SheetFooter>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={T.removeConfirm.title(row.name)}
        impact={T.removeConfirm.impact(row.name, row.purpose)}
        actionLabel={T.removeConfirm.action(row.name)}
        destructive
        onConfirm={remove}
      />
    </>
  );
}
