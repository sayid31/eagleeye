/**
 * Menu labels of /admin and /dev, exactly as the dashboard has always named them (docs/CURRENT-STATE.md, "UI").
 * adminNav.js composes the menu from these. Terminology follows glossary.js ("Kill switch", "Server Log").
 */

export const NAV_COPY = Object.freeze({
  groups: Object.freeze({
    aiConfig: 'AI Configuration',
    serverLog: 'Server Log',
  }),
  items: Object.freeze({
    overview: 'Overview',
    systemOverview: 'System Overview',
    users: 'Users',
    usersAndAdmins: 'Users & Admins',
    loginLog: 'Login Log',
    killSwitches: 'Kill switch',
    usage: 'Usage',
    apiKeys: 'API Keys',
    general: 'General',
    aiProvider: 'AI Provider',
    persona: 'Persona',
    aiUsage: 'Usage & Cost',
    serverLog: 'Server Log',
    auditLog: 'Audit Log',
    health: 'System Health',
    audit: 'Audit',
    uiKit: 'Component catalog',
  }),
});
