/**
 * Create and Edit dialogs of the Pengguna page. Which fields show is decided
 * by the caller from `rowActions` / `managesRoles` (the server re-checks).
 */
import { useState } from 'react';
import { Field, SecretInput, Toggle } from '../components/FormControls.jsx';
import { CAPABILITY_KEYS } from '../../auth/authCapabilities.mjs';
import { TempPasswordPanel } from './TempPasswordPanel.jsx';
import { Dialog, DialogButtons, FormError, useAction } from './UsersWidgets.jsx';
import { USERS_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';
import { createFormDefaults, createPayload, passwordMinFor } from './usersView.js';

const COPY = USERS_COPY;

/** The three feature toggles (Layer data, Voice & AI, Peta premium & search). */
export function CapabilityToggles({ value, onChange, disabled = false }) {
  return (
    <fieldset className="usr-toggles" disabled={disabled}>
      <legend className="adm-field-label">Izin fitur</legend>
      {CAPABILITY_KEYS.map((key) => (
        <Toggle key={key} checked={value[key]} title={COPY.toggles[key].title} description={COPY.toggles[key].description}
          onChange={(checked) => onChange({ ...value, [key]: checked })} />
      ))}
    </fieldset>
  );
}

/** Generate vs type a password, with the length hint for the role. */
export function PasswordChoice({ mode, password, role, onMode, onPassword, idPrefix }) {
  return (
    <>
      <div className="adm-segmented" role="radiogroup" aria-label={COPY.form.passwordMode}>
        {[['generate', COPY.form.generate], ['typed', COPY.form.typed]].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value}
            className={`adm-btn${mode === value ? ' adm-btn-primary' : ''}`} onClick={() => onMode(value)}>{label}</button>
        ))}
      </div>
      {mode === 'typed' ? (
        <Field label={COPY.form.password} hint={COPY.form.passwordHint(passwordMinFor(role))}>
          <SecretInput id={`${idPrefix}-password`} label={COPY.form.password} value={password} onChange={onPassword} />
        </Field>
      ) : <small className="adm-field-hint">{COPY.form.passwordHint(passwordMinFor(role))}</small>}
    </>
  );
}

/** "Buat akun": email, name, role (super_admin in /dev only), toggles, password → one-time panel. */
export function CreateUserDialog({ chooseRole, onCreated, onClose }) {
  const [form, setForm] = useState(createFormDefaults);
  const [created, setCreated] = useState(null);
  const { busy, error, run } = useAction();
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const role = chooseRole ? form.role : 'user';

  const submit = async (event) => {
    event.preventDefault();
    const body = createPayload(form, chooseRole);
    const result = await run(() => usersApi.create(body));
    if (!result) return;
    onCreated(result);
    setCreated({ email: result.user.email, password: result.tempPassword ?? body.password });
  };

  if (created) {
    return (
      <Dialog title={COPY.tempPassword.title} onClose={onClose}>
        <TempPasswordPanel email={created.email} password={created.password} onDone={onClose} />
      </Dialog>
    );
  }
  return (
    <Dialog title={COPY.createTitle} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        <Field label={COPY.form.email}><input className="adm-input" type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label={COPY.form.name}><input className="adm-input" required maxLength={80} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        {chooseRole ? (
          <Field label={COPY.form.role}>
            <select className="adm-input" value={form.role} onChange={(e) => set({ role: e.target.value })}>
              <option value="user">{COPY.roles.user}</option>
              <option value="admin">{COPY.roles.admin}</option>
            </select>
          </Field>
        ) : null}
        {role === 'user'
          ? <CapabilityToggles value={form.capabilities} onChange={(capabilities) => set({ capabilities })} />
          : <p className="adm-field-hint">{COPY.togglesAdminNote}</p>}
        <PasswordChoice idPrefix="create" mode={form.passwordMode} password={form.password} role={role}
          onMode={(passwordMode) => set({ passwordMode })} onPassword={(password) => set({ password })} />
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.form.create} onCancel={onClose} />
      </form>
    </Dialog>
  );
}

/** "Ubah akun": only the fields `edit` allows (`{name, email, capabilities}` flags). */
export function EditUserDialog({ target, edit, onSaved, onClose }) {
  const [form, setForm] = useState({ name: target.name, email: target.email, capabilities: { ...target.capabilities } });
  const { busy, error, run } = useAction();

  const submit = async (event) => {
    event.preventDefault();
    const body = {};
    if (edit.name && form.name !== target.name) body.name = form.name;
    if (edit.email && form.email.trim().toLowerCase() !== target.email) body.email = form.email;
    if (edit.capabilities && CAPABILITY_KEYS.some((key) => form.capabilities[key] !== target.capabilities[key])) body.capabilities = form.capabilities;
    if (!Object.keys(body).length) { onClose(); return; }
    const result = await run(() => usersApi.update(target.id, body));
    if (result) onSaved(result);
  };

  return (
    <Dialog title={COPY.editTitle} onClose={onClose}>
      <form className="usr-form" onSubmit={submit}>
        {edit.name ? <Field label={COPY.form.name}><input className="adm-input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field> : null}
        {edit.email ? (
          <Field label={COPY.form.email} hint={COPY.editEmailNote}>
            <input className="adm-input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        ) : null}
        {edit.capabilities ? <CapabilityToggles value={form.capabilities} onChange={(capabilities) => setForm({ ...form, capabilities })} /> : null}
        <FormError message={error} />
        <DialogButtons busy={busy} submitLabel={COPY.form.save} onCancel={onClose} />
      </form>
    </Dialog>
  );
}
