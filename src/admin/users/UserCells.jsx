/** Cell and card building blocks of the Pengguna table (the table and the mobile card share them). */
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CapabilityChip, StatusBadge } from '@/components/app/StatusBadge.jsx';
import { initialsFor } from '@/components/app/navModel.js';
import { CAPABILITY_KEYS } from '../../auth/authCapabilities.mjs';
import { ROLE_USER } from '../../auth/authRoles.mjs';
import { USERS_COPY } from '../../copy/id/users.js';
import { TimeCell } from './TimeCell.jsx';
import { accountStatusKey, roleText } from './usersView.js';

/** Avatar with initials, name and email; long values truncate and keep the full text in `title`. */
export function UserCell({ user, self }) {
  return (
    <div className="flex max-w-72 min-w-0 items-center gap-3">
      <Avatar aria-hidden="true"><AvatarFallback>{initialsFor(user)}</AvatarFallback></Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate" title={user.name}>{user.name}</span>
          {self ? <Badge variant="secondary">{USERS_COPY.self}</Badge> : null}
        </p>
        <p className="truncate text-muted-foreground" title={user.email}>{user.email}</p>
      </div>
    </div>
  );
}

/** Role as a quiet badge (elevated roles stand out a little). */
export function RoleCell({ role }) {
  return <Badge variant={role === ROLE_USER ? 'outline' : 'secondary'}>{roleText(role)}</Badge>;
}

/** The three capability chips of a user; admins and super_admins hold everything. */
export function CapabilityCell({ user }) {
  if (user.role !== ROLE_USER) return <span className="text-muted-foreground">{USERS_COPY.allAccess}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={USERS_COPY.capabilitiesLegend}>
      {CAPABILITY_KEYS.map((key) => (
        <li key={key}><CapabilityChip name={USERS_COPY.capabilities[key].short} enabled={Boolean(user.capabilities?.[key])} /></li>
      ))}
    </ul>
  );
}

/** Status badge of an account. */
export function StatusCell({ user }) {
  return <StatusBadge status={accountStatusKey(user)} />;
}

/** Mobile card body (the row menu sits beside it, supplied by the caller). */
export function UserCard({ user, self, showRole, menu }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <UserCell user={user} self={self} />
        {menu}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusCell user={user} />
        {showRole ? <RoleCell role={user.role} /> : null}
      </div>
      <CapabilityCell user={user} />
      <p className="text-xs text-muted-foreground">{USERS_COPY.columns.created} <TimeCell iso={user.createdAt} /></p>
    </div>
  );
}
