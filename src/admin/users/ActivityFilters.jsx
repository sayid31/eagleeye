/** Filter bar of Login Log and Audit: time range, the page's own select (children), the account, and reset. */
import { Button } from '@/components/ui/button';
import { ACTIVITY_COPY } from '../../copy/en/users.js';
import { FilterSelect } from './FilterSelect.jsx';
import { useUserOptions } from './useUserOptions.js';
import { ALL } from './usersView.js';

const COPY = ACTIVITY_COPY.filters;

/**
 * @param {{range: string, onRange: (value: string) => void, userId: string, onUser: (id: string) => void,
 *   filtered: boolean, onReset: () => void, children?: import('react').ReactNode}} props
 *   `children` is the page-specific select (result for Login Log, action for Audit).
 */
export function ActivityFilters({ range, onRange, userId, onUser, filtered, onReset, children }) {
  const { options } = useUserOptions(userId);
  return (
    <div role="group" aria-label={COPY.group} className="flex flex-wrap items-center gap-2">
      <FilterSelect label={COPY.rangeLabel} value={range} options={COPY.rangeOptions} onChange={onRange} className="w-44" />
      {children}
      <FilterSelect
        label={COPY.accountLabel}
        value={userId || ALL}
        options={{ [ALL]: COPY.allAccounts, ...options }}
        onChange={(value) => onUser(value === ALL ? '' : value)}
        className="w-56"
      />
      {filtered ? <Button variant="ghost" onClick={onReset}>{COPY.reset}</Button> : null}
    </div>
  );
}
