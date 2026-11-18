// src/admin/dev/logs/healthText.js
/**
 * Says the health report in English. The server builds each item's label and detail in English
 * (systemHealthCore.mjs, whose output and tests stay as they are), so this module maps known item ids and detail
 * shapes to the English templates in copy/en/systemLogs.js. A detail it does not recognise is shown unchanged:
 * better English than a wrong translation. Pure.
 *
 * @module admin/dev/logs/healthText
 */
import { HEALTH_COPY as H } from '../../../copy/en/systemLogs.js';
import { providerName } from '../lib/statusView.js';

/** "3 min ago" / "never" (server `ago()`) inside any text → English. */
export function translateAgo(text) {
  return String(text)
    .replace(/(\d+) s ago/g, (_, n) => H.ago.seconds(n))
    .replace(/(\d+) min ago/g, (_, n) => H.ago.minutes(n))
    .replace(/(\d+) h ago/g, (_, n) => H.ago.hours(n))
    .replace(/(\d+) d ago/g, (_, n) => H.ago.days(n))
    .replace(/\bnever\b/g, H.ago.never);
}

const D = H.details;
const SOURCE = { 'set outside this app': D.sourceExternal, 'in the app store': D.sourceApp };

/** `[pattern, template(matches)]`; the first pattern that matches a detail wins. */
const RULES = [
  [/^Started (.+)$/, (m) => D.started(translateAgo(m[1]))],
  [/^Not configured$/, () => D.notConfigured],
  [/^Configured \((.+)\) · not tested yet$/, (m) => `${D.configured(SOURCE[m[1]] ?? m[1])} · ${D.notTested}`],
  [/^Configured \((.+)\) · last test (\w+) (.+)$/, (m) => `${D.configured(SOURCE[m[1]] ?? m[1])} · ${D.lastTest(D.testResults[m[2]] ?? m[2], translateAgo(m[3]))}`],
  [/^Receiving data(?: · last message (.+))?$/, (m) => D.aisLive(m[1] ? D.lastMessage(translateAgo(m[1])) : '')],
  [/^AISStream refuses the key$/, () => D.aisRefused],
  [/^No AISStream key$/, () => D.aisNoKey],
  [/^Not running \(turn on the Ships layer\)$/, () => D.aisIdle],
  [/^No \/api traffic seen since the server started$/, () => D.noTraffic],
  [/^Failing: HTTP (\d+) (\d+)× in a row · (.+)$/, (m) => D.serviceFailing(m[1], m[2], translateAgo(m[3]))],
  [/^Last answer HTTP (\d+) · (.+)$/, (m) => D.serviceLast(m[1], translateAgo(m[2]))],
  [/^No OpenSky answer since the server started$/, () => D.noOpenSky],
  [/^(\d+) left · (.+)$/, (m) => D.openSkyLeft(m[1], translateAgo(m[2]))],
  [/^No TomTom tile fetched since the server started$/, () => D.noTomTom],
  [/^(\d+) of (\d+) \((\d+%)\) on (.+) UTC$/, (m) => D.tomtomUsed(m[1], m[2], m[3], m[4])],
  [/^Enabled$/, () => D.voiceOn],
  [/^Turned off in General$/, () => D.voiceOff],
  [/^(\d+) min used · no daily limit$/, (m) => D.voiceNoCap(m[1])],
  [/^(\d+) min of (\d+) min \((\d+%)\)$/, (m) => D.voiceCap(m[1], m[2], m[3])],
  [/^Turned off \(GEV_VOICE_JUDGE=off\)$/, () => D.judgeOff],
  [/^(\d+) of (\d+) calls today$/, (m) => D.judgeCalls(m[1], m[2])],
  [/^Writing to disk is failing$/, () => D.logFailing],
  [/^(\d+) rows · (.+) · last write (.+)$/, (m) => D.logSummary(m[1], m[2] === 'not written yet' ? D.logNotWritten : m[2].replace(' of ', ' of '), translateAgo(m[3]))],
  [/^(\d+) entries$/, (m) => D.auditEntries(m[1])],
];

/** English detail of one health item; the original text when no rule knows it. */
export function translateDetail(detail) {
  const text = String(detail ?? '');
  for (const [pattern, render] of RULES) {
    const match = pattern.exec(text);
    if (match) return render(match);
  }
  // AIS "other" states read "<status> · last message …": translate the time part only.
  return translateAgo(text);
}

/** English label of a health item (key items use the provider display name, service items keep their route). */
export function translateLabel(item) {
  if (Object.hasOwn(H.labels, item.id)) return H.labels[item.id];
  if (item.id.startsWith('key.')) return providerName(item.id.slice('key.'.length), item.label);
  return item.label;
}

/** English title of a section (unknown ids keep the server title). */
export const translateSection = (id, title) => (Object.hasOwn(H.sections, id) ? H.sections[id] : title);
