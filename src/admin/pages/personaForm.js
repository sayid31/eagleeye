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

const GUARD_LABELS = { prompt: 'Prompt', 'prompt+code': 'Prompt + kode' };

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

/**
 * One-line overview of the core rules for the top of the Persona page.
 * @param {Array<{rules: Array<{guard: string}>}>} groups Output of `groupCoreRules`.
 */
export function summarizeCoreRules(groups) {
  const rules = groups.flatMap((group) => group.rules);
  const backed = rules.filter((rule) => rule.guard === 'prompt+code').length;
  return `${rules.length} aturan dalam ${groups.length} grup · ${backed} juga dijaga kode aplikasi, sisanya hanya oleh prompt suara`;
}

/** "7 rules" / "6 rules · 1 enforced by code" for a collapsed group header. */
export function describeRuleGroup(group) {
  const backed = group.rules.filter((rule) => rule.guard === 'prompt+code').length;
  const count = `${group.rules.length} aturan`;
  return backed ? `${count} · ${backed} dijaga kode` : count;
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
    if (!forbid || !instead) errors.push(`Aturan tambahan ${index + 1}: isi kolom Dilarang dan Gantinya.`);
    else if (forbid.length > EXTRA_RULE_TEXT_MAX || instead.length > EXTRA_RULE_TEXT_MAX) {
      errors.push(`Aturan tambahan ${index + 1}: maksimal ${EXTRA_RULE_TEXT_MAX} karakter per kolom.`);
    } else extraRules.push({ forbid, instead });
  });
  if (extraRules.length > EXTRA_RULES_MAX) errors.push(`Maksimal ${EXTRA_RULES_MAX} aturan tambahan.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: { ...base, persona: { ...base.persona, extraRules } } };
}
