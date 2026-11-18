/** "Ubah akun": only the fields the actor may edit (name, email, the three capability switches together). */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { FormField } from '@/components/app/FormField.jsx';
import { USERS_COPY } from '../../copy/id/users.js';
import { UserDialog } from './UserDialog.jsx';
import { CapabilitySwitches } from './UserFormFields.jsx';
import { usersApi } from './usersApi.js';
import { useAsyncAction } from './useAsyncAction.js';
import { errorField } from './usersView.js';
import { editPayload } from './userFormView.js';

const COPY = USERS_COPY;
const FORM_FIELDS = ['email', 'name'];

/**
 * @param {{open: boolean, target: {id: string, name: string, email: string, capabilities: object},
 *   edit: {name: boolean, email: boolean, capabilities: boolean}, onSaved: (result: object) => void, onClose: () => void}} props
 */
export function EditUserDialog({ open, target, edit, onSaved, onClose }) {
  const [form, setForm] = useState({ name: target.name, email: target.email, capabilities: { ...target.capabilities } });
  const { busy, error, failure, run } = useAsyncAction();
  const body = editPayload(target, form, edit);
  const fieldError = errorField(failure, FORM_FIELDS);
  const inline = (field) => (fieldError === field ? error : null);

  const submit = async (event) => {
    event.preventDefault();
    if (!body) return;
    const result = await run(() => usersApi.update(target.id, body));
    if (!result) return;
    onSaved(result);
    onClose();
  };

  return (
    <UserDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <DialogHeader className="pr-8">
          <DialogTitle>{COPY.edit.title}</DialogTitle>
          <DialogDescription>{COPY.edit.description(target.name)}</DialogDescription>
        </DialogHeader>
        {edit.name ? (
          <FormField label={COPY.form.name} error={inline('name')} required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} autoComplete="off" />
          </FormField>
        ) : null}
        {edit.email ? (
          <FormField label={COPY.form.email} description={COPY.edit.emailNote} error={inline('email')} required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" spellCheck={false} />
          </FormField>
        ) : null}
        {edit.capabilities ? <CapabilitySwitches value={form.capabilities} onChange={(capabilities) => setForm({ ...form, capabilities })} /> : null}
        {error && !fieldError ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{COPY.form.cancel}</Button>
          <Button type="submit" disabled={busy || !body}>
            {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {COPY.edit.submit}
          </Button>
        </DialogFooter>
      </form>
    </UserDialog>
  );
}
