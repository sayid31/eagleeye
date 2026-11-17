// src/admin/dev/devPages.js
/** `/dev` system pages by the `page` id their adminNav leaf names (spread into AdminApp's page map). */
import { KillSwitchPage } from './KillSwitchPage.jsx';
import { SystemOverviewPage } from './SystemOverviewPage.jsx';
import { UsageBudgetPage } from './UsageBudgetPage.jsx';
import './dev.css';

export const DEV_PAGES = Object.freeze({
  'dev-overview': SystemOverviewPage,
  'dev-kill-switches': KillSwitchPage,
  'dev-usage': UsageBudgetPage,
});
