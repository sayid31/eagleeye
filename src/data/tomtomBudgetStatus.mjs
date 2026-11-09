// src/data/tomtomBudgetStatus.mjs
/**
 * TomTom daily tile budget, as seen from the admin side: the latest count the
 * running proxy published (for /admin → System Health) and one Server Log
 * warning when today's fetches cross the warn share. Split out of
 * tomtomProxy.mjs, which keeps owning the counter itself.
 *
 * @module data/tomtomBudgetStatus
 */

import { logServerEvent } from '../admin/log/serverLogStore.mjs';

/** Share of the daily tile budget at which the Server Log gets a quota warning. */
export const TOMTOM_QUOTA_WARN_SHARE = 0.8;

let lastStatus = null;

/**
 * Note one counted upstream fetch.
 * @param {{date: string, count: number}} today The proxy's counter after incrementing.
 * @param {number} budget Today's limit (TOMTOM_DAILY_TILE_BUDGET or default).
 * @param {(event: object) => void} [log]
 */
export function noteTomTomFetch(today, budget, log = logServerEvent) {
  lastStatus = { date: today.date, used: today.count, budget };
  if (today.count === Math.ceil(budget * TOMTOM_QUOTA_WARN_SHARE)) {
    log({ level: 'warn', source: 'proxy', code: 'proxy.quota_low', message: 'TomTom daily tile budget is nearly used up', detail: { provider: 'tomtom', used: today.count, budget } });
  }
}

/** @returns {{date: string, used: number, budget: number} | null} null until the proxy counted a fetch. */
export function tomtomBudgetStatus() {
  return lastStatus ? { ...lastStatus } : null;
}
