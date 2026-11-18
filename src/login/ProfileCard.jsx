// src/login/ProfileCard.jsx
/** Profil tab: who the account is (read-only email and role) and the one editable field, the display name. */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/app/FormField.jsx';
import { initialsFor } from '@/components/app/navModel.js';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ACCOUNT_COPY } from '../copy/en/login.js';
import { MAX_NAME_LENGTH_CLIENT, updateDisplayName } from './accountApi.js';
import { nameProblem, roleLabel } from './accountView.js';

/** @param {{user: {name?: string, email: string, role: string}}} props */
export function ProfileCard({ user }) {
  const [saved, setSaved] = useState(user.name ?? '');
  const [name, setName] = useState(saved);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const unchanged = name.trim() === saved.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (busy || unchanged) return;
    const problem = nameProblem(name);
    if (problem) { setError(problem); nameRef.current?.focus(); return; }
    setBusy(true);
    setError(null);
    let result;
    try {
      result = await updateDisplayName(name);
    } catch (failure) {
      console.warn(`[account] update-user request failed: ${failure.message}`);
      result = { ok: false };
    }
    setBusy(false);
    if (result.ok) {
      setSaved(name.trim());
      setName(name.trim());
      toast.success(ACCOUNT_COPY.nameSaved);
    } else {
      setError(ACCOUNT_COPY.nameFailed);
      nameRef.current?.focus();
    }
  };

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">{ACCOUNT_COPY.profileTitle}</CardTitle>
        <CardDescription>{ACCOUNT_COPY.profileDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex items-center gap-4">
          <Avatar size="lg" className="size-12"><AvatarFallback className="text-base">{initialsFor({ name: saved, email: user.email })}</AvatarFallback></Avatar>
          <div className="grid min-w-0 gap-1">
            <p className="truncate font-medium" title={saved || user.email}>{saved || user.email}</p>
            <p className="truncate text-sm text-muted-foreground" title={user.email}>{user.email}</p>
            <Badge variant="secondary" className="w-fit">{roleLabel(user.role)}</Badge>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="grid gap-5" aria-busy={busy}>
          <FormField label={ACCOUNT_COPY.name} error={error}>
            {(control) => (
              <Input {...control} ref={nameRef} name="name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }}
                maxLength={MAX_NAME_LENGTH_CLIENT} autoComplete="name" readOnly={busy} required className="h-10" />
            )}
          </FormField>
          <FormField label={ACCOUNT_COPY.email} description={ACCOUNT_COPY.emailNote}>
            <Input name="email" type="email" value={user.email} readOnly className="h-10 bg-muted/50 text-muted-foreground" />
          </FormField>
          <Button type="submit" size="lg" className="h-10 w-full sm:w-fit sm:justify-self-start" disabled={busy || unchanged} aria-busy={busy}>
            {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {ACCOUNT_COPY.saveName}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
