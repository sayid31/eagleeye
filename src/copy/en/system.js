/**
 * English strings of the /dev system pages: System Overview, Kill switch, Pemakaian (Usage & budget).
 * The log pages live in systemLogs.js. Technical terms (API key, token, voice, layer, runtime) stay English; "Sakelar
 * darurat" is the glossary term for the global kill switch (glossary.js).
 *
 * @module copy/en/system
 */

/** Provider id → display name (the key store sends ALL-CAPS titles). */
export const PROVIDER_NAMES = Object.freeze({
  'google-maps': 'Google Maps',
  openai: 'OpenAI',
  aisstream: 'AISStream',
  firms: 'NASA FIRMS',
  tomtom: 'TomTom',
  'cesium-ion': 'Cesium ion',
  opensky: 'OpenSky',
  'launch-library': 'Launch Library',
});

export const SYSTEM_TIME_COPY = Object.freeze({
  justNow: 'just now',
  minutesAgo: (n) => `${n} min ago`,
  hoursAgo: (n) => `${n} h ago`,
  daysAgo: (n) => `${n} d ago`,
  never: 'never',
  seconds: (n) => `${n} s`,
  minutes: (n) => `${n} min`,
  hoursMinutes: (h, m) => `${h} h ${String(m).padStart(2, '0')} min`,
  daysHours: (d, h) => `${d} d ${h} h`,
  updatedAt: (time) => `Updated ${time}`,
});

/** Overline-free card copy of the overview. */
export const OVERVIEW_COPY = Object.freeze({
  title: 'System Overview',
  description: 'Server, login, and provider key status in one view.',
  refresh: 'Reload',
  loadingLabel: 'Loading system overview',
  errorTitle: 'System overview could not be loaded',
  version: Object.freeze({ title: 'App version', runtime: (name, version) => `Running on ${name} ${version}` }),
  uptime: Object.freeze({ title: 'Uptime', since: (time) => `Since ${time}` }),
  login: Object.freeze({
    title: 'Login',
    configured: 'Login configured',
    google: 'Google login (super admin)',
    ready: 'Ready',
    notReady: 'Not ready',
    on: 'Active',
    off: 'Not active',
  }),
  gates: Object.freeze({
    title: 'Kill switch',
    allOn: 'All paid features are on',
    value: (on, total) => `${on} of ${total} on`,
    someOff: (names) => `Turned off: ${names}`,
    manage: 'Manage kill switches',
  }),
  errors: Object.freeze({
    title: 'Errors in Server Log',
    detail: (hours) => `errors in the last ${hours} hours`,
    none: (hours) => `No errors in the last ${hours} hours`,
    open: 'Open Server Log',
  }),
  keys: Object.freeze({
    title: 'API keys per provider',
    description: 'Only whether a key is installed or not. Key values are never sent to the browser.',
    summary: (set, total) => `${set} of ${total} keys set`,
    present: 'Key set',
    absent: 'Not set',
    manage: 'Manage API keys',
  }),
  doctor: Object.freeze({
    title: 'Readiness warnings',
    description: 'The same login checks as the terminal command.',
    none: 'No warnings. Login is ready to use.',
    hint: 'For the full check, run npm run doctor in the terminal.',
    count: (n) => `Warnings: ${n}`,
  }),
});

/** Doctor check id → title + plain-language explanation (params are counts/flags only, never secrets). */
export const DOCTOR_COPY = Object.freeze({
  'auth.secret': Object.freeze({
    title: 'Login secret key',
    text: ({ problem, legacy }) => (problem === 'missing'
      ? 'BETTER_AUTH_SECRET is not set, so login cannot be used yet. Fill it with random text of at least 32 characters in .env.'
      : problem ? 'BETTER_AUTH_SECRET is shorter than 32 characters. Replace it with longer random text.'
        : legacy ? 'Only ADMIN_SESSION_SECRET (the old name) is set. Rename it to BETTER_AUTH_SECRET.'
          : 'BETTER_AUTH_SECRET is set.'),
  }),
  'auth.superAdminEmails': Object.freeze({
    title: 'Super admin emails',
    text: ({ problem }) => (problem === 'missing'
      ? 'SUPER_ADMIN_EMAILS is not set, so no one can open the Developer area.'
      : 'SUPER_ADMIN_EMAILS contains no valid email address.'),
  }),
  'auth.url': Object.freeze({
    title: 'Login server address',
    text: () => 'BETTER_AUTH_URL must be a full address starting with http:// or https://.',
  }),
  'auth.database': Object.freeze({
    title: 'Login database',
    text: ({ problem }) => (problem === 'missing'
      ? 'The login database has not been created. Run the login migration before using this area.'
      : `The login database could not be read (${problem}).`),
  }),
  'auth.superAdminAccess': Object.freeze({
    title: 'Super admin access',
    text: ({ envEmails, ready, noAccount, blocked }) => `${ready} of ${envEmails} super admin emails can already sign in. `
      + `${noAccount} have no account yet (run npm run auth:set-password); ${blocked} only have an admin-created password and so are not made super admin.`,
  }),
  'auth.reconcileBlocked': Object.freeze({
    title: 'Super admin email denied',
    text: ({ count }) => `${count} configuration emails were refused super admin status. See Audit for details.`,
  }),
  'auth.exposure': Object.freeze({
    title: 'Server reachable from outside',
    text: ({ via, passwordOnlyAdmins }) => `The server can be reached from outside this machine (via ${via === 'host' ? 'HOST' : 'BETTER_AUTH_URL'}) `
      + `while ${passwordOnlyAdmins ?? 'some'} admins sign in with a password only. Restrict /admin, /dev, and /api/admin/* at the reverse proxy (IP allowlist or VPN).`,
  }),
});

/** Gate id → name, what switching it off stops. */
export const GATE_COPY = Object.freeze({
  layers: Object.freeze({ label: 'Data layers', stops: 'All data layer proxies: OpenSky, adsb.lol, AIS, CelesTrak, FIRMS, TomTom, CCTV, Overpass, and more.' }),
  ai: Object.freeze({ label: 'Voice & AI', stops: 'New voice sessions (GPT-Live), HUD summaries, judge, and all AI routes.' }),
  premium: Object.freeze({ label: 'Premium map & search', stops: 'Google Photorealistic 3D Tiles, Geocoding, and Places.' }),
});

export const KILL_SWITCH_COPY = Object.freeze({
  title: 'Kill switch',
  description: 'Turn off one paid feature for all accounts when costs spike or there is an outage.',
  refresh: 'Reload',
  loadingLabel: 'Loading kill switch status',
  errorTitle: 'Kill switch status could not be loaded',
  notice: Object.freeze({
    title: 'Applies to everyone, including you',
    body: 'New requests to a feature that is turned off are rejected within 2 seconds. Voice sessions already running are not cut off.',
  }),
  switchLabel: (gate) => `${gate}: on for all accounts`,
  on: 'On',
  off: 'Off',
  lastChange: Object.freeze({
    never: 'Never changed.',
    by: (who, ago) => `Changed ${ago} by ${who}.`,
    reason: (text) => `Reason: ${text}`,
    unknownActor: 'an unknown account',
  }),
  dialog: Object.freeze({
    offTitle: (gate) => `Turn off ${gate} for all accounts?`,
    onTitle: (gate) => `Turn ${gate} back on?`,
    offImpact: (stops) => `Applies to everyone including you. ${stops} This feature stays off until you turn it on again. The change is recorded in Audit.`,
    onImpact: (gate) => `${gate} can be used again by every account that has permission. The change is recorded in Audit.`,
    offAction: 'Turn off now',
    onAction: 'Turn back on',
    reasonOff: 'Reason (required, at least 3 characters)',
    reasonOn: 'Reason (optional)',
    password: 'Your password',
    passwordHint: 'To confirm your identity. Google accounts: leave empty if you signed in with Google less than 10 minutes ago.',
  }),
  toast: Object.freeze({
    off: (gate) => `${gate} turned off for all accounts.`,
    on: (gate) => `${gate} is back on.`,
    auditFailed: 'The change was saved, but the audit entry could not be written. Check the Server Log.',
  }),
});

export const USAGE_COPY = Object.freeze({
  title: 'Usage & budget',
  description: 'Daily usage from the server\'s counters. OpenSky and TomTom figures count from server start.',
  refresh: 'Reload',
  loadingLabel: 'Loading provider usage',
  errorTitle: 'Provider usage could not be loaded',
  emptyNotConfigured: Object.freeze({ title: 'Provider not configured', description: 'Add its API key so usage is recorded here.', action: 'Manage API keys' }),
  emptyNoData: Object.freeze({ title: 'No data yet', description: 'No usage since the server started.' }),
  opensky: Object.freeze({
    title: 'OpenSky',
    description: 'Daily API credits for live aircraft',
    big: (n) => `${n}`,
    unit: 'credits left',
    seen: (ago) => `Last reported ${ago}.`,
    warnAt: 'Warning below',
    ttl: 'Cache governor',
    ttlValue: (seconds) => `${seconds} s`,
    reset: 'Credits are refilled by OpenSky daily.',
  }),
  tomtom: Object.freeze({
    title: 'TomTom',
    description: 'Daily traffic tile budget',
    unit: (budget) => `of ${budget} tiles today`,
    meterLabel: 'TomTom tiles used today',
    meterText: (used, budget, percent) => `${used} of ${budget} tiles (${percent}%)`,
    reset: (countdown) => `Resets at 00:00 UTC, in ${countdown}.`,
    date: 'Count date (UTC)',
  }),
  openai: Object.freeze({
    title: 'OpenAI voice',
    description: 'Voice minutes and judge calls today',
    unitCap: (cap) => `of the ${cap}-minute limit today`,
    unitNoCap: 'minutes today, no daily limit',
    meterLabel: 'Voice minutes used today',
    meterText: (used, cap, percent) => `${used} of ${cap} minutes (${percent}%)`,
    judgeLabel: 'Judge calls today',
    judgeText: (calls, max) => `${calls} of ${max} calls`,
    judgeOff: 'Judge off',
    voiceOffStatus: 'Voice off',
    voiceOffNote: 'Voice is turned off in General settings, so new sessions are rejected.',
    costToday: 'Estimated cost today',
    cost7d: 'Estimated cost, 7 days',
    reset: 'The daily limit resets at midnight server time.',
    detailsLink: 'Breakdown and cost limits',
  }),
  days: Object.freeze({
    caption: 'Voice usage, last 7 days',
    title: '7-day breakdown',
    day: 'Day',
    sessions: 'Sessions',
    audio: 'Audio',
    cost: 'Estimated cost',
    sessionCount: (n) => `Sessions: ${n}`,
  }),
  statusWord: Object.freeze({ ok: 'Healthy', warn: 'Almost used up', error: 'Used up', off: 'Not configured', unknown: 'No data' }),
});
