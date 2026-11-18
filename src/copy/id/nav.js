// src/copy/id/nav.js
/**
 * Menu labels of /admin and /dev (the information architecture of docs/CURRENT-STATE.md, "UI"). One entry per page or
 * tab id; adminNav composes them. Terminology follows glossary.js ("Sakelar darurat", "Log server").
 */

export const NAV_COPY = Object.freeze({
  groups: Object.freeze({
    access: 'Akses',
    control: 'Kendali',
    config: 'Konfigurasi',
    system: 'Sistem',
  }),
  items: Object.freeze({
    overview: 'Ringkasan',
    systemOverview: 'Ringkasan sistem',
    users: 'Pengguna',
    usersAndAdmins: 'Pengguna & Admin',
    activity: 'Aktivitas',
    killSwitches: 'Sakelar darurat',
    usageAndCost: 'Pemakaian & Biaya',
    providers: 'Penyedia & API Keys',
    general: 'Umum',
    persona: 'Persona',
    logs: 'Log server',
  }),
  tabs: Object.freeze({
    loginLog: 'Log Login',
    accountAudit: 'Audit akun',
    audit: 'Audit',
    providerBudget: 'Anggaran provider',
    aiUsage: 'Pemakaian AI',
    apiKeys: 'API Keys',
    aiProvider: 'Penyedia AI',
    serverLog: 'Log',
    keyAudit: 'Jejak audit kunci & AI',
    health: 'Kesehatan',
  }),
});
