/**
 * Confirmations of the risky account actions — Nonaktifkan, Aktifkan, Keluarkan dari semua perangkat, Hapus (type the
 * email) and Ubah role (the actor's password, or a recent Google sign-in) — each naming its concrete impact. A failed
 * call keeps the dialog open with the sentence for its code (ConfirmDialog does that).
 */
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { USERS_COPY } from '../../copy/en/users.js';
import { usersApi } from './usersApi.js';

const { confirm: COPY } = USERS_COPY;

/** kind → the API call. */
const CALLS = Object.freeze({
  deactivate: { call: (target) => usersApi.deactivate(target.id) },
  activate: { call: (target) => usersApi.activate(target.id) },
  revokeSessions: { call: (target) => usersApi.revokeSessions(target.id) },
  delete: { call: (target, { typed }) => usersApi.remove(target.id, typed) },
  promote: { call: (target, { password }) => usersApi.setRole(target.id, roleBody('admin', password)) },
  demote: { call: (target, { password }) => usersApi.setRole(target.id, roleBody('user', password)) },
});

/** An empty password is omitted: the server then accepts a Google sign-in from the last 10 minutes. */
const roleBody = (role, currentPassword) => (currentPassword ? { role, currentPassword } : { role });

/** Per-kind dialog props: title, impact sentence, action label and guards. */
function specFor(kind, target, self) {
  const text = COPY[kind];
  const name = target.name || target.email;
  const spec = { title: text.title, impact: text.impact(name), actionLabel: text.action, destructive: kind === 'deactivate' || kind === 'delete' || kind === 'revokeSessions' || kind === 'demote' };
  if (kind === 'revokeSessions' && self) spec.impact = `${spec.impact} ${text.selfNote}`;
  if (kind === 'delete') spec.typeToConfirm = { value: target.email, label: text.typeLabel(target.email) };
  if (kind === 'promote' || kind === 'demote') spec.password = { label: COPY.rolePasswordLabel, description: COPY.rolePasswordHint, required: false };
  return spec;
}

/**
 * @param {{open: boolean, kind: keyof typeof CALLS, target: {id: string, name: string, email: string}, self: boolean,
 *   onDone: (kind: string, result: object) => void, onClose: () => void}} props
 */
export function UserConfirmDialog({ open, kind, target, self, onDone, onClose }) {
  const { call } = CALLS[kind];
  const spec = specFor(kind, target, self);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      {...spec}
      onConfirm={async ({ password }) => {
        // `typed` is only meaningful for delete, where it already equals the email (ConfirmDialog gates on it).
        const result = await call(target, { password, typed: target.email });
        onDone(kind, result);
      }}
    />
  );
}
