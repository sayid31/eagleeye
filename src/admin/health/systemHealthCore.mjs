// src/admin/health/systemHealthCore.mjs
/**
 * /admin → System Health: turns raw server facts into sections of items with
 * a status — ok, warn, error, off (deliberately not running / not set) or
 * unknown (no evidence yet). Nothing here calls a provider: key status comes
 * from the last "Test connection" in the audit trail, services from the live
 * /api traffic the server has already seen.
 *
 * Pure — no fs, no network, no DOM.
 *
 * @module admin/health/systemHealthCore
 */

/** Worst first; `off` and `unknown` never make the overall status worse than ok. */
const RANK = { error: 3, warn: 2, ok: 1, unknown: 0, off: 0 };
/** Share of a quota at which an item turns to warn. */
export const QUOTA_WARN_SHARE = 0.8;
export const LOG_SIZE_WARN_SHARE = 0.9;

const item = (id, label, status, detail) => ({ id, label, status, detail });
const pct = (used, total) => `${Math.round((used / total) * 100)}%`;
const minutes = (seconds) => `${Math.round(seconds / 60)} min`;

/** "3 min ago" / "2 h ago" / "4 d ago" relative to `now`. */
export function ago(at, now) {
  if (!Number.isFinite(at)) return 'never';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

/** Latest `keys.tested` audit entry per provider id (entries newest first). */
export function lastKeyTests(auditEntries) {
  const latest = {};
  for (const entry of auditEntries) {
    if (entry.event === 'keys.tested' && entry.provider && !latest[entry.provider]) latest[entry.provider] = entry;
  }
  return latest;
}

function keyItems(keys, tests, now) {
  return keys.map((key) => {
    if (!key.set) return item(`key.${key.id}`, key.title, 'off', 'Not configured');
    const source = key.managed === 'external' ? 'set outside this app' : 'in the app store';
    const test = tests[key.id];
    if (!test) return item(`key.${key.id}`, key.title, 'unknown', `Configured (${source}) · not tested yet`);
    const when = ago(Date.parse(test.at), now);
    const status = { ok: 'ok', rejected: 'error', unreachable: 'warn' }[test.result] ?? 'unknown';
    return item(`key.${key.id}`, key.title, status, `Configured (${source}) · last test ${test.result} ${when}`);
  });
}

function feedItem(ais, now) {
  const status = ais?.status ?? 'idle';
  const seen = ais?.lastMessageAt ? ` · last message ${ago(ais.lastMessageAt, now)}` : '';
  if (status === 'live') return item('feed.ais', 'AISStream live vessels', 'ok', `Receiving data${seen}`);
  if (status === 'auth-failed') return item('feed.ais', 'AISStream live vessels', 'error', 'AISStream refuses the key');
  if (status === 'missing-key') return item('feed.ais', 'AISStream live vessels', 'off', 'No AISStream key');
  if (status === 'idle') return item('feed.ais', 'AISStream live vessels', 'off', 'Not running (turn on the Ships layer)');
  return item('feed.ais', 'AISStream live vessels', 'warn', `${status}${seen}`);
}

function serviceItems(routes, now) {
  if (!routes.length) return [item('service.none', 'External services', 'unknown', 'No /api traffic seen since the server started')];
  return routes.map((r) => {
    const status = r.failing ? 'error' : r.lastStatus >= 500 ? 'warn' : 'ok';
    const detail = r.failing
      ? `Failing: HTTP ${r.lastStatus} ${r.streak}× in a row · ${ago(r.lastAt, now)}`
      : `Last answer HTTP ${r.lastStatus} · ${ago(r.lastAt, now)}`;
    return item(`service.${r.route}`, r.route, status, detail);
  });
}

function quotaItems({ opensky, openskyWarnAt, tomtom }, now) {
  const items = [];
  if (!opensky) items.push(item('quota.opensky', 'OpenSky daily credits', 'unknown', 'No OpenSky answer since the server started'));
  else items.push(item('quota.opensky', 'OpenSky daily credits', opensky.remaining <= openskyWarnAt ? 'warn' : 'ok', `${opensky.remaining} left · ${ago(opensky.at, now)}`));
  if (!tomtom) items.push(item('quota.tomtom', 'TomTom daily tile budget', 'unknown', 'No TomTom tile fetched since the server started'));
  else {
    const share = tomtom.used / tomtom.budget;
    const status = share >= 1 ? 'error' : share >= QUOTA_WARN_SHARE ? 'warn' : 'ok';
    items.push(item('quota.tomtom', 'TomTom daily tile budget', status, `${tomtom.used} of ${tomtom.budget} (${pct(tomtom.used, tomtom.budget)}) on ${tomtom.date} UTC`));
  }
  return items;
}

function voiceItems({ enabled, dailyMinutes, usedSeconds, judgeEnabled, judgeCalls, judgeMax }) {
  const items = [item('voice.enabled', 'Voice assistant', enabled ? 'ok' : 'off', enabled ? 'Enabled' : 'Turned off in General')];
  if (!dailyMinutes) items.push(item('voice.minutes', 'Voice minutes today', 'ok', `${minutes(usedSeconds)} used · no daily limit`));
  else {
    const share = usedSeconds / (dailyMinutes * 60);
    const status = share >= 1 ? 'error' : share >= QUOTA_WARN_SHARE ? 'warn' : 'ok';
    items.push(item('voice.minutes', 'Voice minutes today', status, `${minutes(usedSeconds)} of ${dailyMinutes} min (${pct(usedSeconds, dailyMinutes * 60)})`));
  }
  if (!judgeEnabled) items.push(item('voice.judge', 'Off-topic judge', 'off', 'Turned off (GEV_VOICE_JUDGE=off)'));
  else {
    const status = judgeMax && judgeCalls >= judgeMax ? 'warn' : 'ok';
    items.push(item('voice.judge', 'Off-topic judge', status, `${judgeCalls} of ${judgeMax} calls today`));
  }
  return items;
}

function logItems({ server, auditEntries }, now) {
  const { entries, bytes, maxBytes, writeFailing, lastWriteAt } = server;
  let status = 'ok';
  if (writeFailing) status = 'error';
  else if (bytes && bytes >= maxBytes * LOG_SIZE_WARN_SHARE) status = 'warn';
  const size = bytes ? `${(bytes / 1024).toFixed(0)} KB of ${(maxBytes / 1048576).toFixed(0)} MB` : 'not written yet';
  return [
    item('log.server', 'Server Log file', status, writeFailing ? 'Writing to disk is failing' : `${entries} rows · ${size} · last write ${ago(lastWriteAt, now)}`),
    item('log.audit', 'Audit trail', 'ok', `${auditEntries} entries`),
  ];
}

/** Worst status across items (`off`/`unknown` count as ok). */
export function overallStatus(sections) {
  const worst = sections.flatMap((s) => s.items).reduce((acc, i) => (RANK[i.status] > RANK[acc] ? i.status : acc), 'ok');
  return RANK[worst] >= RANK.warn ? worst : 'ok';
}

/**
 * @param {object} facts Raw facts gathered by the route (see systemHealthRoutes.mjs).
 * @returns {{status: string, generatedAt: number, sections: Array<{id: string, title: string, items: object[]}>}}
 */
export function buildHealthReport(facts) {
  const { now } = facts;
  const sections = [
    { id: 'server', title: 'Server', items: [
      item('server.version', 'App version', 'ok', `v${facts.server.appVersion} · Node ${facts.server.nodeVersion}`),
      item('server.uptime', 'Uptime', 'ok', `Started ${ago(facts.server.startedAt, now)}`),
    ] },
    { id: 'keys', title: 'API keys', items: keyItems(facts.keys, lastKeyTests(facts.auditTail), now) },
    { id: 'feeds', title: 'Live feeds', items: [feedItem(facts.ais, now)] },
    { id: 'services', title: 'External services', items: serviceItems(facts.routes, now) },
    { id: 'quotas', title: 'Quotas', items: quotaItems(facts.quotas, now) },
    { id: 'voice', title: 'Voice', items: voiceItems(facts.voice) },
    { id: 'logs', title: 'Logs', items: logItems(facts.logs, now) },
  ];
  return { status: overallStatus(sections), generatedAt: now, sections };
}
