/**
 * Mount point of every Pengguna dialog. The page keeps `dialog = {id, kind, target} | null`; the last non-null value is
 * retained so a closing dialog can finish its exit animation, and each opening carries a new `id` (the dialog is keyed
 * on it) so no form state or password survives into the next opening.
 */
import { useRef } from 'react';
import { CreateUserDialog } from './CreateUserDialog.jsx';
import { EditUserDialog } from './EditUserDialog.jsx';
import { ResetPasswordDialog } from './ResetPasswordDialog.jsx';
import { UserConfirmDialog } from './UserConfirmDialog.jsx';
import { rowActions } from './usersView.js';

/**
 * @param {{dialog: {id: number, kind: string, target: object | null} | null, me: object, area: 'admin' | 'dev', chooseRole: boolean,
 *   onDone: (kind: string, result: object) => void, onClose: () => void}} props
 */
export function UserDialogs({ dialog, me, area, chooseRole, onDone, onClose }) {
  const retained = useRef(null);
  if (dialog) retained.current = dialog;
  const shown = retained.current;
  if (!shown) return null;
  const open = dialog !== null;
  const { id, kind, target } = shown;
  if (kind === 'create') return <CreateUserDialog key={id} open={open} chooseRole={chooseRole} onCreated={(result) => onDone('create', result)} onClose={onClose} />;
  if (kind === 'edit') return <EditUserDialog key={id} open={open} target={target} edit={rowActions(me, target, area).edit} onSaved={(result) => onDone('edit', result)} onClose={onClose} />;
  if (kind === 'resetPassword') return <ResetPasswordDialog key={id} open={open} target={target} onReset={(result) => onDone('resetPassword', result)} onClose={onClose} />;
  return <UserConfirmDialog key={id} open={open} kind={kind} target={target} self={String(target.id) === String(me?.id)} onDone={onDone} onClose={onClose} />;
}
