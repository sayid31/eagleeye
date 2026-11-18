// src/admin/dev/overview/overviewView.js
/**
 * View-model of System Overview: the status cards, the key-presence list and the doctor warnings, from the
 * `GET /api/admin/system` payload (which never carries a key value, a secret or an email). Pure.
 *
 * @module admin/dev/overview/overviewView
 */
import { DOCTOR_COPY, OVERVIEW_COPY as T } from '../../../copy/en/system.js';
import { gateTally } from '../killswitch/killSwitchView.js';
import { providerName } from '../lib/statusView.js';
import { formatAbsolute, formatUptime } from '../lib/timeView.js';

/**
 * @param {object} summary Payload of `GET /api/admin/system`.
 * @returns {{
 *   version: {value: string, detail: string},
 *   uptime: {value: string, detail: string},
 *   login: {status: string, rows: {id: string, label: string, status: string, text: string}[]},
 *   gates: {status: string, value: string, detail: string},
 *   errors: {status: string, value: string, detail: string},
 * }}
 */
export function overviewCards(summary) {
  const { app, auth, killSwitches, serverLog } = summary;
  const tally = gateTally(killSwitches);
  const loginRows = [
    { id: 'configured', label: T.login.configured, status: auth.configured ? 'ok' : 'error', text: auth.configured ? T.login.ready : T.login.notReady },
    { id: 'google', label: T.login.google, status: auth.googleSignIn ? 'ok' : 'off', text: auth.googleSignIn ? T.login.on : T.login.off },
  ];
  return {
    version: { value: `v${app.version}`, detail: T.version.runtime(app.runtime.name, app.runtime.version) },
    uptime: { value: formatUptime(app.uptimeSeconds), detail: T.uptime.since(formatAbsolute(app.startedAt, { now: summary.generatedAt, seconds: false })) },
    login: { status: auth.configured ? 'ok' : 'error', rows: loginRows },
    gates: {
      status: tally.off.length ? 'warn' : 'ok',
      value: T.gates.value(tally.on, tally.total),
      detail: tally.off.length ? T.gates.someOff(tally.off.join(', ')) : T.gates.allOn,
    },
    errors: {
      status: serverLog.recentErrors ? 'error' : 'ok',
      value: String(serverLog.recentErrors),
      detail: serverLog.recentErrors ? T.errors.detail(serverLog.windowHours) : T.errors.none(serverLog.windowHours),
    },
  };
}

/**
 * Key presence per provider, in the server's order (the order of the API keys page).
 * @param {{id: string, title: string, set: boolean}[]} keys
 * @returns {{summary: string, rows: {id: string, name: string, set: boolean}[]}}
 */
export function keyPresence(keys) {
  const rows = keys.map((key) => ({ id: key.id, name: providerName(key.id, key.title), set: key.set === true }));
  return { summary: T.keys.summary(rows.filter((row) => row.set).length, rows.length), rows };
}

/**
 * Doctor warnings with a title and a plain-language sentence each (unknown ids keep their id as text).
 * @param {{id: string, level: string, params?: object}[]} checks
 * @returns {{id: string, level: 'warn' | 'error', title: string, text: string}[]}
 */
export function doctorItems(checks) {
  return checks.map((check) => {
    const copy = DOCTOR_COPY[check.id];
    return {
      id: check.id,
      level: check.level === 'error' ? 'error' : 'warn',
      title: copy?.title ?? check.id,
      text: copy?.text(check.params ?? {}) ?? check.id,
    };
  });
}
