/**
 * "Buat pengguna": email, name, role (super_admin in /dev only), the three capability switches and the password
 * choice. On success the same dialog turns into the one-time password panel.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { FormField } from '@/components/app/FormField.jsx';
import { ROLE_ADMIN, ROLE_USER } from '../../auth/authRoles.mjs';
import { USERS_COPY } from '../../copy/en/users.js';
import { DiscardPasswordDialog, OneTimePasswordPanel, useOneTimeGuard } from './OneTimePasswordPanel.jsx';
import { UserDialog } from './UserDialog.jsx';
import { CapabilitySwitches, PasswordChoice } from './UserFormFields.jsx';
import { usersApi } from './usersApi.js';
import { useAsyncAction } from './useAsyncAction.js';
import { errorField } from './usersView.js';
import { createFormDefaults, createFormReady, createPayload } from './userFormView.js';

const COPY = USERS_COPY;
const FORM_FIELDS = ['email', 'name', 'password'];

/** Email gets the initial focus (the first control of the form). */
function CreateForm({ chooseRole, onCreated, onCancel }) {
  const [form, setForm] = useState(createFormDefaults);
  const { busy, error, failure, run } = useAsyncAction();
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const role = chooseRole ? form.role : ROLE_USER;
  const fieldError = errorField(failure, FORM_FIELDS);
  const inline = (field) => (fieldError === field ? error : null);

  const submit = async (event) => {
    event.preventDefault();
    const body = createPayload(form, chooseRole);
    const result = await run(() => usersApi.create(body));
    if (result) onCreated({ result, email: result.user.email, password: result.tempPassword ?? body.password });
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader className="pr-8">
        <DialogTitle>{COPY.create.title}</DialogTitle>
        <DialogDescription>{COPY.create.description}</DialogDescription>
      </DialogHeader>
      <FormField label={COPY.form.email} error={inline('email')} required>
        <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder={COPY.form.emailPlaceholder} autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label={COPY.form.name} error={inline('name')} required>
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" />
      </FormField>
      {chooseRole ? (
        <FormField label={COPY.form.role} description={role === ROLE_ADMIN ? COPY.form.roleHint : undefined}>
          {(control) => (
            <Select value={form.role} onValueChange={(value) => set({ role: value })}>
              <SelectTrigger {...control} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_USER}>{COPY.roles.user}</SelectItem>
                <SelectItem value={ROLE_ADMIN}>{COPY.roles.admin}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}
      {role === ROLE_USER
        ? <CapabilitySwitches value={form.capabilities} onChange={(capabilities) => set({ capabilities })} />
        : <p className="text-sm text-muted-foreground">{COPY.capabilitiesAdminNote}</p>}
      <PasswordChoice mode={form.passwordMode} password={form.password} role={role} email={form.email} name={form.name} error={inline('password')}
        onMode={(passwordMode) => set({ passwordMode })} onPassword={(password) => set({ password })} />
      {error && !fieldError ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{COPY.form.cancel}</Button>
        <Button type="submit" disabled={busy || !createFormReady(form, chooseRole)}>
          {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {COPY.create.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * @param {{open: boolean, chooseRole: boolean, onCreated: (result: object) => void, onClose: () => void}} props
 *   Mounted fresh for every opening (the page keys it), so a closed dialog never keeps a password.
 */
export function CreateUserDialog({ open, chooseRole, onCreated, onClose }) {
  const [created, setCreated] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const guard = useOneTimeGuard({ locked: Boolean(created) && !acknowledged, onClose });
  return (
    <>
      <UserDialog open={open} onOpenChange={guard.onOpenChange}>
        {created ? (
          <OneTimePasswordPanel heading={COPY.oneTime.createdHeading} email={created.email} password={created.password}
            acknowledged={acknowledged} onAcknowledged={setAcknowledged} onDone={onClose} />
        ) : (
          <CreateForm chooseRole={chooseRole} onCancel={onClose} onCreated={(value) => { setCreated(value); onCreated(value.result); }} />
        )}
      </UserDialog>
      <DiscardPasswordDialog open={guard.warning} onOpenChange={guard.setWarning} onDiscard={onClose} />
    </>
  );
}
