/** Icon per menu item (`NavItem.icon` key → lucide component). Unknown keys fall back to a neutral dot-like icon. */
import {
  Activity, Bot, Circle, Cpu, Gauge, HeartPulse, History, KeyRound, LayoutDashboard, LogIn, ReceiptText, ScrollText, ShieldAlert, SlidersHorizontal, Users,
} from 'lucide-react';

export const NAV_ICONS = Object.freeze({
  overview: LayoutDashboard,
  users: Users,
  loginLog: LogIn,
  audit: History,
  killSwitch: ShieldAlert,
  usage: Gauge,
  apiKeys: KeyRound,
  general: SlidersHorizontal,
  aiProvider: Cpu,
  persona: Bot,
  aiUsage: ReceiptText,
  logs: ScrollText,
  auditLog: Activity,
  health: HeartPulse,
});

/** @param {string | undefined} key */
export function navIcon(key) {
  return (key && NAV_ICONS[key]) || Circle;
}
