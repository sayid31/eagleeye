/** Toolbar above the Pengguna table: debounced search, status filter, role filter (/dev only) and reset. */
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { USERS_COPY } from '../../copy/en/users.js';
import { FilterSelect } from './FilterSelect.jsx';

const { toolbar: COPY } = USERS_COPY;

/**
 * @param {{input: string, onInput: (value: string) => void, status: string, onStatus: (value: string) => void,
 *   role: string, onRole: (value: string) => void, showRole: boolean, filtered: boolean, onReset: () => void}} props
 */
export function UsersToolbar({ input, onInput, status, onStatus, role, onRole, showRole, filtered, onReset }) {
  return (
    <>
      <div className="relative w-full sm:w-72">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          placeholder={COPY.searchPlaceholder}
          aria-label={COPY.searchLabel}
          autoComplete="off"
          className="pl-8"
        />
      </div>
      <FilterSelect label={COPY.statusLabel} value={status} options={COPY.statusOptions} onChange={onStatus} className="w-40" />
      {showRole ? <FilterSelect label={COPY.roleLabel} value={role} options={COPY.roleOptions} onChange={onRole} className="w-40" /> : null}
      {filtered ? <Button variant="ghost" onClick={onReset}>{COPY.reset}</Button> : null}
    </>
  );
}
