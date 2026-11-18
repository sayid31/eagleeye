/**
 * Menu labels of /admin and /dev, exactly as the dashboard has always named them (docs/CURRENT-STATE.md, "UI").
 * adminNav.js composes the menu from these. Terminology follows glossary.js ("Kill switch", "Server Log").
 */

export const NAV_COPY = Object.freeze({
  groups: Object.freeze({
    aiConfig: 'Konfigurasi AI',
    serverLog: 'Server Log',
  }),
  items: Object.freeze({
    overview: 'Ringkasan',
    systemOverview: 'Ringkasan sistem',
    users: 'Pengguna',
    usersAndAdmins: 'Pengguna & Admin',
    loginLog: 'Log Login',
    killSwitches: 'Kill switch',
    usage: 'Pemakaian',
    apiKeys: 'API Keys',
    general: 'Umum',
    aiProvider: 'Penyedia AI',
    persona: 'Persona',
    aiUsage: 'Pemakaian & Biaya',
    serverLog: 'Server Log',
    auditLog: 'Audit Log',
    health: 'Kesehatan Sistem',
    audit: 'Audit',
    uiKit: 'Katalog komponen',
  }),
});
