// src/admin/config/personaForm.js
/**
 * Form model of Konfigurasi → Persona: the locked core rules grouped for
 * display, and the owner's extra rules ⇄ editable rows. The server validates
 * again (`readExtraRules`); these checks only give a faster message.
 *
 * Like the Umum page, a save starts from the settings last loaded and
 * overwrites only `persona.extraRules`, so every other section survives.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/personaForm
 */

import { PERSONA_COPY } from '../../copy/id/configForms.js';
import { REFUSAL_MAX, TOPICS_MAX, defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';

const COPY = PERSONA_COPY;
export { REFUSAL_MAX, TOPICS_MAX };
export const EXTRA_RULES_MAX = 20;
export const EXTRA_RULE_TEXT_MAX = 200;

/** Badge text for what enforces a core rule. */
export function guardLabel(guard) {
  return COPY.core.guards[guard] ?? COPY.core.guards.prompt;
}

/**
 * @param {Array<{id: string, label: string}>} groups
 * @param {Array<{group: string}>} rules
 * @returns {Array<{id: string, label: string, rules: Array<object>}>} Non-empty groups, in order.
 */
export function groupCoreRules(groups, rules) {
  return groups
    .map((group) => ({ ...group, rules: rules.filter((rule) => rule.group === group.id) }))
    .filter((group) => group.rules.length > 0);
}

/**
 * One-line overview of the core rules for the top of the Persona page.
 * @param {Array<{rules: Array<{guard: string}>}>} groups Output of `groupCoreRules`.
 */
export function summarizeCoreRules(groups) {
  const rules = groups.flatMap((group) => group.rules);
  const backed = rules.filter((rule) => rule.guard === 'prompt+code').length;
  return COPY.core.summary(rules.length, groups.length, backed);
}

/** "7 aturan" / "6 aturan · 1 dijaga kode" for a group header. */
export function describeRuleGroup(group) {
  const backed = group.rules.filter((rule) => rule.guard === 'prompt+code').length;
  return COPY.core.group(group.rules.length, backed);
}

/** @param {object} settings Server settings snapshot. */
export function extraRuleRows(settings) {
  return (settings.persona?.extraRules ?? []).map(({ forbid, instead }) => ({ forbid, instead }));
}

/**
 * Fully empty rows are dropped; a half-filled row is an error.
 * @param {object} base Settings last loaded from the server.
 * @param {Array<{forbid: string, instead: string}>} rows
 * @param {{topicsEnabled: boolean, topics: string, refusal: string}} [topicForm] Defaults to the saved topics.
 * @returns {{ok: true, settings: object} | {ok: false, errors: string[]}}
 */
export function settingsFromPersonaForm(base, rows, topicForm = topicFormFromSettings(base)) {
  const errors = [];
  const allowed = String(topicForm.topics ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (topicForm.topicsEnabled && allowed.length === 0) errors.push(COPY.validation.topicsEmpty);
  const extraRules = [];
  rows.forEach((row, index) => {
    const forbid = String(row.forbid ?? '').trim();
    const instead = String(row.instead ?? '').trim();
    if (!forbid && !instead) return;
    if (!forbid || !instead) errors.push(COPY.validation.ruleHalf(index + 1));
    else if (forbid.length > EXTRA_RULE_TEXT_MAX || instead.length > EXTRA_RULE_TEXT_MAX) {
      errors.push(COPY.validation.ruleLong(index + 1, EXTRA_RULE_TEXT_MAX));
    } else extraRules.push({ forbid, instead });
  });
  if (extraRules.length > EXTRA_RULES_MAX) errors.push(COPY.validation.tooMany(EXTRA_RULES_MAX));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      ...base,
      persona: { ...base.persona, extraRules },
      topics: { enabled: Boolean(topicForm.topicsEnabled), allowed, refusal: String(topicForm.refusal ?? '').trim() },
    },
  };
}

/**
 * Topic-restriction fields of the Persona page (moved from General: they shape
 * what the assistant talks about, which is Persona territory).
 * @param {object} settings
 * @returns {{topicsEnabled: boolean, topics: string, refusal: string}}
 */
export function topicFormFromSettings(settings) {
  return {
    topicsEnabled: settings.topics?.enabled === true,
    topics: (settings.topics?.allowed ?? []).join('\n'),
    refusal: settings.topics?.refusal ?? '',
  };
}

/** Extra rules and topic fields back at the application defaults (none, restriction off). */
export function defaultPersonaForm() {
  const defaults = defaultVoiceSettings();
  return { rows: extraRuleRows(defaults), topics: topicFormFromSettings(defaults) };
}
