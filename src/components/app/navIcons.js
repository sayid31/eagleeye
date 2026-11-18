// src/components/app/navIcons.js
/** Icon per menu item (`NavItem.icon` key → lucide component). Unknown keys fall back to a neutral dot-like icon. */
import { Activity, Bot, Circle, Gauge, KeyRound, LayoutDashboard, ScrollText, ShieldAlert, SlidersHorizontal, Users } from 'lucide-react';

export const NAV_ICONS = Object.freeze({
  overview: LayoutDashboard,
  users: Users,
  activity: Activity,
  killSwitch: ShieldAlert,
  usage: Gauge,
  providers: KeyRound,
  general: SlidersHorizontal,
  persona: Bot,
  logs: ScrollText,
});

/** @param {string | undefined} key */
export function navIcon(key) {
  return (key && NAV_ICONS[key]) || Circle;
}
