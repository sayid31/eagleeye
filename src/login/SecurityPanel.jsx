// src/login/SecurityPanel.jsx
/** Keamanan tab: change password (or the Google note) and "Keluar dari perangkat lain" behind a confirmation. */
import { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACCOUNT_COPY, PASSWORD_COPY } from '../copy/id/login.js';
import { revokeOtherSessions } from './accountApi.js';
import { PasswordChangeForm } from './PasswordChangeForm.jsx';

const CARD = '[--card-spacing:--spacing(6)]';

/** @param {{children: import('react').ReactNode, title: string, description: string}} props */
function Section({ title, description, children }) {
  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

/** @param {{user: {email?: string, name?: string, role?: string}, showPassword: boolean}} props `showPassword` is false for a Google-only account. */
export function SecurityPanel({ user, showPassword }) {
  const [confirming, setConfirming] = useState(false);

  const revoke = async () => {
    const result = await revokeOtherSessions();
    // A network failure rejects (the dialog words it); a refusal is turned into the same kind of error here.
    if (!result.ok) throw Object.assign(new Error(`revoke-other-sessions refused: ${result.code}`), { code: result.code, status: result.status });
    toast.success(ACCOUNT_COPY.revoked);
  };

  return (
    <div className="grid gap-6">
      {showPassword ? (
        <Section title={ACCOUNT_COPY.passwordTitle} description={PASSWORD_COPY.otherDevices}>
          <PasswordChangeForm identity={user} onChanged={() => toast.success(PASSWORD_COPY.success)} />
        </Section>
      ) : (
        <Card className={CARD}>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base">
              <ShieldCheck aria-hidden="true" className="size-4 text-success" />{ACCOUNT_COPY.googleManagedTitle}
            </CardTitle>
            <CardDescription>{ACCOUNT_COPY.googleManaged}</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Section title={ACCOUNT_COPY.sessionsTitle} description={ACCOUNT_COPY.sessionsLead}>
        <Button variant="outline" size="lg" className="h-10 w-full sm:w-fit" onClick={() => setConfirming(true)}>
          <LogOut aria-hidden="true" />{ACCOUNT_COPY.revokeOthers}
        </Button>
      </Section>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={ACCOUNT_COPY.revokeTitle} impact={ACCOUNT_COPY.revokeImpact}
        actionLabel={ACCOUNT_COPY.revokeOthers} onConfirm={revoke} />
    </div>
  );
}
