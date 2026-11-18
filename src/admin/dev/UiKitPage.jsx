// src/admin/dev/UiKitPage.jsx
/**
 * /dev/ui-kit — gallery of the shared components in the current theme (hidden from the menu; super_admin only like
 * the rest of /dev). It is where the keyboard/axe probes of `npm run qa:ui` exercise dialogs, menus, tables and
 * toasts in a real browser. Strings here are developer-facing sample text, not product copy.
 */
import { useState } from 'react';
import { Pencil, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { CopyField } from '@/components/app/CopyField.jsx';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { FormField } from '@/components/app/FormField.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { PasswordInput } from '@/components/app/PasswordInput.jsx';
import { RowActions } from '@/components/app/RowActions.jsx';
import { CapabilityChip, StatusBadge } from '@/components/app/StatusBadge.jsx';

const SAMPLE_USERS = Array.from({ length: 45 }, (_, index) => ({
  id: `u${index + 1}`, name: `User ${index + 1}`, email: `user${index + 1}@example.test`, active: index % 4 !== 3,
}));

function Section({ title, children }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">{children}</CardContent></Card>;
}

function TableDemo() {
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState('ready');
  const rows = mode === 'empty' ? [] : SAMPLE_USERS.slice(offset, offset + limit);
  const actions = (user) => [
    { id: 'edit', label: 'Edit', icon: Pencil, onSelect: () => toast.success(`Edit ${user.email}`) },
    { id: 'delete', label: 'Delete', icon: Trash2, destructive: true, onSelect: () => toast.error(`Delete ${user.email}`) },
  ];
  const menu = (user) => <RowActions label={`Actions for ${user.email}`} items={actions(user)} />;
  return (
    <DataTable
      caption="Example user list"
      loading={mode === 'loading'}
      error={mode === 'error' ? { code: 'FEATURE_DISABLED' } : null}
      onRetry={() => setMode('ready')}
      rows={rows}
      getRowId={(row) => row.id}
      toolbar={(
        <div role="group" aria-label="Keadaan tabel" className="flex gap-2">
          {['ready', 'loading', 'error', 'empty'].map((value) => (
            <Button key={value} size="sm" variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</Button>
          ))}
        </div>
      )}
      columns={[
        { id: 'name', header: 'Users', cell: (row) => <span className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4" />{row.name}</span> },
        { id: 'email', header: 'Email', cell: (row) => <span className="font-mono text-xs">{row.email}</span> },
        { id: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.active ? 'active' : 'inactive'} /> },
        { id: 'actions', header: 'Actions', srOnlyHeader: true, className: 'w-12', cell: menu },
      ]}
      renderCard={(row) => (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-medium">{row.name}</p><p className="truncate font-mono text-xs text-muted-foreground">{row.email}</p><div className="mt-2"><StatusBadge status={row.active ? 'active' : 'inactive'} /></div></div>
          {menu(row)}
        </div>
      )}
      pagination={{ total: SAMPLE_USERS.length, limit, offset, onOffsetChange: setOffset, onLimitChange: (next) => { setLimit(next); setOffset(0); } }}
    />
  );
}

function DialogDemo() {
  const [open, setOpen] = useState('');
  const fail = () => { throw Object.assign(new Error('reauth'), { code: 'REAUTH_FAILED' }); };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="destructive" onClick={() => setOpen('delete')}>Delete account…</Button>
      <Button variant="outline" onClick={() => setOpen('pause')}>Deactivate account…</Button>
      <Button variant="outline" onClick={() => setOpen('fail')}>A failing action…</Button>
      <ConfirmDialog open={open === 'delete'} onOpenChange={(next) => setOpen(next ? 'delete' : '')} destructive title="Delete account?" impact="The account budi@example.test is permanently deleted and cannot be undone. Log entries are kept." actionLabel="Delete permanently" typeToConfirm={{ value: 'budi@contoh.test' }} onConfirm={() => toast.success('Account deleted')} />
      <ConfirmDialog open={open === 'pause'} onOpenChange={(next) => setOpen(next ? 'pause' : '')} title="Deactivate account?" impact="The user can no longer sign in and all their sessions end. Can be activated again." actionLabel="Deactivate account" reason={{ minLength: 3 }} password={{}} onConfirm={() => toast.success('Account deactivated')} />
      <ConfirmDialog open={open === 'fail'} onOpenChange={(next) => setOpen(next ? 'fail' : '')} title="A failing action" impact="Shows the error sentence for an API code, not the code." actionLabel="Try" onConfirm={fail} />
    </div>
  );
}

/** Gallery of the shared components. */
export function UiKitPage() {
  const [secret, setSecret] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Component catalog" description="Shared components in the active theme. Used for keyboard and accessibility tests." />
      <Section title="Status"><div className="flex flex-wrap gap-2"><StatusBadge status="active" /><StatusBadge status="inactive" /><StatusBadge status="throttled" /><StatusBadge status="mustChangePassword" /><StatusBadge status="failed" /><CapabilityChip name="Data layers" enabled /><CapabilityChip name="Voice & AI" enabled={false} /></div></Section>
      <Section title="Form">
        <FormField label="Email" description="Used to sign in." required><Input type="email" autoComplete="off" /></FormField>
        <FormField label="Name" error="The name field is not valid."><Input defaultValue="x" /></FormField>
        <FormField label="Password"><PasswordInput value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="new-password" /></FormField>
        <RadioGroup defaultValue="auto" aria-label="Initial password"><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="auto" />Auto-generate</label><label className="flex items-center gap-2 text-sm"><RadioGroupItem value="manual" />Type it yourself</label></RadioGroup>
        <label className="flex items-center gap-2 text-sm"><Switch aria-label="Data layers" defaultChecked />Data layers</label>
        <CopyField label="Temporary password" value="Example-Temporary-Password-42" extraCopy={{ label: 'Copy message', text: 'Temporary password: Example-Temporary-Password-42' }} />
      </Section>
      <Section title="Dialogs and toasts"><DialogDemo /><Button variant="outline" className="w-fit" onClick={() => toast.success('Changes saved')}>Show toast</Button></Section>
      <Section title="Tabel"><TableDemo /></Section>
      <Section title="Keadaan"><EmptyState title="No users yet" description="Create the first user to get started." /><ErrorState error={{ code: 'FEATURE_DISABLED', status: 503 }} onRetry={() => toast('Retrying')} /><LoadingState rows={3} /></Section>
    </div>
  );
}
