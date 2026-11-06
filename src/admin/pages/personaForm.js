// src/admin/pages/personaForm.js
/**
 * Form model of AI Configuration → Persona: the locked core rules grouped for
 * display, and the owner's extra rules ⇄ editable rows. The server validates
 * again (`readExtraRules`); these checks only give a faster message.
 *
 * Like the General page, a save starts from the settings last loaded and
 * overwrites only `persona.extraRules`, so every other section survives.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/pages/personaForm
 */

export const EXTRA_RULES_MAX = 20;
export const EXTRA_RULE_TEXT_MAX = 200;

const GUARD_LABELS = { prompt: 'Prompt', 'prompt+code': 'Prompt + code' };

/** Badge text for what enforces a core rule. */
export function guardLabel(guard) {
  return GUARD_LABELS[guard] ?? 'Prompt';
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

/** @param {object} settings Server settings snapshot. */
export function extraRuleRows(settings) {
  return (settings.persona?.extraRules ?? []).map(({ forbid, instead }) => ({ forbid, instead }));
}

/**
 * Fully empty rows are dropped; a half-filled row is an error.
 * @param {object} base Settings last loaded from the server.
 * @param {Array<{forbid: string, instead: string}>} rows
 * @returns {{ok: true, settings: object} | {ok: false, errors: string[]}}
 */
export function settingsFromPersonaForm(base, rows) {
  const errors = [];
  const extraRules = [];
  rows.forEach((row, index) => {
    const forbid = String(row.forbid ?? '').trim();
    const instead = String(row.instead ?? '').trim();
    if (!forbid && !instead) return;
    if (!forbid || !instead) errors.push(`Extra rule ${index + 1}: fill in both Forbidden and Instead.`);
    else if (forbid.length > EXTRA_RULE_TEXT_MAX || instead.length > EXTRA_RULE_TEXT_MAX) {
      errors.push(`Extra rule ${index + 1}: up to ${EXTRA_RULE_TEXT_MAX} characters per field.`);
    } else extraRules.push({ forbid, instead });
  });
  if (extraRules.length > EXTRA_RULES_MAX) errors.push(`Up to ${EXTRA_RULES_MAX} extra rules.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: { ...base, persona: { ...base.persona, extraRules } } };
}
