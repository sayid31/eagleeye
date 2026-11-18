// src/copy/en/configForms.js
/**
 * English copy of Umum, Persona and Usage & Cost (the voice-settings forms). Re-exported by config.js.
 * Pure data; the tool-group texts translate the server's English labels, which also go into the voice prompt.
 *
 * @module copy/en/configForms
 */

export const GENERAL_COPY = Object.freeze({
  title: 'General',
  description: 'Voice assistant: on or off, name, tool permissions, and session limits. Changes apply from the next voice session.',
  loading: 'Loading settings',
  loadError: 'Settings could not be loaded',
  storedInvalid: 'The saved settings file could not be read. Default settings apply until you save.',
  enforced: {
    title: 'Currently in effect',
    voice: 'Voice', coreRules: 'Core rules', topics: 'Topic restriction',
    topicsCount: (count) => `Topic restriction (${count})`,
    tools: (on, total) => `Tool groups (${on} of ${total})`,
  },
  assistant: {
    title: 'Assistant',
    description: 'On or off, name, and speaking style.',
    enabled: { title: 'Voice assistant on', description: 'Off: the mic button refuses to start new sessions.' },
    name: { label: 'Assistant name', description: (max) => `Optional, at most ${max} characters. Empty uses the default name.` },
    notes: {
      label: 'Personality notes',
      description: 'Tone and language style only. Always below the core rules; cannot change tools or rules.',
      placeholder: 'Example: friendly, brief, everyday language.',
    },
  },
  tools: {
    title: 'Tool permissions',
    description: 'A group that is off is never offered to the voice model, so the tools inside cannot be called.',
    group: (label, count) => `${label} (${count} tools)`,
  },
  limits: {
    title: 'Session limits',
    description: 'A session closes automatically when a limit is reached. Empty a field to turn that limit off.',
    placeholder: 'No limit',
    range: (min, max, unit) => `${min}–${max} ${unit}`,
    hardCap: (max) => `Hard limit of ${max} minutes: a voice session always ends after at most ${max} minutes, whatever value is set here. A value above ${max} can still be saved but has no effect.`,
    aboveCap: (value, max) => `A value of ${value} minutes exceeds the hard limit. The session still ends at ${max} minutes.`,
    fields: {
      dailyMinutes: { label: 'Voice minutes per day', unit: 'minutes' },
      sessionMinutes: { label: 'Maximum session length', unit: 'minutes' },
      idleSeconds: { label: 'Close when idle after', unit: 'seconds' },
    },
    invalidSummary: 'Check the highlighted session limit fields.',
    invalid: (label, min, max, unit) => `${label}: enter a whole number from ${min} to ${max} ${unit}, or leave empty for no limit.`,
    reset: 'Restore default limits',
  },
  toolGroups: {
    readOnly: { label: 'Read only', description: 'Reads what is on screen and answers questions about it.' },
    camera: { label: 'Camera & navigation', description: 'Fly, zoom, move the camera, and track aircraft or vessels.' },
    display: { label: 'View & layers', description: 'Turn layers, panels, the HUD, visual styles, basemaps, and scenarios on or off.' },
    media: { label: 'Media (CCTV & radio)', description: 'Opens third-party CCTV video and internet radio streams.' },
    annotate: { label: 'Draw on the map', description: 'Draws marks, areas, and routes on the map, then removes them.' },
  },
  disableVoice: {
    title: 'Turn off the voice assistant?',
    impact: 'The mic button will refuse to start new sessions for all users. Sessions already running are not cut off. It can be turned on again at any time.',
    action: 'Turn off and save',
  },
  resetLimits: {
    title: 'Restore session limits to default?',
    impact: 'The three limits above are filled with the app defaults. Not saved until you press Save changes.',
    action: 'Restore default limits',
  },
  saved: 'Settings saved. New voice sessions use these settings; running sessions keep the old ones.',
});

export const PERSONA_COPY = Object.freeze({
  title: 'Persona',
  description: 'One fixed speaking style. The name and personality notes are on the General page; both always sit below the rules here.',
  loading: 'Loading persona',
  loadError: 'Persona could not be loaded',
  core: {
    title: 'Core rules',
    description: 'Always in effect and locked. Sent in every voice session. Rules labeled Prompt are instructions to the model only and can slip; the judge in the Server Log records off-topic answers.',
    summary: (rules, groups, backed) => `${rules} rules in ${groups} groups. ${backed} are also enforced by app code; the rest only by the voice prompt.`,
    group: (rules, backed) => (backed ? `${rules} rules · ${backed} enforced by code` : `${rules} rules`),
    forbid: 'Forbidden',
    instead: 'Instead',
    guards: { prompt: 'Prompt', 'prompt+code': 'Prompt + code' },
  },
  extra: {
    title: 'Extra rules',
    description: (max) => `Add up to ${max}. You can only add prohibitions; a rule that tries to loosen a core rule is ignored by the assistant.`,
    guidance: 'Write one specific prohibition and its concrete replacement. A vague prohibition is easy for the model to slip past.',
    emptyTitle: 'No extra rules yet',
    emptyDescription: 'The core rules already keep the assistant inside this console. Add rules if you need to narrow it further.',
    add: 'Add rule',
    remove: (index) => `Delete extra rule ${index}`,
    removeShort: 'Delete rule',
    ruleLabel: (index) => `Extra rule ${index}`,
    forbidLabel: 'Forbidden',
    insteadLabel: 'Instead',
    forbidPlaceholder: 'Example: Discussing football scores',
    insteadPlaceholder: 'Example: Decline in one sentence and offer map help',
    counter: (used, max) => `${used}/${max} characters`,
  },
  topics: {
    title: 'Topic restriction',
    description: 'The core rules already keep the assistant inside this console. This optional list narrows the conversation further. It is prompt-based (best effort); app commands and questions like "where is this" are never refused.',
    enabled: 'Restrict to these topics only',
    allowed: { label: 'Allowed topics', description: (max) => `One per line, at most ${max}.`, placeholder: 'Example: flights\nshipping\nweather' },
    refusal: { label: 'Refusal sentence', description: (max) => `One sentence, at most ${max} characters. Empty uses the default sentence.` },
  },
  validation: {
    topicsEmpty: 'Topic restriction is on: add at least one allowed topic (one per line).',
    ruleHalf: (index) => `Extra rule ${index}: fill in the Forbidden and Instead fields.`,
    ruleLong: (index, max) => `Extra rule ${index}: at most ${max} characters per field.`,
    tooMany: (max) => `At most ${max} extra rules.`,
  },
  reset: {
    button: 'Restore defaults',
    title: 'Restore persona to default?',
    impact: 'All extra rules are deleted and topic restriction is turned off. Core rules do not change. Not saved until you press Save changes.',
    action: 'Restore defaults',
  },
  saved: 'Persona saved. New voice sessions use these rules; running sessions keep the old ones.',
});

export const USAGE_AI_COPY = Object.freeze({
  title: 'Usage & Cost',
  description: 'Estimated from the mic\'s own meter, not an OpenAI bill.',
  loading: 'Loading AI usage',
  loadError: 'Usage & Cost could not be loaded',
  today: {
    title: 'Today',
    cost: 'Estimated cost',
    audio: 'Audio used',
    noLimit: (used) => `${used} used today. No daily limit.`,
    used: (used, daily) => `${used} of ${daily} minutes used today`,
    left: (left) => `${left} left.`,
    reached: 'Limit reached: new sessions are rejected until midnight.',
    meterLabel: 'Voice minutes today',
  },
  daily: {
    title: 'Daily usage',
    caption: 'Daily usage',
    range: 'Time range',
    rangeOption: (days) => `${days} days`,
    columns: { day: 'Day', sessions: 'Sessions', audio: 'Audio', extras: 'Screen reads', judge: 'Judge calls', cost: 'Estimated cost' },
    total: 'Total',
    emptyTitle: 'No usage yet',
    emptyDescription: 'There are no voice sessions in this time range.',
    session: (count) => `Sessions: ${count}`,
  },
  limits: {
    title: 'Cost limit per session',
    description: (warn, cap) => `Empty uses the built-in default (warning ${warn}, stop ${cap}). Enter "off" for no limit.`,
    effective: (warn, cap) => `In effect now: warning ${warn}, hard limit ${cap}.`,
    off: 'inactive',
    warn: { label: 'Warning (USD)', placeholder: 'Default' },
    cap: { label: 'Hard limit (USD)', placeholder: 'Default' },
    invalid: 'Cost limit: enter a dollar amount, "off", or leave empty for the built-in default.',
    save: 'Save limits',
    saved: 'Cost limits saved. They apply from the next voice session.',
  },
  rates: {
    title: 'Prices used for the estimate',
    description: (date) => `Rates checked on ${date}; compare with OpenAI's price at release time.`,
    live: (model, perMin) => `Live audio (${model}): $${perMin} per minute, billed per second.`,
    reader: (model, input, output) => `Screen reader (${model}): $${input} / $${output} per 1M input / output tokens.`,
    excluded: 'Not included: the delegated model backend and its tool calls, which OpenAI bills separately.',
    judge: (model, input, output, enabled) => `Off-topic judge (${model}): $${input} / $${output} per 1M input / output tokens, about $0.0002 per judged answer; ${enabled ? 'included in the daily table (Judge calls).' : 'currently off.'}`,
  },
});
