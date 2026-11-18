// src/admin/dev/lib/useDebouncedValue.js
/** `value` after it has stopped changing for `delayMs` (a search box that queries the server on pause, not per key). */
import { useEffect, useState } from 'react';

/**
 * @template T
 * @param {T} value
 * @param {number} delayMs
 * @returns {T}
 */
export function useDebouncedValue(value, delayMs) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
