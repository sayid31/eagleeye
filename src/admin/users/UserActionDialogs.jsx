/**
 * Confirmations of the Pengguna page: Aktif/Nonaktif, "Keluarkan dari semua
 * perangkat", Reset password (→ one-time panel), Hapus (type the email) and
 * the super_admin role change (confirmed with the actor's own password).
 */
import { useState } from 'react';
import { Field, SecretInput } from '../components/FormControls.jsx';
import { PasswordChoice } from './UserFormDialogs.jsx';
import { TempPasswordPanel } from './TempPasswordPanel.jsx';
import { Dialog, DialogButtons, FormError, useAction } from './UsersWidgets.jsx';
import { USERS_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';

const COPY = USERS_COPY;

/** Who the dialog is about, shown under its title. */
function TargetLine({ target }) {
  return <p className="usr-target"><b>{target.name}</b> <span className="adm-muted">{target.email}</span></p>;
}

const SIMPLE = {
  deactivate: { title: COPY.confirm.deactivateTitle, lead: COPY.confirm.deactivateLead, call: (id) => usersApi.deactivate(id), danger: true },
  activate: { title: COPY.confirm.activateTitle, lead: COPY.confirm.activateLead, call: (id) => usersApi.activate(id), danger: false },
  revokeSessions: { title: COPY.confirm.revokeTitle, lead: COPY.confirm.revokeLead, call: (id) => usersApi.revokeSessions(id), danger: true },
};

/** Yes/no confirmation for `kind` ∈ deactivate | activate | revokeSessions. */
export function ConfirmDialog({ kind, target, onDone, onClose }) {
  const spec = SIMPLE[kind];
  const { busy, error, run } = useAction();
  const submit = async (event) => {
    event.preventDefault();
    const result = await run(() => spec.call(target.id));
    if (result) onDone(kind, result);
  };
  return (
    <Dialog title={spec.title} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        <TargetLine target={target} />
        <p>{spec.lead}</p>
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.confirm.submit} danger={spec.danger} onCancel={onClose} />
      </form>
    </Dialog>
  );
}

/** Reset password: generate or type, then the one-time panel. */
export function ResetPasswordDialog({ target, onDone, onClose }) {
  const [mode, setMode] = useState('generate');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(null);
  const { busy, error, run } = useAction();
  const submit = async (event) => {
    event.preventDefault();
    const body = mode === 'generate' ? { generate: true } : { password };
    const result = await run(() => usersApi.resetPassword(target.id, body));
    if (!result) return;
    onDone('resetPassword', result);
    setShown(result.tempPassword ?? password);
  };
  if (shown) {
    return (
      <Dialog title={COPY.tempPassword.title} onClose={onClose}>
        <TempPasswordPanel email={target.email} password={shown} reset onDone={onClose} />
      </Dialog>
    );
  }
  return (
    <Dialog title={COPY.reset.title} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        <TargetLine target={target} />
        <p>{COPY.reset.lead}</p>
        <PasswordChoice idPrefix="reset" mode={mode} password={password} role={target.role} onMode={setMode} onPassword={setPassword} />
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.reset.submit} danger onCancel={onClose} />
      </form>
    </Dialog>
  );
}

/** Hapus: enabled only once the typed email matches. */
export function DeleteUserDialog({ target, onDone, onClose }) {
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAction();
  const matches = typed.trim().toLowerCase() === target.email;
  const submit = async (event) => {
    event.preventDefault();
    const result = await run(() => usersApi.remove(target.id, typed));
    if (result) onDone('delete', result);
  };
  return (
    <Dialog title={COPY.remove.title} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        <TargetLine target={target} />
        <p>{COPY.remove.lead}</p>
        <Field label={COPY.remove.confirmLabel(target.email)}>
          <input className="adm-input" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.remove.submit} danger disabled={!matches} onCancel={onClose} />
      </form>
    </Dialog>
  );
}

/** Promote user → admin or demote admin → user, re-authenticated with the actor's password. */
export function RoleDialog({ direction, target, onDone, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const { busy, error, run } = useAction();
  const promote = direction === 'promote';
  const submit = async (event) => {
    event.preventDefault();
    const body = { role: promote ? 'admin' : 'user', ...(currentPassword ? { currentPassword } : {}) };
    const result = await run(() => usersApi.setRole(target.id, body));
    if (result) onDone('role', result);
  };
  return (
    <Dialog title={promote ? COPY.role.promoteTitle : COPY.role.demoteTitle} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        <TargetLine target={target} />
        <p>{promote ? COPY.role.promoteLead : COPY.role.demoteLead}</p>
        <Field label={COPY.role.passwordLabel} hint={COPY.role.passwordHint}>
          <SecretInput id="role-current-password" label={COPY.role.passwordLabel} value={currentPassword} onChange={setCurrentPassword} />
        </Field>
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.role.submit} danger={!promote} onCancel={onClose} />
      </form>
    </Dialog>
  );
}
