// src/login/ChangePasswordPage.jsx
/**
 * Minimal `/account` + `/account/password` (phase 1): change the password —
 * required after an admin set or reset it. Phase 2 (W-B) replaces this with
 * the full account page (name, sign out other devices, toast).
 */
import { useState } from 'react';
import { changePassword, fetchMe, signOutAndLeave } from '../auth/authClientApi.js';
import { CHANGE_PASSWORD_ERRORS, changePasswordProblem } from './changePasswordView.js';

export function ChangePasswordPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { currentPassword: String(form.get('current') ?? ''), newPassword: String(form.get('next') ?? ''), confirm: String(form.get('confirm') ?? '') };
    const problem = changePasswordProblem(input);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await changePassword(input);
      if (!result.ok) { setError(CHANGE_PASSWORD_ERRORS[result.code] ?? 'Password tidak bisa diganti. Coba lagi.'); setBusy(false); return; }
      window.location.replace((await fetchMe()).home);
    } catch (failure) {
      setError(`Password tidak bisa diganti: ${failure.message}`);
      setBusy(false);
    }
  };

  return (
    <main className="adm-login">
      <section className="adm-login-card">
        <h1>Ganti password</h1>
        <p className="adm-login-lead">Pilih password baru sebelum melanjutkan. Perangkat lain akan dikeluarkan.</p>
        <form className="login-form" onSubmit={submit}>
          <label>Password saat ini<input name="current" type="password" autoComplete="current-password" required disabled={busy} /></label>
          <label>Password baru<input name="next" type="password" autoComplete="new-password" required disabled={busy} /></label>
          <label>Ulangi password baru<input name="confirm" type="password" autoComplete="new-password" required disabled={busy} /></label>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan password'}</button>
        </form>
        {error ? <p className="adm-error" role="alert">{error}</p> : null}
        <button type="button" className="adm-btn" onClick={() => { void signOutAndLeave(); }}>Keluar</button>
      </section>
    </main>
  );
}
