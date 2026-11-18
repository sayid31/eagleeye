/** Accounts offered by the "Akun" filter of Login Log and Audit: the first 100 by the API's order (newest first). */
import { useMemo } from 'react';
import { usersApi } from './usersApi.js';
import { useResource } from './useResource.js';

/** Largest page the users API returns. */
export const USER_OPTIONS_LIMIT = 100;

/**
 * @param {string} selectedId Account currently filtered on; kept in the list even if it is beyond the first 100.
 * @returns {{options: Record<string, string>}} Select options (`value → text`), without the "all" entry.
 */
export function useUserOptions(selectedId) {
  const { data } = useResource(() => usersApi.list({ limit: USER_OPTIONS_LIMIT }), 'user-options');
  return useMemo(() => {
    const options = Object.fromEntries((data?.users ?? []).map((user) => [user.id, `${user.name} (${user.email})`]));
    if (selectedId && !options[selectedId]) options[selectedId] = selectedId;
    return { options };
  }, [data, selectedId]);
}
